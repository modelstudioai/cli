/**
 * Self-contained Bailian console login: the plugin drives the console's browser
 * login itself and persists what comes back, rather than shelling out to the
 * `bl` CLI.
 *
 * Driving the flow here lets it always request a freshly issued api key, so the
 * key and the workspace id both come from the account that just signed in, and
 * the values land straight in the dsh stores.
 *
 * Shape of the flow: bind a loopback-only port, open the console login page
 * pointed at that port, then accept one callback carrying the credentials as
 * query parameters or a JSON / form-encoded body.
 */

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import http from "node:http";

/** Console web origins by site, keyed as the CLI's `--console-site` values. */
const CONSOLE_ORIGINS: Record<string, string> = {
  domestic: "https://bailian.console.aliyun.com",
  international: "https://modelstudio.console.alibabacloud.com",
};

/** How long the loopback listener waits for the browser callback. */
const LOGIN_TIMEOUT_MS = 15 * 60 * 1000;

/** Upper bound on a callback body. */
const MAX_CALLBACK_BODY = 65536;

/** Credentials the console callback can carry. */
export interface ConsoleLoginCredentials {
  /** Freshly issued DashScope api key. */
  apiKey?: string;
  /** Workspace id of the account that signed in. */
  workspaceId?: string;
}

/**
 * Where the login flow stands. Deliberately carries no secret: the plain key
 * is handed to the completion callback and never retained here, so polling
 * this state from the browser cannot leak it.
 */
export type ConsoleLoginState =
  | { phase: "idle" }
  | { phase: "waiting"; loginUrl: string }
  | { phase: "done"; fields: string[] }
  | { phase: "failed"; reason: string };

/** The single in-flight flow: one browser login at a time. */
let active: { server: http.Server } | undefined;
let state: ConsoleLoginState = { phase: "idle" };

/** Read the current flow state (safe to expose to the panel). */
export function consoleLoginState(): ConsoleLoginState {
  return state;
}

/** Pick the first non-blank string among the given keys. */
function stringField(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return undefined;
}

/** Read a bounded UTF-8 request body; an oversized body reads as empty. */
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_CALLBACK_BODY) {
        req.destroy();
        resolve("");
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", () => {
      resolve("");
    });
  });
}

/**
 * Parse a callback body as JSON (optionally wrapped in `data`) or as form
 * encoding. Content-type is a hint only: both shapes occur in practice, so both
 * are attempted.
 * @param raw - the raw request body.
 * @returns the flattened fields; an unparseable body yields no fields.
 */
export function parseCallbackBody(raw: string): Record<string, unknown> {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (text === "") return {};
  let json: unknown;
  let parsedAsJson = false;
  try {
    json = JSON.parse(text);
    parsedAsJson = true;
  } catch (_notJson) {
    /* fall through to form parsing */
  }
  if (parsedAsJson) {
    // Valid JSON that is not an object carries no fields. Returning here rather
    // than falling through matters: form parsing would turn the whole payload
    // into one junk key.
    if (json === null || typeof json !== "object" || Array.isArray(json)) return {};
    const record = json as Record<string, unknown>;
    const inner = record.data;
    if (inner !== null && typeof inner === "object" && !Array.isArray(inner)) {
      // Merge the envelope's `data` under the top level, top level winning.
      return { ...(inner as Record<string, unknown>), ...record };
    }
    return record;
  }
  try {
    return Object.fromEntries(new URLSearchParams(text));
  } catch (_notForm) {
    return {};
  }
}

/**
 * Pick the api key and workspace id out of a callback's fields, query
 * parameters taking priority over the body.
 * @param query - the callback URL's query parameters.
 * @param body - the parsed callback body.
 * @returns the credentials found; fields are absent rather than blank.
 */
export function pickCallbackCredentials(
  query: Record<string, unknown>,
  body: Record<string, unknown>,
): ConsoleLoginCredentials {
  const apiKey = stringField(query, "api_key", "apiKey") ?? stringField(body, "api_key", "apiKey");
  const workspaceId =
    stringField(query, "workspace_id", "workspaceId") ??
    stringField(body, "workspace_id", "workspaceId");
  return {
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(workspaceId !== undefined ? { workspaceId } : {}),
  };
}

