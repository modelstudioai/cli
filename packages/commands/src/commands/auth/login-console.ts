import { randomBytes } from "node:crypto";
import http from "node:http";

import {
  BailianError,
  ExitCode,
  type AuthPersistPatch,
  type AuthStore,
  type ConfigFile,
  type Identity,
  type Settings,
} from "bailian-cli-core";
import { listenLocalServer, openInBrowser } from "../shared/local-server.ts";
import { validateAndPersistApiKey } from "./login-api-key.ts";

/** 登录流程的能力面:身份(UA)、有效配置(timeout 等)、auth 域落盘。 */
export interface LoginDeps {
  identity: Identity;
  settings: Settings;
  authStore: AuthStore;
}

const CONSOLE_LOGIN_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_AUTH_CALLBACK_BODY = 65536;
// Regex for double newline (\r\n\r\n or \n\n); built via RegExp to avoid
// literal multi-line splitting in source.
const REGEX_DOUBLE_NEWLINE = new RegExp("\r\n\r\n|\n\n");

const CONSOLE_ORIGINS: Record<string, string> = {
  domestic: "https://bailian.console.aliyun.com",
  international: "https://modelstudio.console.alibabacloud.com",
};

export function resolveConsoleOrigin(site?: string): string {
  return (site && CONSOLE_ORIGINS[site]) || CONSOLE_ORIGINS.domestic!;
}

