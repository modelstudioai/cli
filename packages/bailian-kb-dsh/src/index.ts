/**
 * Bailian knowledge-base consumer plugin: registers kb_search and kb_chat over the DashScope RAG API,
 * plus isolated CLI management and its skill.
 * @module dsh-tool-bailian-kb
 */

import type { Context, Volatile } from "@deepseek-ai/cordis";
import type { IncomingMessage, ServerResponse } from "node:http";
import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { initializeConfiguration, requireWorkspace } from "./configuration.js";
import { createManagementTool } from "./management.js";
import { readBlCliConfig } from "./bl-cli.js";
import { consoleLoginState, startConsoleLogin } from "./console-login.js";
import { saveConnection } from "./credentials.js";
import { KB_PATHS } from "./endpoints.js";
import { KbClient } from "./client.js";
import { registerSkill } from "./skill.js";
import { ServiceCache } from "./service-cache.js";
import { buildRefreshedSceneList } from "./service-catalog.js";
import { installServiceContext } from "./service-context.js";
import type { ServiceScene } from "./api-types.js";
import { createKbTools } from "./tools.js";

/** Minimal webServer route shape (declared inline to avoid a host-package dependency). */
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

export const name = "tool-bailian-kb";
export const inject = ["tools", "credentials", "settings"];

/** Loader entry id. Settings forms address the plugin by this id. */
export const KB_SETTINGS_NAMESPACE = name;

interface SettingsApi {
  configure(presentation: { auto?: boolean }, owner?: unknown): () => void;
  update(namespace: string, patch: object): Promise<void>;
}

/** Bailian knowledge-base plugin configuration. Page fields are volatile. */
export interface Config {
  /** Workspace id stored only in dsh plugin settings. */
  workspaceId: Volatile<string | undefined>;
  /** Internal migration marker: cleared fields must not be imported again. */
  configInitialized: Volatile<boolean>;
  /** Retrieval-service id. Stored in dsh settings. */
  defaultRetrieveAgentId: Volatile<string | undefined>;
  /** Q&A-service id. Stored in dsh settings. */
  defaultChatAgentId: Volatile<string | undefined>;
  /** Service version: `beta` or a published number. Never model-visible. */
  agentVersion: Volatile<string | undefined>;
  /** kb_chat timeout in milliseconds. */
  chatTimeoutMs: Volatile<number>;
}

export const Config: z<Config> = z.object({
  workspaceId: z.string().volatile(),
  configInitialized: z.boolean().default(false).volatile(),
  defaultRetrieveAgentId: z.string().volatile(),
  defaultChatAgentId: z.string().volatile(),
  agentVersion: z.string().volatile(),
  chatTimeoutMs: z.number().step(1).min(1000).default(300_000).volatile(),
}) as unknown as z<Config>;

