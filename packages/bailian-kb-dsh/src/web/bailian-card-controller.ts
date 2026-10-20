/**
 * Knowledge-base plugin page: volatile config for workspace and default services,
 * plus credential status, console autofill, and the service-list cache.
 */

import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-api-remotes/client";
import type { SnapshotStore } from "@deepseek-ai/dsh-client-store";
import {
  SettingsFormModel,
  settingsTextField,
  type SettingsFieldState,
  type SettingsFormActions,
  type SettingsFormScope,
  type SettingsFormShell,
} from "@deepseek-ai/dsh-client-ui-primitives";
/** Keep host HTTP failures visible even when a proxy or rejected request returns no JSON. */
async function readHostResponse(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json().catch(() => undefined);
  const record =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : undefined;
  if (!response.ok) {
    const detail =
      typeof record?.error === "string"
        ? record.error
        : response.status === 401
          ? "dsh authentication required; reopen the dsh launch URL. / 请通过 dsh 启动链接重新打开页面。"
          : response.status === 403
            ? "dsh rejected this request. / dsh 拒绝了此请求。"
            : response.status === 404
              ? "Plugin route unavailable; restart dsh with the updated plugin. / 插件接口不可用，请加载更新后的插件并重启 dsh。"
              : "Plugin request failed. / 插件请求失败。";
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }
  if (!record)
    throw new Error(
      `HTTP ${response.status}: Invalid or empty plugin response. / 插件返回空响应或无效响应。`,
    );
  return record;
}

export interface KbPluginSettings {
  workspaceId?: string;
  defaultRetrieveAgentId?: string;
  defaultChatAgentId?: string;
}

export interface ApiKeyStatus {
  configured: boolean;
  source?: "environment" | "local" | "projectEnvironment" | "userEnvironment";
  writable: boolean;
}

export interface ConsoleLoginStatus {
  phase: "idle" | "waiting" | "done" | "failed" | "running" | "awaitingLogin";
  loginUrl?: string;
  reason?: string;
}

export interface ServiceEntryView {
  agent_id: string;
  agent_name: string;
  scene: "search" | "chat";
  status: string;
}

export interface CacheView {
  status: "loading" | "ready" | "unconfigured" | "unavailable";
  fetchedAt?: number;
  searchCount: number;
  chatCount: number;
  truncated: boolean;
  stale: boolean;
  search: ServiceEntryView[];
  chat: ServiceEntryView[];
  refreshing: boolean;
}

export interface BailianCardState extends SettingsFormShell {
  workspaceDraft: string;
  apiKeyDraft: string;
  connectionBusy: boolean;
  defaultRetrieveAgentId: SettingsFieldState;
  defaultChatAgentId: SettingsFieldState;
  apiKey: ApiKeyStatus;
  consoleLogin: ConsoleLoginStatus | null;
  cache: CacheView;
  message: string | null;
}

export interface BailianCardFace extends SettingsFormActions {
  hooks: { bailianCard: SnapshotStore<BailianCardState> };
  setWorkspaceDraft: (value: string) => void;
  setApiKeyDraft: (value: string) => void;
  saveConnection: () => Promise<void>;
  beginConsoleLogin: () => Promise<void>;
  refreshServices: () => Promise<void>;
  refresh: () => Promise<void>;
}

interface CredentialEventRemote {
  $on(event: "credentials/reference-updated", listener: (reference: string) => void): () => void;
}

const EMPTY_CACHE: CacheView = {
  status: "loading",
  searchCount: 0,
  chatCount: 0,
  truncated: false,
  stale: false,
  search: [],
  chat: [],
  refreshing: false,
};

export class BailianCardController {
  private readonly form: SettingsFormModel<KbPluginSettings>;
  private readonly store: SnapshotStore<BailianCardState>;
  private workspaceDraft = "";
  private apiKeyDraft = "";
  private connectionEdited = false;
  private connectionBusy = false;
  private disposed = false;
  private apiKey: ApiKeyStatus = { configured: false, writable: true };
  private consoleLogin: ConsoleLoginStatus | null = null;
  private cache: CacheView = EMPTY_CACHE;
  private message: string | null = null;
  private loginPollTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly disposeRemoteListeners: Array<() => void> = [];