function readBodyBounded(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_AUTH_CALLBACK_BODY) {
        reject(new Error("payload too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function requestContentType(req: http.IncomingMessage): string {
  const h = req.headers["content-type"];
  if (Array.isArray(h)) return h[0] ?? "";
  return typeof h === "string" ? h : "";
}

function multipartBoundary(contentType: string): string | null {
  const parts = contentType.split(";");
  for (const p of parts) {
    const s = p.trim();
    if (!s.toLowerCase().startsWith("boundary=")) continue;
    let b = s.slice("boundary=".length).trim();
    if ((b.startsWith('"') && b.endsWith('"')) || (b.startsWith("'") && b.endsWith("'"))) {
      b = b.slice(1, -1);
    }
    return b.length > 0 ? b : null;
  }
  return null;
}

function parseAccessTokenFromMultipart(raw: string, boundaryValue: string): string | null {
  const delim = `--${boundaryValue}`;
  const segments = raw.split(delim);
  for (let i = 1; i < segments.length; i++) {
    const part = segments[i]!;
    if (!/name\s*=\s*["'](?:access_token|accessToken)["']/i.test(part)) continue;
    const sep = part.match(REGEX_DOUBLE_NEWLINE);
    if (!sep || sep.index === undefined) continue;
    let value = part.slice(sep.index + sep[0].length);
    value = value
      .replace(/(?:\r\n)+$/g, "")
      .replace(/\n+$/g, "")
      .trim();
    if (value) return value;
  }
  return null;
}

function tokenFieldFromRecord(o: Record<string, unknown>): string | null {
  for (const k of ["access_token", "accessToken"]) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function apiKeyFieldFromRecord(o: Record<string, unknown>): string | null {
  for (const k of ["api_key", "apiKey"]) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function parseAccessTokenFromJsonText(text: string): string | null {
  let t = text.trim();
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  if (!t) return null;
  let j: unknown;
  try {
    j = JSON.parse(t);
  } catch {
    return null;
  }
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const o = j as Record<string, unknown>;
  const direct = tokenFieldFromRecord(o);
  if (direct) return direct;
  const data = o.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const inner = tokenFieldFromRecord(data as Record<string, unknown>);
    if (inner) return inner;
  }
  return null;
}

function parseAccessTokenFromRawBody(raw: string, contentType: string): string | null {
  const ct = contentType.toLowerCase();
  if (!raw.trim()) return null;

  if (ct.includes("multipart/form-data")) {
    const b = multipartBoundary(contentType);
    if (b) {
      const tok = parseAccessTokenFromMultipart(raw, b);
      if (tok) return tok;
    }
  }

  if (ct.includes("application/json") || ct.includes("text/json")) {
    const t = parseAccessTokenFromJsonText(raw);
    if (t) return t;
  }

  if (ct.includes("application/x-www-form-urlencoded")) {
    try {
      const params = new URLSearchParams(raw.trim());
      const v = params.get("access_token") ?? params.get("accessToken");
      if (v?.trim()) return v.trim();
    } catch {
      /* */
    }
  }

  // Fallbacks when Content-Type is missing or nonstandard (many fetch() callers omit it).
  const jsonTok = parseAccessTokenFromJsonText(raw);
  if (jsonTok) return jsonTok;
  try {
    const params = new URLSearchParams(raw.trim());
    const v = params.get("access_token") ?? params.get("accessToken");
    if (v?.trim()) return v.trim();
  } catch {
    /* */
  }
  const b = multipartBoundary(contentType);
  if (b) {
    const tok = parseAccessTokenFromMultipart(raw, b);
    if (tok) return tok;
  }
  return null;
}

function parseApiKeyFromJsonText(text: string): string | null {
  let t = text.trim();
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  if (!t) return null;
  let j: unknown;
  try {
    j = JSON.parse(t);
  } catch {
    return null;
  }
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const o = j as Record<string, unknown>;
  const direct = apiKeyFieldFromRecord(o);
  if (direct) return direct;
  const data = o.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const inner = apiKeyFieldFromRecord(data as Record<string, unknown>);
    if (inner) return inner;
  }
  return null;
}

function parseApiKeyFromRawBody(raw: string, contentType: string): string | null {
  const ct = contentType.toLowerCase();
  if (!raw.trim()) return null;

  if (ct.includes("application/json") || ct.includes("text/json")) {
    const t = parseApiKeyFromJsonText(raw);
    if (t) return t;
  }

  if (ct.includes("application/x-www-form-urlencoded")) {
    try {
      const params = new URLSearchParams(raw.trim());
      const v = params.get("api_key") ?? params.get("apiKey");
      if (v?.trim()) return v.trim();
    } catch {
      /* */
    }
  }

  const jsonTok = parseApiKeyFromJsonText(raw);
  if (jsonTok) return jsonTok;
  try {
    const params = new URLSearchParams(raw.trim());
    const v = params.get("api_key") ?? params.get("apiKey");
    if (v?.trim()) return v.trim();
  } catch {
    /* */
  }
  return null;
}

type CallbackExtras = Pick<
  CallbackCredentials,
  "baseUrl" | "consoleSite" | "consoleRegion" | "consoleSwitchAgent" | "workspaceId"
>;

function stringField(o: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function parseExtrasFromRawBody(raw: string, contentType: string): CallbackExtras {
  const empty: CallbackExtras = {
    baseUrl: null,
    consoleSite: null,
    consoleRegion: null,
    consoleSwitchAgent: null,
    workspaceId: null,
  };
  if (!raw.trim()) return empty;

  let obj: Record<string, unknown> | null = null;

  const ct = contentType.toLowerCase();
  if (ct.includes("application/json") || ct.includes("text/json")) {
    try {
      const parsed = JSON.parse(raw.trim());
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) obj = parsed;
    } catch {
      /* */
    }
  }
  if (!obj && ct.includes("application/x-www-form-urlencoded")) {
    try {
      const params = new URLSearchParams(raw.trim());
      obj = Object.fromEntries(params);
    } catch {
      /* */
    }
  }
  if (!obj) {
    try {
      const parsed = JSON.parse(raw.trim());
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) obj = parsed;
    } catch {
      /* */
    }
  }

  if (!obj) return empty;

  return {
    baseUrl: stringField(obj, "base_url", "baseUrl"),
    consoleSite: stringField(obj, "console_site", "consoleSite"),
    consoleRegion: stringField(obj, "console_region", "consoleRegion"),
    consoleSwitchAgent: stringField(obj, "console_switch_agent", "consoleSwitchAgent"),
    workspaceId: stringField(obj, "workspace_id", "workspaceId"),
  };
}

interface CallbackCredentials {
  accessToken: string | null;
  apiKey: string | null;
  baseUrl: string | null;
  consoleSite: string | null;
  consoleRegion: string | null;
  consoleSwitchAgent: string | null;
  workspaceId: string | null;
}

async function extractCredentialsFromRequest(
  req: http.IncomingMessage,
): Promise<CallbackCredentials> {
  const u = new URL(req.url ?? "/", "http://127.0.0.1");
  const accessTokenFromQuery =
    u.searchParams.get("access_token") ?? u.searchParams.get("accessToken");
  const apiKeyFromQuery = u.searchParams.get("api_key") ?? u.searchParams.get("apiKey");
  const baseUrlFromQuery = u.searchParams.get("base_url") ?? u.searchParams.get("baseUrl");
  const consoleSiteFromQuery =
    u.searchParams.get("console_site") ?? u.searchParams.get("consoleSite");
  const consoleRegionFromQuery =
    u.searchParams.get("console_region") ?? u.searchParams.get("consoleRegion");
  const consoleSwitchAgentFromQuery =
    u.searchParams.get("console_switch_agent") ?? u.searchParams.get("consoleSwitchAgent");
  const workspaceIdFromQuery =
    u.searchParams.get("workspace_id") ?? u.searchParams.get("workspaceId");

  const extras = {
    baseUrl: baseUrlFromQuery?.trim() || null,
    consoleSite: consoleSiteFromQuery?.trim() || null,
    consoleRegion: consoleRegionFromQuery?.trim() || null,
    consoleSwitchAgent: consoleSwitchAgentFromQuery?.trim() || null,
    workspaceId: workspaceIdFromQuery?.trim() || null,
  };

  const m = req.method ?? "GET";
  if (m !== "POST" && m !== "PUT" && m !== "PATCH") {
    return {
      accessToken: accessTokenFromQuery?.trim() || null,
      apiKey: apiKeyFromQuery?.trim() || null,
      ...extras,
    };
  }

  const contentType = requestContentType(req);
  let raw: string;
  try {
    raw = await readBodyBounded(req);
  } catch {
    return {
      accessToken: accessTokenFromQuery?.trim() || null,
      apiKey: apiKeyFromQuery?.trim() || null,
      ...extras,
    };
  }

  const accessToken = accessTokenFromQuery?.trim() || parseAccessTokenFromRawBody(raw, contentType);
  const apiKey = apiKeyFromQuery?.trim() || parseApiKeyFromRawBody(raw, contentType);

  const bodyExtras = parseExtrasFromRawBody(raw, contentType);

  return {
    accessToken,
    apiKey,
    baseUrl: extras.baseUrl || bodyExtras.baseUrl,
    consoleSite: extras.consoleSite || bodyExtras.consoleSite,
    consoleRegion: extras.consoleRegion || bodyExtras.consoleRegion,
    consoleSwitchAgent: extras.consoleSwitchAgent || bodyExtras.consoleSwitchAgent,
    workspaceId: extras.workspaceId || bodyExtras.workspaceId,
  };
}

function listenServerOnFreeLocalPort(server: http.Server): Promise<number> {
  return listenLocalServer(server);
}

export async function runConsoleLogin(
  consoleOrigin: string,
  deps: LoginDeps,
  opts?: { needApiKey?: boolean },
): Promise<void> {
  const state = randomBytes(16).toString("hex");
  let callbackError: unknown;
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        });
        res.end();
        return;
      }

      const u = new URL(req.url ?? "/", "http://127.0.0.1");
      if (u.searchParams.get("state") !== state) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("bad state\n");
        return;
      }

      const {
        accessToken,
        apiKey,
        baseUrl,
        consoleSite,
        consoleRegion,
        consoleSwitchAgent,
        workspaceId,
      } = await extractCredentialsFromRequest(req);

      const hasConfig =
        accessToken || baseUrl || consoleSite || consoleRegion || consoleSwitchAgent || workspaceId;

      if (hasConfig || apiKey) {
        try {
          const callbackPatch: AuthPersistPatch = {
            access_token: accessToken || undefined,
            console_site: (consoleSite || undefined) as ConfigFile["console_site"],
            console_region: consoleRegion || undefined,
            console_switch_agent: consoleSwitchAgent ? Number(consoleSwitchAgent) : undefined,
            workspace_id: workspaceId || undefined,
          };
          if (apiKey) {
            const testBaseUrl = baseUrl || deps.authStore.resolveBaseUrl();
            await validateAndPersistApiKey(deps, apiKey, {
              baseUrl: testBaseUrl,
              persistBaseUrl: baseUrl || undefined,
              persistPatch: callbackPatch,
            });
            process.stderr.write(`Config saved to ${deps.authStore.path}\n`);
          } else if (hasConfig) {
            await deps.authStore.login({
              ...callbackPatch,
              base_url: baseUrl || undefined,
            });
            process.stderr.write(`Config saved to ${deps.authStore.path}\n`);
          }
        } catch (err: unknown) {
          callbackError = err;
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Failed to save credentials\n");
          server.close();
          return;
        }
      }

      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      });
      res.end("OK\n");

      if (hasConfig || apiKey) {
        server.close();
      }
    } catch {
      res.statusCode = 500;
      res.end();
    }
  });

  let port: number;
  try {
    port = await listenServerOnFreeLocalPort(server);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new BailianError(
      `Could not bind to 127.0.0.1 (no free port or permission denied): ${msg}`,
      ExitCode.USAGE,
    );
  }

  let loginUrl = `${consoleOrigin}/console-login?notice=127.0.0.1:${port}?state=${encodeURIComponent(state)}`;
  if (opts?.needApiKey) {
    loginUrl += "&needapikey=true";
  }

  try {
    await openInBrowser(loginUrl);
    process.stderr.write(
      "Opened the login page in your default browser. This process keeps the local port open for the console; press Ctrl+C when finished (or wait for idle timeout).\n",
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(
      `Could not open the default browser (${msg}). Open this URL manually:\n\n`,
    );
    process.stdout.write(`${loginUrl}\n`);
    process.stderr.write(
      "\nThis process keeps the local port open for the console; press Ctrl+C when finished (or wait for idle timeout).\n",
    );
  }

  await new Promise<void>((resolve, reject) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      server.close();
    }, CONSOLE_LOGIN_TIMEOUT_MS);

    server.once("close", done);
    server.once("error", (err) => {
      clearTimeout(timer);
      if (!finished) {
        finished = true;
        reject(err);
      }
    });
  });

  if (callbackError) {
    throw callbackError;
  }
}