function present(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function credentialSourceCategory(source: string | undefined): string | undefined {
  if (source === "env") return "environment";
  if (source === "file") return "local";
  if (source === "project-env") return "projectEnvironment";
  if (source === "user-env") return "userEnvironment";
  return undefined;
}

/**
 * Activate knowledge tools and isolated management after startup migration. Visible settings are
 * volatile plugin config, so a saved edit applies on the next call.
 * @param ctx - registrant context carrying tools and credentials.
 * @param config - deployment workspace, pinning, and timeout choices.
 */
export function apply(ctx: Context, config: Config): void {
  let started = false;
  let disposed = false;
  ctx.effect(
    () => () => {
      disposed = true;
    },
    "bailian-kb: startup lifetime",
  );
  const start = () => {
    if (started || disposed || ctx.fiber.state !== 2) return;
    started = true;
    void activate(ctx, config, () => !disposed).catch((error: unknown) => {
      if (!disposed) ctx.logger.error(error);
    });
  };
  ctx.on("internal/status", (fiber) => {
    if (fiber === ctx.fiber) start();
  });
  start();
}

async function activate(ctx: Context, config: Config, isActive: () => boolean): Promise<void> {
  const settings = ctx.get("settings") as SettingsApi | undefined;
  if (settings) {
    ctx.effect(
      () => settings.configure({ auto: false }, ctx.fiber),
      "tool-bailian-kb: disable auto settings form",
    );
  }

  if (!settings) throw new Error("dsh settings service is required. / 需要 dsh settings 服务。");
  await initializeConfiguration({
    read: () => ({
      configInitialized: config.configInitialized.get(),
      workspaceId: config.workspaceId.get(),
      defaultRetrieveAgentId: config.defaultRetrieveAgentId.get(),
      defaultChatAgentId: config.defaultChatAgentId.get(),
    }),
    readSeed: readBlCliConfig,
    resolve: async (reference) => (await ctx.credentials.resolve(credentialRef(reference)))?.value,
    set: (reference, value) => ctx.credentials.set(credentialRef(reference), value),
    update: (patch) => settings.update(KB_SETTINGS_NAMESPACE, patch),
  });

  if (!isActive()) return;

  const workspaceFromConfig = () => present(config.workspaceId.get());
  const retrieveFromConfig = () => present(config.defaultRetrieveAgentId.get());
  const chatFromConfig = () => present(config.defaultChatAgentId.get());

  const client = new KbClient({
    resolveWorkspaceId: async () => requireWorkspace(workspaceFromConfig()),
    endpointHost: "cn-beijing.maas.aliyuncs.com",
    get agentVersion() {
      return present(config.agentVersion.get());
    },
    resolveApiKey: async () => {
      const resolved = await ctx.credentials.resolve(credentialRef("BAILIAN_KB_API_KEY"));
      if (!resolved) {
        throw new Error(
          "BAILIAN_KB_API_KEY is not configured. Set it on the Bailian knowledge base plugin page " +
            "or in ~/.dsh/.credentials.yaml (create a key at https://bailian.console.aliyun.com/?tab=app#/api-key).",
        );
      }
      return resolved.value;
    },
  });

  const resolveWorkspaceIdOrUndefined = async (): Promise<string | undefined> =>
    workspaceFromConfig();

  const serviceCache = new ServiceCache({
    client,
    resolveWorkspaceId: async () => {
      const workspaceId = await resolveWorkspaceIdOrUndefined();
      if (workspaceId === undefined) throw new Error("workspace id is not configured");
      return workspaceId;
    },
    endpointHost: "cn-beijing.maas.aliyuncs.com",
    warn: (message) => {
      ctx.logger.warn(message);
    },
  });

  const configuredDefaultAgentId = async (scene: ServiceScene): Promise<string | undefined> => {
    return scene === "search" ? retrieveFromConfig() : chatFromConfig();
  };

  const resolveDefaultAgentId = async (scene: ServiceScene): Promise<string | undefined> => {
    const configured = await configuredDefaultAgentId(scene);
    if (configured !== undefined) return configured;
    const workspaceId = await resolveWorkspaceIdOrUndefined();
    if (workspaceId === undefined) return undefined;
    const forScene =
      serviceCache.peek(workspaceId)?.entries.filter((entry) => entry.scene === scene) ?? [];
    return forScene.length === 1 ? forScene[0]?.agent_id : undefined;
  };
  for (const tool of createKbTools({
    client,
    resolveDefaultRetrieveAgentId: async () => await resolveDefaultAgentId("search"),
    resolveDefaultChatAgentId: async () => await resolveDefaultAgentId("chat"),
    describeServicesAfterRefresh: async (scene) => {
      await serviceCache.refresh();
      const workspaceId = await resolveWorkspaceIdOrUndefined();
      if (workspaceId === undefined) return undefined;
      return buildRefreshedSceneList(scene, serviceCache.entriesFor(workspaceId, scene));
    },
    get chatTimeoutMs() {
      return config.chatTimeoutMs.get();
    },
  })) {
    ctx.tools.register(tool);
  }
  ctx.tools.register(
    createManagementTool({
      resolveConfiguration: async () => {
        const apiKey = await ctx.credentials.resolve(credentialRef("BAILIAN_KB_API_KEY"));
        if (!apiKey?.value)
          throw new Error("API key is missing in dsh credentials. / dsh 凭据中缺少 API Key。");
        return { apiKey: apiKey.value, workspaceId: requireWorkspace(workspaceFromConfig()) };
      },
      onSuccess: () => {
        serviceCache.invalidate();
      },
    }),
  );
  registerSkill(ctx);

  ctx.on("tools/result", (_exec, result) => {
    if (result.isError) return;
    const args = JSON.stringify((_exec as { arguments?: unknown }).arguments ?? "");
    if (!/bl\s+knowledge\s+service\s+(create|deploy|delete|copy)/.test(args)) return;
    serviceCache.invalidate();
    void serviceCache.refresh();
  });

  ctx.inject(["agents"], (actx) => {
    installServiceContext(actx, {
      cache: serviceCache,
      resolveWorkspaceId: resolveWorkspaceIdOrUndefined,
      resolveDefaultRetrieveAgentId: async () => await configuredDefaultAgentId("search"),
      resolveDefaultChatAgentId: async () => await configuredDefaultAgentId("chat"),
      warn: (message) => {
        actx.logger.warn(message);
      },
    });
  });

  const updateConnection = async (input: { apiKey?: string; workspaceId?: string }) => {
    const reference = credentialRef("BAILIAN_KB_API_KEY");
    await saveConnection(input, {
      describe: () => ctx.credentials.describe(reference),
      resolve: async () => (await ctx.credentials.resolve(reference))?.value,
      readWorkspace: () => config.workspaceId.get(),
      writeKey: (value) => ctx.credentials.set(reference, value),
      unsetKey: () => ctx.credentials.unset(reference),
      writeWorkspace: (workspaceId) => settings.update(KB_SETTINGS_NAMESPACE, { workspaceId }),
      verify: async (apiKey, workspaceId) => {
        const candidate = new KbClient({
          endpointHost: "cn-beijing.maas.aliyuncs.com",
          resolveApiKey: async () => apiKey,
          resolveWorkspaceId: async () => workspaceId,
        });
        await candidate.postJson(
          KB_PATHS.serviceList,
          { agent_scene: "search", page_number: 1, page_size: 1 },
          AbortSignal.timeout(30_000),
        );
      },
    });
    serviceCache.invalidate();
  };

  ctx.inject(["webServer"], (wctx) => {
    const guard = (req: IncomingMessage, res: ServerResponse): boolean => {
      const connection = ctx.get("connection") as Context["connection"] | undefined;
      const rejection = connection ? connection.requestRejection(req) : 403;
      if (rejection !== undefined) {
        sendJson(res, rejection, {
          error:
            rejection === 401
              ? "dsh authentication required; reopen the dsh launch URL. / 请通过 dsh 启动链接重新打开页面。"
              : "dsh rejected this request. / dsh 拒绝了此请求。",
        });
        return false;
      }
      return true;
    };

    wctx.effect(
      () =>
        wctx.webServer.register({
          kind: "exact",
          path: "/bailian-kb/credentials",
          handler: async (req, res) => {
            if (!guard(req, res)) return;
            if (req.method !== "POST") {
              sendJson(res, 405, { error: "Use POST. / 请使用 POST。" });
              return;
            }
            try {
              const body = await readJsonBody(req);
              if (!body || typeof body !== "object" || Array.isArray(body))
                throw new Error("Invalid connection data. / 连接配置格式不正确。");
              const input = body as Record<string, unknown>;
              if (
                typeof input.workspaceId !== "string" ||
                (input.apiKey !== undefined && typeof input.apiKey !== "string")
              )
                throw new Error("Invalid connection data. / 连接配置格式不正确。");
              await updateConnection({
                apiKey: input.apiKey as string | undefined,
                workspaceId: input.workspaceId,
              });
              sendJson(res, 200, { saved: true });
            } catch (error) {
              sendJson(res, 400, {
                error:
                  error instanceof Error
                    ? error.message
                    : "Connection update failed. / 连接配置保存失败。",
              });
            }
          },
        }),
      "bailian-kb: manual credentials",
    );

    wctx.effect(
      () =>
        wctx.webServer.register({
          kind: "exact",
          path: "/bailian-kb/status",
          handler: async (req: IncomingMessage, res: ServerResponse) => {
            if (!guard(req, res)) return;
            if (req.method !== "GET" && req.method !== "HEAD") {
              sendJson(res, 405, { error: "use GET" });
              return;
            }
            const apiKey = await ctx.credentials.describe(credentialRef("BAILIAN_KB_API_KEY"));
            sendJson(res, 200, {
              workspaceId: workspaceFromConfig() ?? "",
              apiKey: {
                configured: apiKey.configured,
                source: credentialSourceCategory(apiKey.source),
                writable: apiKey.writable,
              },
              consoleLogin: consoleLoginState(),
            });
          },
        }),
      "tool-bailian-kb: status route",
    );

    wctx.effect(
      () =>
        wctx.webServer.register({
          kind: "exact",
          path: "/bailian-kb/services",
          handler: async (req: IncomingMessage, res: ServerResponse) => {
            if (!guard(req, res)) return;
            if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "POST") {
              sendJson(res, 405, { error: "use GET or POST" });
              return;
            }
            const workspaceId = await resolveWorkspaceIdOrUndefined();
            if (workspaceId === undefined) {
              sendJson(res, 200, { configured: false });
              return;
            }
            if (req.method === "POST") {
              serviceCache.invalidate();
              await serviceCache.refresh();
            }
            sendJson(res, 200, {
              configured: true,
              status: serviceCache.status(workspaceId),
              search: serviceCache.entriesFor(workspaceId, "search"),
              chat: serviceCache.entriesFor(workspaceId, "chat"),
            });
          },
        }),
      "tool-bailian-kb: service cache route",
    );

    wctx.effect(
      () =>
        wctx.webServer.register({
          kind: "exact",
          path: "/bailian-kb/autofill",
          handler: async (req: IncomingMessage, res: ServerResponse) => {
            if (!guard(req, res)) return;
            if (req.method !== "POST") {
              sendJson(res, 405, { error: "use POST" });
              return;
            }
            let action = "login";
            try {
              const body = await readJsonBody(req);
              if (
                typeof body === "object" &&
                body !== null &&
                (body as { action?: unknown }).action === "loginStatus"
              ) {
                action = "loginStatus";
              }
            } catch {
              /* default to login */
            }
            if (action === "loginStatus") {
              sendJson(res, 200, consoleLoginState());
              return;
            }
            const started = await startConsoleLogin({
              onComplete: async (credentials) => {
                if (!credentials.apiKey || !credentials.workspaceId)
                  throw new Error(
                    "Login must return API Key and Workspace. / 登录必须返回 API Key 和 Workspace。",
                  );
                await updateConnection(credentials);
                return ["apiKey", "workspaceId"];
              },
            });
            sendJson(res, 200, started);
          },
        }),
      "tool-bailian-kb: autofill route",
    );
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function readJsonBody(req: IncomingMessage, maxBytes = 16384): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error("body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON body. / JSON 请求格式不正确。"));
      }
    });
    req.on("error", reject);
  });
}
