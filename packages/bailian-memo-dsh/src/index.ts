/**
 * Bailian personal-memory plugin for DeepSeek Harness (dsh 0.2.1+).
 * @module bailian-memo-dsh
 */

import type { Context } from "@deepseek-ai/cordis";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { initialSettingsPatch } from "./settings-seed.js";
import { Config, MEMO_SETTINGS_NAMESPACE, resolveConfig } from "./config.js";
import { MemoryClient } from "./memory-client.js";
import { readBlCliConfig } from "./bl-cli.js";
import { consoleLoginState, startConsoleLogin } from "./console-login.js";
import {
  applyConnectionSettings,
  applyCredentialAutofill,
  credentialSourceCategory,
  type CredentialAutofillDependencies,
} from "./credential-autofill.js";
import {
  beginEnable,
  markPaused,
  readPersonalMemoryConfig,
  assertWorkspaceBinding,
  resolveMemoryWorkspace,
  type PersonalMemoryConfig,
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
  "settings",
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
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(
      JSON.stringify({
        error:
          rejection === 401
            ? "dsh authentication required; reopen the dsh launch URL. / 请通过 dsh 启动链接重新打开页面。"
            : "dsh rejected this request. / dsh 拒绝了此请求。",
      }),
    );
    return false;
  }
  return true;
}

export function apply(ctx: Context, config: Config): void {
  let started = false;
  let disposed = false;
  ctx.effect(
    () => () => {
      disposed = true;
    },
    "bailian-memo: cancel activation",
  );
  // SettingsForms only describes ACTIVE fibers; startup must return before migration writes.
  ctx.on("internal/status", (fiber) => {
    if (fiber !== ctx.fiber || fiber.state !== 2 || started || disposed) return;
    started = true;
    void activate(ctx, config, () => !disposed && ctx.fiber.state === 2).catch((error) => {
      if (!disposed) ctx.logger.error(error);
    });
  });
}

