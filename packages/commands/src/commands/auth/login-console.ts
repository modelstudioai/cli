import { randomBytes } from "node:crypto";
import http from "node:http";

import {
  BailianError,
  ExitCode,
  validateConsoleAccessToken,
  type ConsoleGatewayTarget,
  type AuthPersistPatch,
  type AuthStore,
  type ConfigFile,
  type Identity,
  type LocalizedText,
  type Settings,
} from "bailian-cli-core";
import { listenLocalServer, openInBrowser } from "../shared/local-server.ts";
import { persistApiKey } from "./login-api-key.ts";

/** 登录流程的能力面:身份(UA)、有效配置(timeout 等)、auth 域落盘。 */
export interface LoginDeps {
  identity: Identity;
  settings: Settings;
  authStore: AuthStore;
  /** 缺省时用户可见新文案回退到 en-US。 */
  localize?: (text: LocalizedText) => string;
}

function localizeLogin(deps: LoginDeps, text: LocalizedText): string {
  if (typeof text === "string") return text;
  return deps.localize ? deps.localize(text) : text["en-US"];
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

/** 人工导入只接受管道中的原始 token，不把凭证放进 argv 或终端回显。 */
export async function runConsoleTokenLogin(
  deps: LoginDeps,
  target: Omit<ConsoleGatewayTarget, "token">,
): Promise<void> {
  const input = process.stdin;
  if (input.isTTY) {
    throw new BailianError(
      localizeLogin(deps, {
        "en-US":
          "Pipe a raw console access token to --token-stdin; interactive input is disabled to avoid echoing secrets.",
        "zh-CN":
          "请通过管道向 --token-stdin 输入原始控制台 access token；为避免凭证回显，不接受交互式输入。",
      }),
      ExitCode.USAGE,
    );
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of input) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += bytes.length;
    if (size > MAX_AUTH_CALLBACK_BODY) {
      throw new BailianError(
        localizeLogin(deps, {
          "en-US": "Console token input exceeds 64 KiB.",
          "zh-CN": "控制台 token 输入超过 64 KiB。",
        }),
        ExitCode.USAGE,
      );
    }
    chunks.push(bytes);
  }
  const token = Buffer.concat(chunks).toString("utf8").trim();
  if (!token || /[\s\p{Cc}]/u.test(token) || token.startsWith("{") || token.startsWith("[")) {
    throw new BailianError(
      localizeLogin(deps, {
        "en-US":
          "stdin must contain one raw console access token, without JSON or a Bearer prefix.",
        "zh-CN": "stdin 必须包含一个原始控制台 access token，不接受 JSON 或 Bearer 前缀。",
      }),
      ExitCode.USAGE,
    );
  }
  await validateConsoleAccessToken({ ...target, token }, deps.settings);
  await deps.authStore.login({
    access_token: token,
    console_site: target.site,
    console_region: target.region,
  });
  process.stderr.write(
    `${localizeLogin(deps, {
      "en-US": `Console token validated and saved to ${deps.authStore.path}`,
      "zh-CN": `控制台 token 已校验并保存至 ${deps.authStore.path}`,
    })}\n`,
  );
}