  constructor(
    scope: SettingsFormScope<KbPluginSettings>,
    private readonly client: ClientContext,
  ) {
    this.form = new SettingsFormModel(scope, [
      settingsTextField("defaultRetrieveAgentId"),
      settingsTextField("defaultChatAgentId"),
    ]);
    this.store = this.form.bind(() => this.projection());
    const credentialEvents = this.client.remote as CredentialEventRemote;
    this.disposeRemoteListeners.push(
      credentialEvents.$on("credentials/reference-updated", (reference: string) => {
        if (reference === "BAILIAN_KB_API_KEY") void this.refresh();
      }),
    );
    void this.refresh();
  }

  private projection(): BailianCardState {
    return {
      ...this.form.shell(),
      workspaceDraft: this.workspaceDraft,
      apiKeyDraft: this.apiKeyDraft,
      connectionBusy: this.connectionBusy,
      defaultRetrieveAgentId: this.form.field("defaultRetrieveAgentId"),
      defaultChatAgentId: this.form.field("defaultChatAgentId"),
      apiKey: this.apiKey,
      consoleLogin: this.consoleLogin,
      cache: this.cache,
      message: this.message,
    };
  }

  private publish(): void {
    this.store.set(this.projection());
  }

  async refresh(): Promise<void> {
    await Promise.all([this.refreshStatus(), this.refreshServices(false)]);
    this.scheduleLoginPoll();
  }

  private async refreshStatus(): Promise<void> {
    try {
      const response = await fetch("/bailian-kb/status");
      if (!response.ok) return;
      const body = (await readHostResponse(response)) as {
        workspaceId?: string;
        apiKey?: ApiKeyStatus;
        consoleLogin?: ConsoleLoginStatus;
      };
      if (!this.connectionEdited) this.workspaceDraft = body.workspaceId ?? "";
      this.apiKey = body.apiKey ?? { configured: false, writable: true };
      this.consoleLogin = body.consoleLogin ?? null;
      this.publish();
    } catch {
      /* keep the last snapshot */
    }
  }

  async refreshServices(force = true): Promise<void> {
    if (force) {
      this.cache = { ...this.cache, refreshing: true };
      this.publish();
    }
    try {
      const response = await fetch("/bailian-kb/services", { method: force ? "POST" : "GET" });
      if (!response.ok) {
        this.cache = { ...EMPTY_CACHE, status: "unavailable", refreshing: false };
        this.publish();
        return;
      }
      const body = (await readHostResponse(response)) as {
        configured?: boolean;
        status?: {
          fetchedAt?: number;
          searchCount?: number;
          chatCount?: number;
          truncated?: boolean;
          stale?: boolean;
        };
        search?: ServiceEntryView[];
        chat?: ServiceEntryView[];
      };
      if (!body.configured) {
        this.cache = { ...EMPTY_CACHE, status: "unconfigured", refreshing: false };
        this.publish();
        return;
      }
      const status = body.status ?? {};
      this.cache = {
        status: "ready",
        fetchedAt: status.fetchedAt,
        searchCount: status.searchCount ?? body.search?.length ?? 0,
        chatCount: status.chatCount ?? body.chat?.length ?? 0,
        truncated: status.truncated ?? false,
        stale: status.stale ?? false,
        search: body.search ?? [],
        chat: body.chat ?? [],
        refreshing: false,
      };
      this.publish();
    } catch {
      this.cache = { ...EMPTY_CACHE, status: "unavailable", refreshing: false };
      this.publish();
    }
  }

  setWorkspaceDraft(value: string): void {
    this.workspaceDraft = value;
    this.connectionEdited = true;
    this.publish();
  }

