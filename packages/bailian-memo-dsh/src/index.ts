/**
 * Bailian personal-memory plugin for DeepSeek Harness (dsh 0.2.1+).
 * @module bailian-memo-dsh
 */

import type { Context } from "@deepseek-ai/cordis";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { Config, resolveConfig } from "./config.js";
import { MemoryClient } from "./memory-client.js";
import { readBlCliConfig } from "./bl-cli.js";
import { consoleLoginState, startConsoleLogin } from "./console-login.js";
import { applyCredentialAutofill, credentialSourceCategory } from "./credential-autofill.js";
import {
  beginEnable,
  markPaused,
  readPersonalMemoryConfig,
  writePersonalMemoryConfig,
} from "./personal-config.js";
import { ensureInitialized, resumeAndEnsure } from "./initialize.js";
import { memoProjectionDefinition } from "./projection.js";
import { installAutomaticRecall } from "./recall.js";
import { installAuxiliaryCurator } from "./curator.js";
import { installTaskPoller, openTaskStore } from "./task-store.js";
import { registerMemoTools } from "./tools.js";

export { Config, MEMO_SETTINGS_NAMESPACE } from "./config.js";
export { name } from "./plugin-meta.js";

interface WebRoute {
  kind: "exact" | "prefix";
  path: string;
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    webServer: {
      register(route: WebRoute): () => void;
    };
    connection: {
      requestRejection(request: {
        readonly headers: IncomingMessage["headers"];
      }): 401 | 403 | undefined;
    };
  }
}

export const inject = [
  "tools",
  "credentials",
  "llm",
  "agents",
  "sessionProjections",
  "storageDomain",
  "webServer",
  "connection",
];

