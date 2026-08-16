/**
 * `bailian-cli-dsh/tokenplan-usage` (Host half): provides two webServer
 * routes for the Client's "Bailian" settings page:
 *
 * 1. `POST /api/bailian/credentials` — saves AK/SK to the dedicated `dsh`
 *    bl profile via `bl auth login --open-api --config dsh`. This generates
 *    a fresh access_token and stores AK/SK + token in the profile. All
 *    subsequent console calls read this profile.
 *
 * 2. `POST /api/bailian/tokenplan/usage` — fetches personal-edition
 *    TokenPlan usage (3 console APIs) using the `dsh` profile credentials.
 *    Takes only `{ region, site }`; AK/SK are already saved in the profile.
 *
 * Configuration UX: users save AK/SK once on the settings page. All future
 * Bailian plugins reuse the same `dsh` profile credentials.
 *
 * @module bailian-cli-dsh/tokenplan-usage
 */
import type { Context } from "@deepseek-ai/cordis";
import type { IncomingMessage, ServerResponse } from "node:http";
import { runBl } from "../shared/bl.ts";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type { JsonValue } from "@deepseek-ai/dsh-session";
import { FEATURES, featureById, type FeatureParam } from "../features.ts";
import z from "@deepseek-ai/schemastery";

/** Cordis plugin name used by loader diagnostics. */
export const name = "bailian-tokenplan-usage";

/** Hard deps: bl via subprocess; routes need webServer; feature tools need tools. */
export const inject = ["subprocess", "webServer", "tools"];

export interface Config {
  /** Alibaba Cloud Access Key ID. Fallback when not provided via UI. */
  accessKeyId?: string;
  /** Alibaba Cloud Access Key Secret. Fallback when not provided via UI. */
  accessKeySecret?: string;
  /** Console gateway region (default: cn-beijing). */
  consoleRegion?: string;
  /** Console site: domestic or international (default: domestic). */
  consoleSite?: "domestic" | "international";
  /** Dedicated bl config profile name (default: dsh). */
  profile?: string;
}

export const Config = z.object({
  accessKeyId: z.string().description("Alibaba Cloud Access Key ID (fallback)."),
  accessKeySecret: z.string().description("Alibaba Cloud Access Key Secret (fallback)."),
  consoleRegion: z.string().description("Console gateway region (default: cn-beijing)."),
  consoleSite: z.string().description("Console site: domestic or international."),
  profile: z.string().description("Dedicated bl config profile name (default: dsh)."),
});

/** Personal-edition console API names (from bailian-tokenplan frontend). */
const PERSONAL_USAGE_API = "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage";
const PERSONAL_SUBSCRIPTION_API = "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/subscription";
const PERSONAL_ADDON_SUMMARY_API = "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/addon/summary";

const PERSONAL_SUB_COMMODITY_CN = "sfm_tokenplansolo_public_cn";
const PERSONAL_SUB_COMMODITY_INTL = "sfm_tokenplansolo_public_intl";
const PERSONAL_ADDON_COMMODITY_CN = "sfm_tokenplansoloaddon_public_cn";
const PERSONAL_ADDON_COMMODITY_INTL = "sfm_tokenplansoloaddon_public_intl";

const CREDENTIALS_ROUTE = "/bailian/credentials";
const USAGE_ROUTE = "/bailian/tokenplan/usage";
const CONSOLE_ROUTE = "/bailian/console";
const BL_LOGIN_TIMEOUT_MS = 30_000;
const BL_CALL_TIMEOUT_MS = 90_000;
const BL_LOGIN_GRACE_MS = 20_000;
const BL_CALL_GRACE_MS = 60_000;
const DEFAULT_PROFILE = "dsh";

interface FetchResult {
  usage: unknown;
  subscription: unknown;
  addonSummary: unknown;
  errors: Array<{ api: string; message: string }>;
}

/** Extract the business payload from a console gateway response. */
function extractData(response: unknown): unknown {
  if (response === null || typeof response !== "object") return response;
  const outer = (response as Record<string, unknown>).data;
  if (outer !== null && typeof outer === "object") {
    const dataV2 = (outer as Record<string, unknown>).DataV2;
    if (dataV2 !== null && typeof dataV2 === "object") {
      const inner = (dataV2 as Record<string, unknown>).data;
      if (inner !== null && typeof inner === "object") {
        const payload = (inner as Record<string, unknown>).data;
        if (payload !== undefined) return payload;
        return inner;
      }
    }
    const fallback = (outer as Record<string, unknown>).data;
    if (fallback !== undefined) return fallback;
  }
  return response;
}

