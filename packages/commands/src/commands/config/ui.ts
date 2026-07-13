import http from "node:http";
import { randomBytes } from "node:crypto";

import {
  defineCommand,
  detectOutputFormat,
  BailianError,
  ExitCode,
  normalizeConfigName,
  readConfigProfiles,
  writeConfigFile,
  deleteConfigProfile,
  getConfigPath,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { listenLocalServer, openInBrowser } from "../shared/local-server.ts";
import { PAGE_HTML } from "./ui-html.ts";
import { VALID_KEYS, SECRET_KEYS, resolveKey, validateAndCoerce } from "./shared.ts";

const FLAGS = {
  port: {
    type: "number",
    valueHint: "<port>",
    description: "Port to listen on (default: random free port)",
  },
  noOpen: { type: "switch", description: "Do not open the browser automatically" },
} satisfies FlagsDef;

const MAX_BODY = 1 << 20; // 1 MiB

function errMessage(err: unknown): string {
  return err instanceof BailianError
    ? err.message
    : err instanceof Error
      ? err.message
      : String(err);
}

function sendJson(res: http.ServerResponse, status: number, obj: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("payload too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Build the request cleaned/validated config block from a posted `data` map. */
function buildProfilePatch(data: Record<string, unknown>): Record<string, string | number> {
  const cleaned: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(data)) {
    let value = "";
    if (typeof v === "string") value = v;
    else if (typeof v === "number" || typeof v === "boolean") value = String(v);
    // null/undefined/objects fall through as "" and clear the key
    if (value === "") continue;
    cleaned[resolveKey(k)] = validateAndCoerce(k, value);
  }
  return cleaned;
}

/**
 * Build the config-UI http server. Exported for tests. The handler enforces:
 * - Host header must be a loopback name (anti DNS-rebinding).
 * - every request must carry `?token=` matching the session token.
 */
export function createConfigUiServer(token: string, activeProfile: string | null): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const host = (req.headers.host || "").split(":")[0];
      if (host !== "127.0.0.1" && host !== "localhost") {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("forbidden host\n");
        return;
      }

      const u = new URL(req.url ?? "/", "http://127.0.0.1");
      if (u.searchParams.get("token") !== token) {
        res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("unauthorized\n");
        return;
      }

      const method = req.method ?? "GET";
      const path = u.pathname;

      if (path === "/" && method === "GET") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(PAGE_HTML);
        return;
      }

      if (path === "/api/config" && method === "GET") {
        const profiles = readConfigProfiles();
        sendJson(res, 200, {
          configFile: getConfigPath(),
          keys: VALID_KEYS,
          secretKeys: [...SECRET_KEYS],
          activeProfile,
          default: profiles.default,
          named: profiles.named,
        });
        return;
      }

      if (path === "/api/profile" && method === "POST") {
        const raw = await readBody(req);
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          sendJson(res, 400, { error: "invalid JSON body" });
          return;
        }
        const body = parsed as { name?: unknown; data?: unknown };
        if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
          sendJson(res, 400, { error: "missing or invalid 'data'" });
          return;
        }
        let normalized: string | undefined;
        let cleaned: Record<string, string | number>;
        try {
          normalized = normalizeConfigName(body.name);
          cleaned = buildProfilePatch(body.data as Record<string, unknown>);
        } catch (err) {
          sendJson(res, 400, { error: errMessage(err) });
          return;
        }
        await writeConfigFile(cleaned, normalized);
        sendJson(res, 200, { saved: cleaned });
        return;
      }

      if (path === "/api/profile" && method === "DELETE") {
        let normalized: string | undefined;
        try {
          normalized = normalizeConfigName(u.searchParams.get("name") ?? undefined);
        } catch (err) {
          sendJson(res, 400, { error: errMessage(err) });
          return;
        }
        if (!normalized) {
          sendJson(res, 400, { error: "Cannot delete the default profile." });
          return;
        }
        const deleted = await deleteConfigProfile(normalized);
        sendJson(res, 200, { deleted });
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not found\n");
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
}

export default defineCommand({
  description: "Open a local web UI to manage config profiles",
  auth: "none",
  usageArgs: "[--port <port>] [--no-open]",
  flags: FLAGS,
  exampleArgs: ["", "--port 8787", "--config staging --no-open"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(
        {
          host: "127.0.0.1",
          port: flags.port ?? "random free port",
          config_file: getConfigPath(),
          routes: [
            "GET /              -> web UI",
            "GET /api/config    -> read all profiles",
            "POST /api/profile  -> save a profile",
            "DELETE /api/profile -> delete a named profile",
          ],
        },
        format,
      );
      return;
    }

    const token = randomBytes(16).toString("hex");
    const activeProfile = settings.configName ?? null;
    const server = createConfigUiServer(token, activeProfile);

    let port: number;
    try {
      port = await listenLocalServer(server, flags.port ?? 0);
    } catch (err) {
      throw new BailianError(
        `Could not bind to 127.0.0.1 (no free port or permission denied): ${errMessage(err)}`,
        ExitCode.USAGE,
      );
    }

    const url = `http://127.0.0.1:${port}/?token=${token}`;

    if (!flags.noOpen) {
      try {
        await openInBrowser(url);
        emitBare("Opened the config UI in your default browser.");
      } catch {
        emitBare("Could not open the browser automatically. Open the URL below manually.");
      }
    }
    emitBare(`Config UI running at ${url}`);
    emitBare("Note: credentials are shown in cleartext in the browser (localhost only).");
    emitBare("Press Ctrl+C to stop.");

    await new Promise<void>((resolve) => {
      const shutdown = () => server.close(() => resolve());
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
      server.once("close", () => resolve());
    });
  },
});