function json(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function guard(ctx: Context, req: IncomingMessage, response: ServerResponse): boolean {
  const rejection = ctx.connection.requestRejection(req);
  if (rejection !== undefined) {
    response.statusCode = rejection;
    response.end();
    return false;
  }
  return true;
}

export async function apply(ctx: Context, config: Config): Promise<void> {
  const resolved = () => resolveConfig(config);

  // Custom Plugins settings page owns the UI; disable the auto-generated form
  // when the Host settings service is composed (optional soft dependency).
  const settingsService = ctx.get("settings") as
    | { configure: (options: { auto: false }, fiber: unknown) => () => void }
    | undefined;
  if (settingsService) {
    ctx.effect(
      () => settingsService.configure({ auto: false }, ctx.fiber),
      "bailian-memo: disable auto settings form",
    );
  }

  // One-time seed of API key from bl CLI when credentials are empty.
  try {
    const existing = await ctx.credentials.resolve(credentialRef("DASHSCOPE_API_KEY"));
    if (!existing) {
      const bl = readBlCliConfig();
      if (bl.apiKey) {
        await ctx.credentials.set(credentialRef("DASHSCOPE_API_KEY"), bl.apiKey);
      }
    }
  } catch {
    /* best-effort */
  }

  const client = new MemoryClient({
    resolveApiKey: async () => {
      const resolvedKey = await ctx.credentials.resolve(credentialRef("DASHSCOPE_API_KEY"));
      if (!resolvedKey?.value) {
        throw new Error(
          "DASHSCOPE_API_KEY is not configured. Sign in from the Bailian Memory settings page or set the credential.",
        );
      }
      return resolvedKey.value;
    },
    resolveWorkspaceId: async () => {
      const personal = await readPersonalMemoryConfig();
      if (personal.workspace_id) return personal.workspace_id;
      const bl = readBlCliConfig();
      if (bl.workspaceId) return bl.workspaceId;
      throw new Error("workspace_id is not configured for personal memory");
    },
    resolveEndpointHost: () => resolved().endpointHost,
  });

  const store = await openTaskStore(ctx);
  installTaskPoller(ctx, store, client);

  ctx.sessionProjections.register(memoProjectionDefinition);

  installAutomaticRecall(ctx, { client, resolveConfig: resolved });
  installAuxiliaryCurator(ctx, { client, store, resolveConfig: resolved });
  registerMemoTools(ctx, { client, store, resolveConfig: resolved });

  // Host routes for settings page autofill / enable / status (not the obsolete /settings bridge).
  {
    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: "exact",
          path: "/plugins/bailian-memo-dsh/status",
          handler: async (req, response) => {
            if (!guard(ctx, req, response)) return;
            if (req.method !== "GET") return json(response, 405, { error: "method not allowed" });
            const personal = await readPersonalMemoryConfig();
            const apiKey = await ctx.credentials.describe(credentialRef("DASHSCOPE_API_KEY"));
            const recent = await store.listRecent(10);
            json(response, 200, {
              personal,
              apiKey: {
                configured: apiKey.configured,
                source: credentialSourceCategory(apiKey.source),
                writable: apiKey.writable,
              },
              consoleLogin: consoleLoginState(),
              plugin: resolved(),
              recentTasks: recent,
            });
          },
        }),
      "bailian-memo: status route",
    );

    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: "exact",
          path: "/plugins/bailian-memo-dsh/enable",
          handler: async (req, response) => {
            if (!guard(ctx, req, response)) return;
            if (req.method !== "POST") return json(response, 405, { error: "method not allowed" });
            try {
              const body = await readJsonBody(req);
              const workspaceId =
                typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
              if (!workspaceId) {
                return json(response, 400, { error: "workspaceId required" });
              }
              await beginEnable({ workspaceId });
              const personal = await ensureInitialized(client, {
                workspaceId,
                consent: true,
              });
              json(response, 200, { personal });
            } catch (error) {
              json(response, 500, {
                error: error instanceof Error ? error.message : "enable failed",
              });
            }
          },
        }),
      "bailian-memo: enable route",
    );

    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: "exact",
          path: "/plugins/bailian-memo-dsh/pause",
          handler: async (req, response) => {
            if (!guard(ctx, req, response)) return;
            if (req.method !== "POST") return json(response, 405, { error: "method not allowed" });
            const personal = await markPaused("settings-pause");
            json(response, 200, { personal });
          },
        }),
      "bailian-memo: pause route",
    );

    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: "exact",
          path: "/plugins/bailian-memo-dsh/resume",
          handler: async (req, response) => {
            if (!guard(ctx, req, response)) return;
            if (req.method !== "POST") return json(response, 405, { error: "method not allowed" });
            try {
              const personal = await resumeAndEnsure(client);
              json(response, 200, { personal });
            } catch (error) {
              json(response, 500, {
                error: error instanceof Error ? error.message : "resume failed",
              });
            }
          },
        }),
      "bailian-memo: resume route",
    );

    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: "exact",
          path: "/plugins/bailian-memo-dsh/console-login",
          handler: async (req, response) => {
            if (!guard(ctx, req, response)) return;
            if (req.method === "GET") {
              return json(response, 200, consoleLoginState());
            }
            if (req.method !== "POST") {
              return json(response, 405, { error: "method not allowed" });
            }
            try {
              const body = await readJsonBody(req);
              const site = body.site === "international" ? "international" : "domestic";
              await startConsoleLogin({
                site,
                onComplete: async (credentials) => {
                  const apiKeyRef = credentialRef("DASHSCOPE_API_KEY");
                  return applyCredentialAutofill(credentials, {
                    describeApiKey: () => ctx.credentials.describe(apiKeyRef),
                    resolveApiKey: () => ctx.credentials.resolve(apiKeyRef),
                    readPersonal: () => readPersonalMemoryConfig(),
                    writeApiKey: (value) => ctx.credentials.set(apiKeyRef, value),
                    unsetApiKey: () => ctx.credentials.unset(apiKeyRef),
                    writePersonal: (personal) => writePersonalMemoryConfig(personal),
                    verify: async ({ apiKey, workspaceId }) => {
                      const personal = await readPersonalMemoryConfig();
                      const verificationClient = new MemoryClient({
                        resolveApiKey: async () => apiKey,
                        resolveWorkspaceId: async () => workspaceId,
                        resolveEndpointHost: () => resolved().endpointHost,
                      });
                      await verificationClient.list({
                        userId: personal.user_id ?? randomUUID(),
                        pageSize: 1,
                      });
                    },
                  });
                },
              });
              json(response, 200, consoleLoginState());
            } catch (error) {
              json(response, 500, {
                error: error instanceof Error ? error.message : "login failed",
              });
            }
          },
        }),
      "bailian-memo: console-login route",
    );
  }

  // Best-effort resume of interrupted initializing state on plugin load.
  void resumeAndEnsure(client).catch(() => undefined);
}