/** Extract the credentials from a callback, query parameters taking priority. */
async function extractCredentials(
  req: http.IncomingMessage,
  url: URL,
): Promise<ConsoleLoginCredentials> {
  const method = req.method ?? "GET";
  const body =
    method === "POST" || method === "PUT" || method === "PATCH"
      ? parseCallbackBody(await readBody(req))
      : {};
  return pickCallbackCredentials(Object.fromEntries(url.searchParams), body);
}

/** Open a URL with the OS default handler; never routed through a shell. */
function openInBrowser(url: string): Promise<void> {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/** Bind an http server to a loopback-only port chosen by the OS. */
function listenLoopback(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error): void => {
      reject(err);
    };
    server.once("error", onError);
    server.listen({ port: 0, host: "127.0.0.1", exclusive: true }, () => {
      server.off("error", onError);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("expected a TCP address"));
        return;
      }
      resolve(address.port);
    });
  });
}

/** Outcome of asking the host to start a console login. */
export type ConsoleLoginStart =
  | { status: "started"; loginUrl: string }
  | { status: "already-running"; loginUrl: string }
  | { status: "failed"; reason: string };

/**
 * Start a console login on the host: binds a loopback listener, opens the
 * console login page in the host's default browser, and hands the credentials
 * from the callback to `onComplete` (which persists them). Fire-and-forget —
 * this resolves once the browser has been opened; poll {@link consoleLoginState}
 * for the outcome.
 * @param opts.site - console site, `domestic` (default) or `international`.
 * @param opts.onComplete - persists the received credentials; its resolved
 * field names become the `done` state's `fields`.
 * @returns whether the flow started, plus the URL to open manually if needed.
 */
export async function startConsoleLogin(opts: {
  site?: string;
  onComplete: (credentials: ConsoleLoginCredentials) => Promise<string[]>;
}): Promise<ConsoleLoginStart> {
  if (active !== undefined) {
    return {
      status: "already-running",
      loginUrl: state.phase === "waiting" ? state.loginUrl : "",
    };
  }
  const expectedState = randomBytes(16).toString("hex");
  let settled = false;
  const server = http.createServer((req, res) => {
    void (async () => {
      if (req.method === "OPTIONS") {
        // The console page posts cross-origin; answer its preflight.
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        });
        res.end();
        return;
      }
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.searchParams.get("state") !== expectedState) {
        // Not our callback (or a forged one): refuse without ending the flow.
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("bad state\n");
        return;
      }
      const credentials = await extractCredentials(req, url);
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      });
      res.end("OK\n");
      if (credentials.apiKey === undefined && credentials.workspaceId === undefined) {
        // A callback with neither value (e.g. a bare probe): keep waiting.
        return;
      }
      settled = true;
      try {
        const fields = await opts.onComplete(credentials);
        state = { phase: "done", fields };
      } catch (err) {
        state = { phase: "failed", reason: err instanceof Error ? err.message : "persist failed" };
      }
      server.close();
    })().catch(() => {
      res.statusCode = 500;
      res.end();
    });
  });

  let port: number;
  try {
    port = await listenLoopback(server);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "could not bind a local port";
    state = { phase: "failed", reason };
    return { status: "failed", reason };
  }

  // Ask for a freshly issued key, so the key and the workspace id cannot end up
  // belonging to two different accounts.
  const origin =
    (opts.site !== undefined ? CONSOLE_ORIGINS[opts.site] : undefined) ?? CONSOLE_ORIGINS.domestic!;
  const loginUrl =
    `${origin}/console-login?notice=127.0.0.1:${port}` +
    `?state=${encodeURIComponent(expectedState)}&needapikey=true`;

  active = { server };
  state = { phase: "waiting", loginUrl };
  const timer = setTimeout(() => {
    server.close();
  }, LOGIN_TIMEOUT_MS);
  timer.unref?.();
  server.once("close", () => {
    clearTimeout(timer);
    active = undefined;
    if (!settled && state.phase === "waiting") {
      state = { phase: "failed", reason: "the login timed out before the console called back" };
    }
  });

  try {
    await openInBrowser(loginUrl);
  } catch (_browserRefused) {
    // Headless or locked-down host: the panel shows `loginUrl` to open by hand.
  }
  return { status: "started", loginUrl };
}

/** Abandon an in-flight login (closes the listener). */
export function cancelConsoleLogin(): void {
  active?.server.close();
  active = undefined;
  state = { phase: "idle" };
}