export async function runConsoleLogin(
  consoleOrigin: string,
  deps: LoginDeps,
  opts?: { needApiKey?: boolean; noBrowser?: boolean },
): Promise<void> {
  const state = randomBytes(16).toString("hex");
  let callbackError: unknown;
  let savedSessionWithoutApiKey = false;
  let savedCredentials = false;
  let savingCredentials = false;
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const server = http.createServer(async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Vary", "Origin, Access-Control-Request-Private-Network");
      const origin = req.headers.origin;
      if (origin !== undefined && origin !== consoleOrigin) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(
          localizeLogin(deps, { "en-US": "Origin not allowed\n", "zh-CN": "不允许的来源\n" }),
        );
        return;
      }
      if (origin === consoleOrigin) res.setHeader("Access-Control-Allow-Origin", consoleOrigin);
      if (req.method === "OPTIONS") {
        if (
          origin === consoleOrigin &&
          req.headers["access-control-request-private-network"] === "true"
        ) {
          res.setHeader("Access-Control-Allow-Private-Network", "true");
        }
        res.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        });
        res.end();
        return;
      }

      const u = new URL(req.url ?? "/", "http://127.0.0.1");
      if (u.searchParams.get("state") !== state) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(localizeLogin(deps, { "en-US": "bad state\n", "zh-CN": "无效的 state\n" }));
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

      if (finished || savingCredentials) {
        res.writeHead(409);
        res.end(
          localizeLogin(deps, {
            "en-US": "Login is no longer waiting for credentials\n",
            "zh-CN": "登录已不再等待凭证\n",
          }),
        );
        return;
      }
      if (!accessToken) {
        res.writeHead(400);
        res.end(
          localizeLogin(deps, {
            "en-US": "Missing access_token\n",
            "zh-CN": "缺少 access_token\n",
          }),
        );
        return;
      }

      savingCredentials = true;
      clearTimeout(timer);
      try {
        const callbackPatch: AuthPersistPatch = {
          access_token: accessToken || undefined,
          console_site: (consoleSite || undefined) as ConfigFile["console_site"],
          console_region: consoleRegion || undefined,
          console_switch_agent: consoleSwitchAgent ? Number(consoleSwitchAgent) : undefined,
          workspace_id: workspaceId || undefined,
        };
        if (apiKey) {
          await persistApiKey(deps, apiKey, {
            persistBaseUrl: baseUrl || undefined,
            persistPatch: callbackPatch,
          });
          process.stderr.write(
            `${localizeLogin(deps, {
              "en-US": `Config saved to ${deps.authStore.path}`,
              "zh-CN": `配置已保存至 ${deps.authStore.path}`,
            })}\n`,
          );
        } else {
          await deps.authStore.login({
            ...callbackPatch,
            base_url: baseUrl || undefined,
          });
          savedSessionWithoutApiKey = true;
          process.stderr.write(
            `${localizeLogin(deps, {
              "en-US": `Config saved to ${deps.authStore.path}`,
              "zh-CN": `配置已保存至 ${deps.authStore.path}`,
            })}\n`,
          );
        }
        savedCredentials = true;
      } catch (error: unknown) {
        callbackError = error;
      }
      finished = true;
      server.close();
      if (res.destroyed) {
        server.closeAllConnections();
        return;
      }
      res.once("finish", () => server.closeAllConnections());
      res.once("close", () => server.closeAllConnections());
      res.writeHead(callbackError ? 500 : 200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(
        callbackError
          ? localizeLogin(deps, {
              "en-US": "Failed to save credentials\n",
              "zh-CN": "凭证保存失败\n",
            })
          : "OK\n",
      );
    } catch {
      res.statusCode = 500;
      res.end();
    }
  });

  let port: number;
  try {
    port = await listenServerOnFreeLocalPort(server);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BailianError(
      localizeLogin(deps, {
        "en-US": `Could not bind to 127.0.0.1 (no free port or permission denied): ${message}`,
        "zh-CN": `无法监听 127.0.0.1（无可用端口或权限被拒绝）：${message}`,
      }),
      ExitCode.USAGE,
    );
  }

  let loginUrl = `${consoleOrigin}/console-login?notice=127.0.0.1:${port}?state=${encodeURIComponent(state)}`;
  if (opts?.needApiKey) {
    loginUrl += "&needapikey=true";
  }

  // 先注册完成事件，再打开浏览器，避免快速回调或打开程序挂起造成漏报。
  const completion = new Promise<void>((resolve, reject) => {
    server.once("close", resolve);
    server.once("error", reject);
    timer = setTimeout(() => {
      finished = true;
      callbackError = new BailianError(
        localizeLogin(deps, {
          "en-US": "Console login timed out: no credentials were received from the browser.",
          "zh-CN": "控制台登录超时：未收到浏览器回传的凭证。",
        }),
        ExitCode.TIMEOUT,
        localizeLogin(deps, {
          "en-US":
            "Check the site's local network permission, retry with --console --no-browser and open the URL in Firefox, or import a token with --console --token-stdin --console-region <region>.",
          "zh-CN":
            "请检查站点的本地网络权限，使用 --console --no-browser 重试并在 Firefox 打开地址，或使用 --console --token-stdin --console-region <region> 导入 token。",
        }),
      );
      server.close();
      server.closeAllConnections();
    }, CONSOLE_LOGIN_TIMEOUT_MS);
  });
  process.stderr.write(
    `${localizeLogin(deps, {
      "en-US": "Open this login URL in a browser on this machine:",
      "zh-CN": "请在本机浏览器中打开以下登录地址：",
    })}\n${loginUrl}\n${localizeLogin(deps, {
      "en-US":
        "Waiting up to 15 minutes for credentials. If blocked, check local network permission or open the same URL in Firefox. Press Ctrl+C to cancel.",
      "zh-CN":
        "最多等待 15 分钟接收凭证。如被拦截，请检查本地网络权限或在 Firefox 打开同一地址。按 Ctrl+C 取消。",
    })}\n`,
  );
  if (!opts?.noBrowser) {
    void openInBrowser(loginUrl).then(
      () => {
        if (!finished)
          process.stderr.write(
            `${localizeLogin(deps, {
              "en-US": "Opened the login page in your default browser.",
              "zh-CN": "已在默认浏览器打开登录页面。",
            })}\n`,
          );
      },
      () => {
        if (!finished)
          process.stderr.write(
            `${localizeLogin(deps, {
              "en-US": "Could not open the default browser. Open the URL above manually.",
              "zh-CN": "无法打开默认浏览器，请手动打开上方地址。",
            })}\n`,
          );
      },
    );
  }
  try {
    await completion;
  } finally {
    finished = true;
    clearTimeout(timer);
    server.close();
    server.closeAllConnections();
  }
  if (callbackError) throw callbackError;
  if (!savedCredentials) {
    throw new BailianError(
      localizeLogin(deps, {
        "en-US": "Console login ended without saving credentials.",
        "zh-CN": "控制台登录已结束，但未保存凭证。",
      }),
      ExitCode.GENERAL,
    );
  }

  if (opts?.needApiKey && savedSessionWithoutApiKey) {
    const binName = deps.identity.binName;
    process.stderr.write(
      `${localizeLogin(deps, {
        "en-US": `Saved the console session only. Model commands still need an API key: ${binName} auth login --console, or ${binName} auth login --api-key <key>`,
        "zh-CN": `仅保存了控制台会话。模型命令仍需要 API Key：${binName} auth login --console，或 ${binName} auth login --api-key <key>`,
      })}\n`,
    );
  }
}