async function activate(ctx: Context, config: Config, isActive: () => boolean): Promise<void> {
  const resolved = () => resolveConfig(config);

  // Custom Plugins settings page owns the UI; disable the auto-generated form
  // through the required Host settings service.
  const settingsService = ctx.get("settings") as
    | {
        configure: (options: { auto: false }, fiber: unknown) => () => void;
        update: (namespace: string, patch: object) => Promise<void>;
      }
    | undefined;
  if (!settingsService) {
    throw new Error("dsh settings service is unavailable. / dsh 设置服务不可用。");
  }
  ctx.effect(
    () => settingsService.configure({ auto: false }, ctx.fiber),
    "bailian-memo: disable auto settings form",
  );

  const writeWorkspace = async (workspaceId: string | undefined): Promise<void> => {
    // Empty is an explicit clear, preventing a later startup import.
    await settingsService.update(MEMO_SETTINGS_NAMESPACE, {
      workspaceId: workspaceId ?? "",
      configInitialized: true,
    });
  };

  const blSeed = readBlCliConfig();
  const personalSeed = await readPersonalMemoryConfig();
  if (!isActive()) return;
  const patch = initialSettingsPatch(
    config.configInitialized.get(),
    config.workspaceId.get(),
    personalSeed.workspace_id,
    blSeed.workspaceId,
  );
  if (Object.keys(patch).length) {
    await settingsService.update(MEMO_SETTINGS_NAMESPACE, patch);
  }
  if (!isActive()) return;
  // This plugin owns its credential independently. Seed only while absent.
  try {
    const existing = await ctx.credentials.resolve(credentialRef("BAILIAN_MEMO_API_KEY"));
    if (!isActive()) return;
    if (!existing && blSeed.apiKey) {
      await ctx.credentials.set(credentialRef("BAILIAN_MEMO_API_KEY"), blSeed.apiKey);
    }
  } catch {
    /* best-effort credential seed */
  }

  if (!isActive()) return;
  const client = new MemoryClient({
    resolveApiKey: async () => {
      const resolvedKey = await ctx.credentials.resolve(credentialRef("BAILIAN_MEMO_API_KEY"));
      if (!resolvedKey?.value) {
        throw new Error(
          "BAILIAN_MEMO_API_KEY is not configured. Sign in from the Bailian Memory settings page or set the credential.",
        );
      }
      return resolvedKey.value;
    },
    resolveWorkspaceId: async () => {
      const personal = await readPersonalMemoryConfig();
      return resolveMemoryWorkspace(config.workspaceId.get(), personal.workspace_id);
    },
  });

  const store = await openTaskStore(ctx);
  if (!isActive()) return;
  installTaskPoller(ctx, store, client);

  ctx.sessionProjections.register(memoProjectionDefinition);

  installAutomaticRecall(ctx, { client, resolveConfig: resolved });
  installAuxiliaryCurator(ctx, { client, store, resolveConfig: resolved });
  registerMemoTools(ctx, { client, store, resolveConfig: resolved });

  const credentialDependencies = (): CredentialAutofillDependencies<PersonalMemoryConfig> => {
    const apiKeyRef = credentialRef("BAILIAN_MEMO_API_KEY");
    return {
      describeApiKey: () => ctx.credentials.describe(apiKeyRef),
      resolveApiKey: () => ctx.credentials.resolve(apiKeyRef),
      readPersonal: () => readPersonalMemoryConfig(),
      writeApiKey: (value) => ctx.credentials.set(apiKeyRef, value),
      unsetApiKey: () => ctx.credentials.unset(apiKeyRef),
      readWorkspace: () => config.workspaceId.get(),
      writeWorkspace,
      verify: async ({ apiKey, workspaceId }) => {
        const personal = await readPersonalMemoryConfig();
        const verificationClient = new MemoryClient({
          resolveApiKey: async () => apiKey,
          resolveWorkspaceId: async () => workspaceId,
        });
        await verificationClient.list({
          userId: personal.user_id ?? randomUUID(),
          pageSize: 1,
        });
      },
    };
  };

  // Host routes for settings page autofill / enable / status (not the obsolete /settings bridge).
  {
    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: "exact",
          path: "/plugins/bailian-memo-dsh/credentials",
          handler: async (req, response) => {
            if (!guard(ctx, req, response)) return;
            if (req.method !== "POST") return json(response, 405, { error: "method not allowed" });
            let body: Record<string, unknown>;
            try {
              body = await readJsonBody(req);
            } catch {
              return json(response, 400, {
                error: "Invalid connection request. / 连接请求格式无效。",
              });
            }
            try {
              const fields = await applyConnectionSettings(
                {
                  apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
                  workspaceId: typeof body.workspaceId === "string" ? body.workspaceId : undefined,
                },
                credentialDependencies(),
              );
              json(response, 200, { updated: fields });
            } catch (error) {
              json(response, 400, {
                error:
                  error instanceof Error
                    ? error.message
                    : "Connection update failed. / 连接更新失败。",
              });
            }
          },
        }),
      "bailian-memo: manual credentials route",
    );

    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: "exact",
          path: "/plugins/bailian-memo-dsh/profile-schemas",
          handler: async (req, response) => {
            if (!guard(ctx, req, response)) return;
            if (req.method !== "GET")
              return json(response, 405, { error: "Use GET. / 请使用 GET。" });
            try {
              json(response, 200, { schemas: await client.listProfileSchemas() });
            } catch (error) {
              json(response, 400, {
                error:
                  error instanceof Error
                    ? error.message
                    : "Profile rules unavailable. / 画像规则不可用。",
              });
            }
          },
        }),
      "bailian-memo: profile rules route",
    );

    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: "exact",
          path: "/plugins/bailian-memo-dsh/status",
          handler: async (req, response) => {
            if (!guard(ctx, req, response)) return;
            if (req.method !== "GET") return json(response, 405, { error: "method not allowed" });
            const personal = await readPersonalMemoryConfig();
            const apiKey = await ctx.credentials.describe(credentialRef("BAILIAN_MEMO_API_KEY"));
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
              const existingPersonal = await readPersonalMemoryConfig();
              assertWorkspaceBinding(workspaceId, existingPersonal.workspace_id);
              await writeWorkspace(workspaceId);
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
                  return applyCredentialAutofill(credentials, credentialDependencies());
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
