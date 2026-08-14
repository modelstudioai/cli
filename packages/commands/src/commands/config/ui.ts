import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
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
  DEFAULT_LANGUAGE,
  REGIONS,
  type ConfigStore,
  type FlagsDef,
  type Language,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { listenLocalServer, openInBrowser, openPath } from "../shared/local-server.ts";
import { renderConfigUiHtml } from "./ui-html.ts";
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
import {
  listSkills,
  listMcpServers,
  listAgents,
  getSkillDetail,
  getAgentDetail,
  writeMcpServer,
  deleteMcpServer,
  installSkillZip,
} from "./inventory.ts";
import { launchAgent, agentLaunchable, agentSupportsPrompt } from "./agent-launch.ts";
import {
  getScenario,
  localizeScenarios,
  renderScenarioPrompt,
  type Scenario,
} from "./scenarios.ts";
import { qrSvg } from "./qr.ts";
import { makeAuthUiBridge, type AuthUiBridge } from "../auth/console-ui.ts";
import { listAssets, resolveAssetPath, defaultOutputBase, contentType } from "./assets.ts";

const FLAGS = {
  port: {
    type: "number",
    valueHint: "<port>",
    description: {
      "en-US": "Port to listen on (default: random free port)",
      "zh-CN": "监听端口（默认：随机可用端口）",
    },
  },
  noOpen: {
    type: "switch",
    description: {
      "en-US": "Do not open the browser automatically",
      "zh-CN": "不自动打开浏览器",
    },
  },
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

function configUiLanguage(configStore: ConfigStore): Language {
  return configStore.read().language ?? DEFAULT_LANGUAGE;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Max size for binary uploads (skill .zip packages). */
const MAX_UPLOAD = 24 * (1 << 20); // 24 MiB

function readBodyBuffer(req: http.IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > max) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** Constant-time token comparison (avoids timing side channels). */
function tokenMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
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
  authBridge?: AuthUiBridge,
): http.Server {
  let activatedUiProfile: string | null = null;
  const uiLanguage = (): Language => {
    if (activatedUiProfile === null) return configUiLanguage(configStore);
    const configName = activatedUiProfile === "default" ? undefined : activatedUiProfile;
    return readConfigFile(configName).language ?? DEFAULT_LANGUAGE;
  };

  return http.createServer(async (req, res) => {
    try {
      const host = (req.headers.host || "").split(":")[0];
      if (host !== "127.0.0.1" && host !== "localhost") {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("forbidden host\n");
        return;
      }

      const u = new URL(req.url ?? "/", "http://127.0.0.1");
      if (!tokenMatches(u.searchParams.get("token"), token)) {
        res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("unauthorized\n");
        return;
      }

      const method = req.method ?? "GET";
      const path = u.pathname;

      if (path === "/" && method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          // The page URL carries the session token, so never cache it.
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy":
            "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
            "img-src 'self' data: https://img.alicdn.com https://oss.aliyuncs.com; " +
            "media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        });
        res.end(renderConfigUiHtml(uiLanguage()));
        return;
      }

      if (path === "/api/qr" && method === "GET") {
        const data = (u.searchParams.get("data") ?? "").slice(0, 512);
        if (!data) {
          sendJson(res, 400, { error: "missing data" });
          return;
        }
        try {
          const svg = qrSvg(data);
          res.writeHead(200, {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(svg);
        } catch (err) {
          sendJson(res, 400, { error: errMessage(err) });
        }
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
            base_url: REGIONS.cn,
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

      if (path === "/api/skill/install" && method === "POST") {
        const source = u.searchParams.get("source") ?? "";
        const name = u.searchParams.get("name") ?? "";
        try {
          const buf = await readBodyBuffer(req, MAX_UPLOAD);
          const result = installSkillZip(source, buf, name);
          sendJson(res, 200, result);
        } catch (err) {
          sendJson(res, 400, { error: errMessage(err) });
        }
        return;
      }

      if (path === "/api/mcp" && method === "GET") {
        sendJson(res, 200, { servers: listMcpServers() });
        return;
      }

      if (path === "/api/mcp" && method === "POST") {
        const raw = await readBody(req);
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          sendJson(res, 400, { error: "invalid JSON body" });
          return;
        }
        const body = parsed as {
          source?: unknown;
          scope?: unknown;
          name?: unknown;
          config?: unknown;
        };
        const source = typeof body.source === "string" ? body.source : "";
        const scope = typeof body.scope === "string" && body.scope ? body.scope : "global";
        const name = typeof body.name === "string" ? body.name : "";
        try {
          writeMcpServer(source, scope, name, body.config);
          sendJson(res, 200, { saved: name.trim() });
        } catch (err) {
          sendJson(res, 400, { error: errMessage(err) });
        }
        return;
      }

      if (path === "/api/mcp" && method === "DELETE") {
        const source = u.searchParams.get("source") ?? "";
        const scope = u.searchParams.get("scope") || "global";
        const name = u.searchParams.get("name") ?? "";
        try {
          deleteMcpServer(source, scope, name);
          sendJson(res, 200, { deleted: name });
        } catch (err) {
          sendJson(res, 400, { error: errMessage(err) });
        }
        return;
      }

      if (path === "/api/health" && method === "GET") {
        const major = Number(process.versions.node.split(".")[0]);
        sendJson(res, 200, {
          node: process.version,
          nodeOk: Number.isFinite(major) && major >= 18,
          platform: process.platform,
          cwd: process.cwd(),
        });
        return;
      }

      if (path === "/api/agents" && method === "GET") {
        // Augment each agent with `launchable`: whether its CLI binary is on
        // PATH. "Connected" only means bl is wired into the agent's config, so
        // the UI uses this to avoid offering a launch that would instantly fail.
        // `dispatchable` additionally requires a verified prompt contract.
        const agents = listAgents();
        const launchable = await Promise.all(agents.map((a) => agentLaunchable(a.id)));
        sendJson(res, 200, {
          agents: agents.map((a, i) => ({
            ...a,
            launchable: launchable[i],
            dispatchable: launchable[i] && agentSupportsPrompt(a.id),
          })),
        });
        return;
      }

      if (path === "/api/agent" && method === "GET") {
        const detail = getAgentDetail(u.searchParams.get("id") ?? "");
        if (!detail) {
          sendJson(res, 404, { error: "not found" });
          return;
        }
        sendJson(res, 200, detail);
        return;
      }

      if (path === "/api/agent/open" && method === "POST") {
        const detail = getAgentDetail(u.searchParams.get("id") ?? "");
        const target = u.searchParams.get("path") ?? "";
        const allowed = detail?.settings.some((s) => s.path === target) ?? false;
        if (!detail || !allowed || !existsSync(target)) {
          sendJson(res, 404, { error: "not found" });
          return;
        }
        try {
          await openPath(target);
          sendJson(res, 200, { opened: target });
        } catch (err) {
          sendJson(res, 400, { error: errMessage(err) });
        }
        return;
      }

      if (path === "/api/scenarios" && method === "GET") {
        // Curated Playground scenarios plus the connected agents that can be
        // dispatched a prompt right now (on PATH + verified prompt contract).
        const agents = listAgents();
        const launchable = await Promise.all(agents.map((a) => agentLaunchable(a.id)));
        const targets = agents
          .map((a, i) => ({
            id: a.id,
            label: a.label,
            dispatchable: launchable[i] && agentSupportsPrompt(a.id),
          }))
          .filter((a) => a.dispatchable);
        sendJson(res, 200, {
          scenarios: localizeScenarios(uiLanguage()),
          agents: targets,
        });
        return;
      }

      if (path === "/api/auth/status" && method === "GET") {
        sendJson(
          res,
          200,
          authBridge
            ? authBridge.status()
            : {
                authenticated: false,
                methods: { apiKey: false, console: false, openapi: false },
                primary: null,
              },
        );
        return;
      }

      if (path === "/api/auth/login" && method === "POST") {
        if (!authBridge) {
          sendJson(res, 400, { error: "login unavailable" });
          return;
        }
        authBridge.startConsoleLogin();
        sendJson(res, 200, { started: true });
        return;
      }

      if (path === "/api/auth/logout" && method === "POST") {
        if (!authBridge) {
          sendJson(res, 400, { error: "logout unavailable" });
          return;
        }
        try {
          const loggedOut = await authBridge.logout();
          sendJson(res, 200, { loggedOut });
        } catch (err) {
          sendJson(res, 400, { error: errMessage(err) });
        }
        return;
      }

      if (path === "/api/assets" && method === "GET") {
        sendJson(res, 200, listAssets(outputBase));
        return;
      }

      if (path === "/api/asset/file" && method === "GET") {
        const abs = resolveAssetPath(outputBase, u.searchParams.get("path") ?? "");
        const st = abs && existsSync(abs) ? statSync(abs) : null;
        if (!abs || !st || !st.isFile()) {
          sendJson(res, 404, { error: "not found" });
          return;
        }
        res.writeHead(200, {
          "Content-Type": contentType(extname(abs)),
          "Content-Length": st.size,
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

      if (path === "/api/agent/dispatch" && method === "POST") {
        const raw = await readBody(req);
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          sendJson(res, 400, { error: "invalid JSON body" });
          return;
        }
        const body = parsed as {
          scenario?: unknown;
          agent?: unknown;
          values?: unknown;
          custom?: unknown;
        };
        const agentId = typeof body.agent === "string" ? body.agent : "";
        if (!agentSupportsPrompt(agentId)) {
          sendJson(res, 400, { error: "agent cannot be dispatched a prompt" });
          return;
        }
        let scenario: Scenario | undefined;
        const custom = body.custom;
        if (custom && typeof custom === "object" && !Array.isArray(custom)) {
          const c = custom as { title?: unknown; prompt?: unknown; inputs?: unknown };
          const promptTpl = typeof c.prompt === "string" ? c.prompt.trim() : "";
          if (!promptTpl) {
            sendJson(res, 400, { error: "custom scenario needs a prompt" });
            return;
          }
          const inputs: { key: string; label: string }[] = [];
          if (Array.isArray(c.inputs)) {
            for (const it of c.inputs as unknown[]) {
              if (it && typeof it === "object") {
                const o = it as { key?: unknown; label?: unknown };
                const key = typeof o.key === "string" ? o.key.trim() : "";
                if (key) {
                  const label =
                    typeof o.label === "string" && o.label.trim() ? o.label.trim() : key;
                  inputs.push({ key, label });
                }
              }
            }
          }
          scenario = {
            id: "custom",
            title: typeof c.title === "string" && c.title.trim() ? c.title.trim() : "Custom",
            description: "",
            category: "\u81ea\u5b9a\u4e49",
            prompt: promptTpl,
            inputs,
          };
        } else {
          scenario =
            typeof body.scenario === "string"
              ? getScenario(body.scenario, uiLanguage())
              : undefined;
        }
        if (!scenario) {
          sendJson(res, 400, { error: "unknown scenario" });
          return;
        }
        const values: Record<string, string> = {};
        if (body.values && typeof body.values === "object" && !Array.isArray(body.values)) {
          for (const [k, v] of Object.entries(body.values as Record<string, unknown>)) {
            if (typeof v === "string") values[k] = v;
          }
        }
        for (const inp of scenario.inputs ?? []) {
          if (!values[inp.key] || !values[inp.key]!.trim()) {
            sendJson(res, 400, { error: `Missing input: ${inp.label}` });
            return;
          }
        }
        const prompt = renderScenarioPrompt(scenario, values);
        try {
          const result = await launchAgent(agentId, process.cwd(), prompt);
          sendJson(res, 200, {
            launched: true,
            agent: agentId,
            scenario: scenario.id,
            command: result.command,
          });
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
          activatedUiProfile = activeProfile;
          sendJson(res, 200, { activeProfile, uiLanguage: uiLanguage() });
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
        sendJson(res, 200, { saved, uiLanguage: uiLanguage() });
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
    } catch (err) {
      // Log server-side so failures are diagnosable, and return a JSON error
      // instead of an empty 500 body.
      console.error("[config ui] request failed:", err);
      if (res.headersSent) {
        res.end();
        return;
      }
      sendJson(res, 500, { error: errMessage(err) });
    }
  });
}

export default defineCommand({
  description: {
    "en-US": "Open a local web UI to manage config profiles",
    "zh-CN": "打开用于管理配置 Profile 的本地 Web UI",
  },
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
            "POST /api/skill/install -> install a skill from an uploaded .zip into a skills root",
            "GET /api/mcp       -> list local MCP servers",
            "POST /api/mcp      -> create or update one MCP server (writes its source config)",
            "DELETE /api/mcp    -> remove one MCP server from its source config",
            "GET /api/health    -> runtime environment info (node, platform, cwd)",
            "GET /api/agents    -> list coding agent frameworks",
            "GET /api/agent     -> one agent's config detail (secrets masked)",
            "POST /api/agent/open -> open one agent's config file with the OS default app",
            "GET /api/auth/status -> current auth state",
            "POST /api/auth/login -> start console login (opens browser)",
            "POST /api/auth/logout -> clear all stored credentials",
            "GET /api/assets   -> list generated assets",
            "GET /api/asset/file -> stream one asset file",
            "POST /api/asset/open -> open one asset with the OS default app",
            "POST /api/agent/launch -> launch a coding agent CLI in a new terminal",
            "GET /api/scenarios -> list Playground scenarios and dispatchable agents",
            "POST /api/agent/dispatch -> dispatch a scenario prompt to a connected agent",
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
    const server = createConfigUiServer(token, ctx.configStore, outputBase, makeAuthUiBridge(ctx));

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
