import http from "node:http";
import { randomBytes } from "node:crypto";
import { createReadStream, existsSync, statSync, unlinkSync } from "node:fs";
import { extname } from "node:path";

import {
  defineCommand,
  detectOutputFormat,
  BailianError,
  ExitCode,
  normalizeConfigName,
  readConfigFile,
  writeConfigFile,
  deleteConfigProfile,
  type ConfigStore,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { listenLocalServer, openInBrowser, openPath } from "../shared/local-server.ts";
import { PAGE_HTML } from "./ui-html.ts";
import {
  UI_VALID_KEYS,
  UI_ENUM_KEYS,
  UI_BOOLEAN_KEYS,
  UI_MODEL_DEFAULTS,
  UI_MODEL_CATALOG,
  SECRET_KEYS,
  resolveKey,
  validateAndCoerceUi,
} from "./shared.ts";
import { listSkills, listMcpServers, listAgents, getSkillDetail } from "./inventory.ts";
import { launchAgent, agentLaunchable } from "./agent-launch.ts";
import { listAssets, resolveAssetPath, defaultOutputBase, contentType } from "./assets.ts";

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
function buildProfilePatch(
  data: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const cleaned: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(data)) {
    let value = "";
    if (typeof v === "string") value = v;
    else if (typeof v === "number" || typeof v === "boolean") value = String(v);
    // null/undefined/objects fall through as "" and clear the key
    if (value === "") continue;
    cleaned[resolveKey(k)] = validateAndCoerceUi(k, value);
  }
  return cleaned;
}

/** Preserve valid Config fields that the UI does not expose or manage. */
function mergeUnmanagedProfileFields(
  existing: Record<string, unknown>,
  managedPatch: Record<string, string | number | boolean>,
): Record<string, unknown> {
  const managedKeys = new Set<string>(UI_VALID_KEYS);
  const merged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(existing)) {
    if (!managedKeys.has(key)) merged[key] = value;
  }
  return { ...merged, ...managedPatch };
}

/**
 * Build the config-UI http server. Exported for tests. The handler enforces:
 * - Host header must be a loopback name (anti DNS-rebinding).
 * - every request must carry `?token=` matching the session token.
 */