  setApiKeyDraft(value: string): void {
    this.apiKeyDraft = value;
    this.connectionEdited = true;
    this.publish();
  }

  async saveConnection(): Promise<void> {
    if (this.connectionBusy) return;
    this.connectionBusy = true;
    this.message = null;
    const apiKey = this.apiKeyDraft;
    this.publish();
    try {
      const response = await fetch("/bailian-kb/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey, workspaceId: this.workspaceDraft }),
      });
      const result = await readHostResponse(response);
      if (result.saved !== true) {
        throw new Error("Save not confirmed by the plugin. / 插件未确认保存成功。");
      }
      this.apiKeyDraft = "";
      this.connectionEdited = false;
      await this.refresh();
      await this.refreshServices(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Connection update failed. / 连接配置保存失败。";
      this.message = apiKey ? message.split(apiKey).join("[redacted]") : message;
    } finally {
      this.connectionBusy = false;
      if (!this.disposed) this.publish();
    }
  }

  async beginConsoleLogin(): Promise<void> {
    this.message = null;
    this.publish();
    try {
      const response = await fetch("/bailian-kb/autofill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "login" }),
      });
      const body = (await readHostResponse(response)) as {
        status?: string;
        loginUrl?: string;
        error?: string;
        reason?: string;
      };
      if (!response.ok || body.status === "failed") {
        this.message = body.reason || body.error || `HTTP ${response.status}`;
        this.consoleLogin = { phase: "failed", reason: this.message };
        this.publish();
        return;
      }
      this.consoleLogin = { phase: "awaitingLogin", loginUrl: body.loginUrl };
      this.publish();
      this.scheduleLoginPoll();
    } catch (error) {
      this.message = error instanceof Error ? error.message : "request failed";
      this.consoleLogin = { phase: "failed", reason: this.message };
      this.publish();
    }
  }

  private scheduleLoginPoll(): void {
    if (this.loginPollTimer !== undefined) clearTimeout(this.loginPollTimer);
    this.loginPollTimer = undefined;
    const phase = this.consoleLogin?.phase;
    if (phase !== "awaitingLogin" && phase !== "waiting" && phase !== "running") return;
    this.loginPollTimer = setTimeout(() => {
      this.loginPollTimer = undefined;
      void this.pollLogin();
    }, 1500);
  }

  private async pollLogin(): Promise<void> {
    try {
      const response = await fetch("/bailian-kb/autofill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "loginStatus" }),
      });
      const body = (await readHostResponse(response)) as {
        phase?: string;
        loginUrl?: string;
        reason?: string;
      };
      if (body.phase === "done") {
        this.apiKeyDraft = "";
        this.connectionEdited = false;
        this.consoleLogin = { phase: "done" };
        this.publish();
        await this.refresh();
        return;
      }
      if (body.phase === "failed") {
        this.consoleLogin = { phase: "failed", reason: body.reason };
        this.message = body.reason ?? null;
        this.publish();
        return;
      }
      this.consoleLogin = {
        phase: "awaitingLogin",
        loginUrl: body.loginUrl ?? this.consoleLogin?.loginUrl,
      };
      this.publish();
      this.scheduleLoginPoll();
    } catch {
      this.scheduleLoginPoll();
    }
  }

  inject(): BailianCardFace {
    return {
      ...this.form.actions(),
      hooks: { bailianCard: this.store },
      setWorkspaceDraft: (value) => this.setWorkspaceDraft(value),
      setApiKeyDraft: (value) => this.setApiKeyDraft(value),
      saveConnection: () => this.saveConnection(),
      beginConsoleLogin: () => this.beginConsoleLogin(),
      refreshServices: () => this.refreshServices(true),
      refresh: () => this.refresh(),
    };
  }

  dispose(): void {
    this.disposed = true;
    this.apiKeyDraft = "";
    this.publish();
    if (this.loginPollTimer !== undefined) clearTimeout(this.loginPollTimer);
    for (const dispose of this.disposeRemoteListeners) dispose();
    this.form.dispose();
  }
}
