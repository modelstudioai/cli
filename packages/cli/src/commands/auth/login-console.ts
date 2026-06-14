import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import http from "node:http";

import {
  BailianError,
  ExitCode,
  getConfigPath,
  readConfigFile,
  writeConfigFile,
} from "bailian-cli-core";

const CONSOLE_LOGIN_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_AUTH_CALLBACK_BODY = 65536;

const DEFAULT_CONSOLE_ORIGIN = "https://bailian.console.aliyun.com";

export function resolveConsoleOrigin(): string {
  return process.env.BAILIAN_CONSOLE_ORIGIN || DEFAULT_CONSOLE_ORIGIN;
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
    const sep = part.match(/\r\n\r\n|\n\n/);
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

interface CallbackCredentials {
  accessToken: string | null;
  apiKey: string | null;
  baseUrl: string | null;
  consoleSite: string | null;
  consoleRegion: string | null;
  consoleSwitchAgent: string | null;
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

  const extras = {
    baseUrl: baseUrlFromQuery?.trim() || null,
    consoleSite: consoleSiteFromQuery?.trim() || null,
    consoleRegion: consoleRegionFromQuery?.trim() || null,
    consoleSwitchAgent: consoleSwitchAgentFromQuery?.trim() || null,
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
  return { accessToken, apiKey, ...extras };
}

function listenServerOnFreeLocalPort(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    const onErr = (e: Error) => reject(e);
    server.once("error", onErr);
    server.listen({ port: 0, host: "127.0.0.1", exclusive: true }, () => {
      server.off("error", onErr);
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Expected TCP socket address"));
        return;
      }
      resolve(addr.port);
    });
  });
}

function openInBrowser(url: string): Promise<void> {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];

  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function runConsoleLogin(
  consoleOrigin: string,
  opts?: { needApiKey?: boolean; onApiKey?: (key: string) => Promise<void> },
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

      const { accessToken, apiKey, baseUrl, consoleSite, consoleRegion, consoleSwitchAgent } =
        await extractCredentialsFromRequest(req);

      if (accessToken || apiKey || baseUrl || consoleSite || consoleRegion || consoleSwitchAgent) {
        try {
          const existing = readConfigFile() as Record<string, unknown>;
          let changed = false;

          if (accessToken) {
            existing.access_token = accessToken;
            changed = true;
          }
          if (baseUrl) {
            existing.base_url = baseUrl;
            changed = true;
          }
          if (consoleSite) {
            existing.console_site = consoleSite;
            changed = true;
          }
          if (consoleRegion) {
            existing.console_region = consoleRegion;
            changed = true;
          }
          if (consoleSwitchAgent) {
            existing.console_switch_agent = Number(consoleSwitchAgent);
            changed = true;
          }

          if (changed) {
            await writeConfigFile(existing);
            process.stderr.write(`Config saved to ${getConfigPath()}\n`);
          }

          if (apiKey && opts?.onApiKey) {
            await opts.onApiKey(apiKey);
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

      if (accessToken || apiKey || baseUrl || consoleSite || consoleRegion || consoleSwitchAgent) {
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