export function createConfigUiServer(
  token: string,
  configStore: ConfigStore,
  outputBase: string = defaultOutputBase(),
): http.Server {
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
        const profiles = configStore.profiles();
        sendJson(res, 200, {
          configFile: configStore.path,
          keys: UI_VALID_KEYS,
          secretKeys: [...SECRET_KEYS],
          enums: UI_ENUM_KEYS,
          booleanKeys: [...UI_BOOLEAN_KEYS],
          fieldDefaults: {
            ...UI_MODEL_DEFAULTS,
            output_dir: defaultOutputBase(),
            timeout: "300",
          },
          modelCatalog: UI_MODEL_CATALOG,
          activeProfile: profiles.active,
          default: profiles.default,
          named: profiles.named,
        });
        return;
      }

      if (path === "/api/skills" && method === "GET") {
        sendJson(res, 200, { skills: listSkills() });
        return;
      }

      if (path === "/api/skill" && method === "GET") {
        const detail = getSkillDetail(u.searchParams.get("id") ?? "");
        if (!detail) {
          sendJson(res, 404, { error: "not found" });
          return;
        }
        sendJson(res, 200, detail);
        return;
      }

      if (path === "/api/mcp" && method === "GET") {
        sendJson(res, 200, { servers: listMcpServers() });
        return;
      }

      if (path === "/api/agents" && method === "GET") {
        // Augment each agent with `launchable`: whether its CLI binary is on
        // PATH. "Connected" only means bl is wired into the agent's config, so
        // the UI uses this to avoid offering a launch that would instantly fail.
        const agents = listAgents();
        const launchable = await Promise.all(agents.map((a) => agentLaunchable(a.id)));
        sendJson(res, 200, {
          agents: agents.map((a, i) => ({ ...a, launchable: launchable[i] })),
        });
        return;
      }

      if (path === "/api/assets" && method === "GET") {
        sendJson(res, 200, listAssets(outputBase));
        return;
      }

      if (path === "/api/asset/file" && method === "GET") {
        const abs = resolveAssetPath(outputBase, u.searchParams.get("path") ?? "");
        if (!abs || !existsSync(abs) || !statSync(abs).isFile()) {
          sendJson(res, 404, { error: "not found" });
          return;
        }
        res.writeHead(200, {
          "Content-Type": contentType(extname(abs)),
          "Content-Length": statSync(abs).size,
          "Cache-Control": "no-store",
        });
        const stream = createReadStream(abs);
        stream.on("error", () => {
          if (!res.headersSent) res.writeHead(500);
          res.end();
        });
        stream.pipe(res);
        return;
      }

      if (path === "/api/asset" && method === "DELETE") {
        const rel = u.searchParams.get("path") ?? "";
        const abs = resolveAssetPath(outputBase, rel);
        if (!abs || !existsSync(abs) || !statSync(abs).isFile()) {
          sendJson(res, 404, { error: "not found" });
          return;
        }
        try {
          unlinkSync(abs);
          sendJson(res, 200, { deleted: rel });
        } catch (err) {
          sendJson(res, 400, { error: errMessage(err) });
        }
        return;
      }

      if (path === "/api/asset/open" && method === "POST") {
        const rel = u.searchParams.get("path") ?? "";
        const abs = resolveAssetPath(outputBase, rel);
        if (!abs || !existsSync(abs) || !statSync(abs).isFile()) {
          sendJson(res, 404, { error: "not found" });
          return;
        }
        try {
          await openPath(abs);
          sendJson(res, 200, { opened: rel });
        } catch (err) {
          sendJson(res, 400, { error: errMessage(err) });
        }
        return;
      }

      if (path === "/api/agent/launch" && method === "POST") {
        try {
          const result = await launchAgent(u.searchParams.get("id") ?? "");
          sendJson(res, 200, result);
        } catch (err) {
          sendJson(res, 400, { error: errMessage(err) });
        }
        return;
      }

      if (path === "/api/active" && method === "POST") {
        const raw = await readBody(req);
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          sendJson(res, 400, { error: "invalid JSON body" });
          return;
        }
        const body = parsed as { name?: unknown };
        try {
          const activeProfile = await configStore.activate(body.name);
          sendJson(res, 200, { activeProfile });
        } catch (err) {
          sendJson(res, 400, { error: errMessage(err) });
        }
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
        let cleaned: Record<string, string | number | boolean>;
        try {
          normalized = normalizeConfigName(body.name);
          cleaned = buildProfilePatch(body.data as Record<string, unknown>);
        } catch (err) {
          sendJson(res, 400, { error: errMessage(err) });
          return;
        }
        const existing = readConfigFile(normalized) as Record<string, unknown>;
        const saved = mergeUnmanagedProfileFields(existing, cleaned);
        await writeConfigFile(saved, normalized);
        sendJson(res, 200, { saved });
        return;
      }

      if (path === "/api/profile" && method === "DELETE") {
        try {
          const deleted = await deleteConfigProfile(u.searchParams.get("name") ?? undefined);
          sendJson(res, 200, { deleted, activeProfile: configStore.profiles().active });
        } catch (err) {
          sendJson(res, 400, { error: errMessage(err) });
        }
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
  exampleArgs: ["", "--port 8787", "--no-open"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(
        {
          host: "127.0.0.1",
          port: flags.port ?? "random free port",
          config_file: ctx.configStore.path,
          routes: [
            "GET /              -> web UI",
            "GET /api/config    -> read all profiles",
            "GET /api/skills    -> list installed agent skills",
            "GET /api/skill     -> read one skill's SKILL.md detail",
            "GET /api/mcp       -> list local MCP servers",
            "GET /api/agents    -> list coding agent frameworks",
            "GET /api/assets   -> list generated assets",
            "GET /api/asset/file -> stream one asset file",
            "POST /api/asset/open -> open one asset with the OS default app",
            "POST /api/agent/launch -> launch a coding agent CLI in a new terminal",
            "POST /api/profile  -> save a profile",
            "POST /api/active   -> activate a profile",
            "DELETE /api/profile -> delete a named profile",
            "DELETE /api/asset  -> delete one asset file",
          ],
        },
        format,
      );
      return;
    }

    const token = randomBytes(16).toString("hex");
    const outputBase = settings.outputDir || defaultOutputBase();
    const server = createConfigUiServer(token, ctx.configStore, outputBase);

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