/** Read a UTF-8 POST body up to a size limit. */
function readJsonBody(req: IncomingMessage, maxBytes: number = 8192): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error("request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (text.length === 0) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/** Send a JSON response with a status code. */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

export function apply(ctx: Context, config: Config): void {
  const webServer = ctx.get("webServer");
  if (webServer === undefined) return;

  const profile = config.profile || DEFAULT_PROFILE;

  /** Save AK/SK to the dsh profile (bl auth login --open-api --config dsh). */
  async function saveCredentials(accessKeyId: string, accessKeySecret: string): Promise<void> {
    const loginArgs = [
      "auth",
      "login",
      "--open-api",
      "--config",
      profile,
      "--access-key-id",
      accessKeyId,
      "--access-key-secret",
      accessKeySecret,
    ];
    const loginOutcome = await runBl(ctx, loginArgs, {
      cwd: process.cwd(),
      signal: AbortSignal.timeout(BL_LOGIN_TIMEOUT_MS),
      graceMs: BL_LOGIN_GRACE_MS,
    });
    if (loginOutcome.exitCode !== 0) {
      const reason =
        loginOutcome.stderr.trim() || loginOutcome.stdout.trim() || `exit ${loginOutcome.exitCode}`;
      throw new Error(`bl auth login failed: ${reason}`);
    }
  }

  /** Call a console API using the dsh profile (credentials already saved). */
  async function consoleCall(
    region: string,
    site: string,
    api: string,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    const callArgs = [
      "console",
      "call",
      "--config",
      profile,
      "--api",
      api,
      "--data",
      JSON.stringify(data),
      "--console-region",
      region,
      "--console-site",
      site,
      "--output",
      "json",
    ];
    const callOutcome = await runBl(ctx, callArgs, {
      cwd: process.cwd(),
      signal: AbortSignal.timeout(BL_CALL_TIMEOUT_MS),
      graceMs: BL_CALL_GRACE_MS,
    });
    if (callOutcome.exitCode !== 0) {
      const reason =
        callOutcome.stderr.trim() || callOutcome.stdout.trim() || `exit ${callOutcome.exitCode}`;
      throw new Error(`bl console call failed (${api}): ${reason}`);
    }
    try {
      return JSON.parse(callOutcome.stdout);
    } catch {
      return { raw: callOutcome.stdout };
    }
  }

  /** Fetch all personal-edition TokenPlan usage (3 console calls). */
  async function fetchUsage(region: string, site: string): Promise<FetchResult> {
    const isIntl = site === "international";
    const subCommodity = isIntl ? PERSONAL_SUB_COMMODITY_INTL : PERSONAL_SUB_COMMODITY_CN;
    const addonCommodity = isIntl ? PERSONAL_ADDON_COMMODITY_INTL : PERSONAL_ADDON_COMMODITY_CN;

    const errors: Array<{ api: string; message: string }> = [];
    let usage = null;
    let subscription = null;
    let addonSummary = null;

    try {
      usage = extractData(await consoleCall(region, site, PERSONAL_USAGE_API, {}));
    } catch (error) {
      errors.push({
        api: "usage",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    try {
      subscription = extractData(
        await consoleCall(region, site, PERSONAL_SUBSCRIPTION_API, {
          queryInstanceInfoRequest: { commodityCode: subCommodity },
        }),
      );
    } catch (error) {
      errors.push({
        api: "subscription",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    try {
      addonSummary = extractData(
        await consoleCall(region, site, PERSONAL_ADDON_SUMMARY_API, {
          commodityCode: addonCommodity,
        }),
      );
    } catch (error) {
      errors.push({
        api: "addonSummary",
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return { usage, subscription, addonSummary, errors };
  }

  // Route 1: Save credentials to the dsh bl profile.
  ctx.effect(() =>
    webServer.register({
      kind: "exact",
      path: CREDENTIALS_ROUTE,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { error: "method not allowed, use POST" });
          return;
        }
        let body: Record<string, unknown>;
        try {
          body = (await readJsonBody(req)) as Record<string, unknown>;
        } catch (error) {
          sendJson(res, 400, { error: error instanceof Error ? error.message : "bad request" });
          return;
        }
        const accessKeyId = (body.accessKeyId as string) || config.accessKeyId;
        const accessKeySecret = (body.accessKeySecret as string) || config.accessKeySecret;
        if (!accessKeyId || !accessKeySecret) {
          sendJson(res, 400, { error: "accessKeyId and accessKeySecret are required." });
          return;
        }
        try {
          await saveCredentials(accessKeyId, accessKeySecret);
          sendJson(res, 200, { ok: true, profile });
        } catch (error) {
          sendJson(res, 500, { error: error instanceof Error ? error.message : "internal error" });
        }
      },
    }),
  );

  // Route 2: Fetch TokenPlan usage using the dsh profile credentials.
  ctx.effect(() =>
    webServer.register({
      kind: "exact",
      path: USAGE_ROUTE,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { error: "method not allowed, use POST" });
          return;
        }
        let body: Record<string, unknown>;
        try {
          body = (await readJsonBody(req)) as Record<string, unknown>;
        } catch (error) {
          sendJson(res, 400, { error: error instanceof Error ? error.message : "bad request" });
          return;
        }
        // If AK/SK are provided in the body, save them first (auto-provision).
        const bodyKeyId = (body.accessKeyId as string) || undefined;
        const bodyKeySecret = (body.accessKeySecret as string) || undefined;
        if (bodyKeyId && bodyKeySecret) {
          try {
            await saveCredentials(bodyKeyId, bodyKeySecret);
          } catch (error) {
            sendJson(res, 500, {
              error: error instanceof Error ? error.message : "credential save failed",
            });
            return;
          }
        }
        const region = (body.region as string) || config.consoleRegion || "cn-beijing";
        const site = (body.site as string) || config.consoleSite || "domestic";
        try {
          const result = await fetchUsage(region, site);
          sendJson(res, 200, result);
        } catch (error) {
          sendJson(res, 500, { error: error instanceof Error ? error.message : "internal error" });
        }
      },
    }),
  );

  // ── Feature layer: reuse bailian-cli commands as model tools + a generic route ──

  /** Run a feature's `bl` command with the dsh profile; returns parsed JSON. */
  async function invokeFeature(
    feature: (typeof FEATURES)[number],
    params?: Record<string, unknown>,
  ): Promise<JsonValue> {
    const extra: string[] = [];
    for (const pf of feature.paramFlags ?? []) {
      const val = params?.[pf.name];
      if (val !== undefined && val !== null && val !== "") extra.push(pf.flag, String(val));
    }
    if (extra.length === 0 && feature.defaultArgs) extra.push(...feature.defaultArgs);
    const args = [...feature.argv, ...extra, "--config", profile, "--output", "json"];
    const outcome = await runBl(ctx, args, {
      cwd: process.cwd(),
      signal: AbortSignal.timeout(BL_CALL_TIMEOUT_MS),
      graceMs: BL_CALL_GRACE_MS,
    });
    if (outcome.exitCode !== 0) {
      const reason = outcome.stderr.trim() || outcome.stdout.trim() || `exit ${outcome.exitCode}`;
      throw new Error(`bl ${feature.argv.join(" ")} failed: ${reason}`);
    }
    try {
      return JSON.parse(outcome.stdout);
    } catch {
      return { raw: outcome.stdout };
    }
  }

  // Natural-language entry: one model tool per feature.
  const tools = ctx.get("tools");
  if (tools !== undefined) {
    for (const feature of FEATURES) {
      // Keep FeatureParam's literal `type` union: widening it to `string`
      // makes the map unassignable to ParameterSchemaSpec.
      const parameters: Record<string, { type: FeatureParam["type"]; description: string }> = {};
      for (const pf of feature.paramFlags ?? []) {
        parameters[pf.name] = { type: pf.type, description: pf.description };
      }
      ctx.effect(() =>
        tools.register(
          defineTool({
            name: `bailian_${feature.id}`,
            description: `${feature.title}。${feature.intent}`,
            parameters,
            output: {
              schema: { type: "object", additionalProperties: true },
              render: (_a, value) => [
                { type: "text", text: String((value as any).summary ?? JSON.stringify(value)) },
              ],
            },
            async execute(args) {
              const data = await invokeFeature(feature, args as Record<string, unknown>);
              return { summary: feature.summarize(data), data };
            },
          }),
        ),
      );
    }
  }

  // Card-click entry: generic route dispatching to a feature by id.
  ctx.effect(() =>
    webServer.register({
      kind: "exact",
      path: CONSOLE_ROUTE,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { error: "method not allowed, use POST" });
          return;
        }
        let body: Record<string, unknown>;
        try {
          body = (await readJsonBody(req)) as Record<string, unknown>;
        } catch (error) {
          sendJson(res, 400, { error: error instanceof Error ? error.message : "bad request" });
          return;
        }
        const feature = featureById(String(body.featureId ?? ""));
        if (feature === undefined) {
          sendJson(res, 400, { error: `unknown featureId: ${String(body.featureId)}` });
          return;
        }
        try {
          const data = await invokeFeature(
            feature,
            body.params as Record<string, unknown> | undefined,
          );
          sendJson(res, 200, { summary: feature.summarize(data), data });
        } catch (error) {
          sendJson(res, 500, { error: error instanceof Error ? error.message : "internal error" });
        }
      },
    }),
  );
}
