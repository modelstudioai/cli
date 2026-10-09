/**
 * Settings page controller: Volatile plugin config via configForms + host status routes.
 */

import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-api-remotes/client";
import type { SnapshotStore } from "@deepseek-ai/dsh-client-store";
import {
  SettingsFormModel,
  settingsNumberField,
  settingsTextField,
  type SettingsFieldSpec,
  type SettingsFieldState,
  type SettingsFormActions,
  type SettingsFormShell,
  type SettingsFormScope,
} from "@deepseek-ai/dsh-client-ui-primitives";
import { PLUGIN_ENTRY_ID } from "../plugin-meta.js";
import {
  parseBooleanSetting,
  parseScoreSetting,
  projectMemoryDisplayState,
  type MemoryDisplayState,
} from "./config-ux-model.ts";

export const MEMO_NS = PLUGIN_ENTRY_ID;

export interface MemoPluginSettings {
  enabled?: boolean;
  autoRecall?: boolean;
  autoCurate?: boolean;
  extractProfile?: boolean;
  profileSchemaId?: string;
  recallTopK?: number;
  minScore?: number;
}

/** Boolean field staged as "true" / "false" text for a real Switch control. */
function settingsScoreField(field: string): SettingsFieldSpec {
  return {
    field,
    format: (value) => (typeof value === "number" ? String(value) : ""),
    parse: parseScoreSetting,
  };
}

function settingsBoolField(field: string): SettingsFieldSpec {
  return {
    field,
    format: (value) => (typeof value === "boolean" ? String(value) : ""),
    parse: parseBooleanSetting,
  };
}

export interface PersonalStatus {
  status: string;
  workspace_id: string | null;
  user_id: string | null;
  consented_at: string | null;
  last_error?: string | null;
}

export interface RecentTaskStatus {
  intentId: string;
  eventId: string | null;
  status: string;
  updatedAt: string;
  lastError: string | null;
  resultCount?: number;
  resultEventTypes?: string[];
}

export interface ConsoleLoginStatus {
  phase: "idle" | "waiting" | "done" | "failed";
  reason?: string;
}

export interface ApiKeyStatus {
  configured: boolean;
  source?: "environment" | "local" | "projectEnvironment" | "userEnvironment";
  writable: boolean;
}

interface CredentialEventRemote {
  $on(event: "credentials/reference-updated", listener: (reference: string) => void): () => void;
}

export interface MemoCardState extends SettingsFormShell {
  enabled: SettingsFieldState;
  autoRecall: SettingsFieldState;
  autoCurate: SettingsFieldState;
  extractProfile: SettingsFieldState;
  profileSchemaId: SettingsFieldState;
  profileSchemas: Array<{ id: string; name: string }>;
  profileSchemasLoading: boolean;
  profileSchemasError: string | null;
  recallTopK: SettingsFieldState;
  minScore: SettingsFieldState;
  memoryState: MemoryDisplayState;
  personal: PersonalStatus | null;
  recentTasks: RecentTaskStatus[];
  apiKey: ApiKeyStatus;
  consoleLoginStatus: ConsoleLoginStatus | null;
  workspaceDraft: string;
  apiKeyDraft: string;
  busy: boolean;
  message: string | null;
}

export interface MemoCardFace extends SettingsFormActions {
  hooks: {
    memoCard: SnapshotStore<MemoCardState>;
  };
  enable: () => Promise<void>;
  consoleLogin: () => Promise<void>;
  refresh: () => Promise<void>;
  setWorkspaceDraft: (text: string) => void;
  setApiKeyDraft: (text: string) => void;
  saveConnection: () => Promise<void>;
  refreshProfileSchemas: () => Promise<void>;
}

export class MemoCardController {
  private readonly form: SettingsFormModel<MemoPluginSettings>;
  private readonly store: SnapshotStore<MemoCardState>;
  private personal: PersonalStatus | null = null;
  private recentTasks: RecentTaskStatus[] = [];
  private apiKey: ApiKeyStatus = { configured: false, writable: true };
  private loginStatus: ConsoleLoginStatus | null = null;
  private workspaceDraft = "";
  private apiKeyDraft = "";
  private connectionDirty = false;
  private busy = false;
  private message: string | null = null;
  private profileSchemas: Array<{ id: string; name: string }> = [];
  private profileSchemasLoading = false;
  private profileSchemasError: string | null = null;
  private profileRequest = 0;
  private disposed = false;
  private loginPollTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly disposeRemoteListeners: Array<() => void> = [];

  constructor(
    scope: SettingsFormScope<MemoPluginSettings>,
    private readonly _ctx: ClientContext,
  ) {
    this.form = new SettingsFormModel(scope, [
      settingsBoolField("enabled"),
      settingsBoolField("autoRecall"),
      settingsBoolField("autoCurate"),
      settingsBoolField("extractProfile"),
      settingsTextField("profileSchemaId"),
      settingsNumberField("recallTopK"),
      settingsScoreField("minScore"),
    ]);
    this.store = this.form.bind(() => this.projection());
    const credentialEvents = this._ctx.remote as unknown as CredentialEventRemote;
    this.disposeRemoteListeners.push(
      credentialEvents.$on("credentials/reference-updated", (reference: string) => {
        if (reference === "BAILIAN_MEMO_API_KEY") void this.refresh();
      }),
    );
    void this.refresh();
  }

  private projection(): MemoCardState {
    const enabled = this.form.field("enabled");
    return {
      ...this.form.shell(),
      enabled,
      autoRecall: this.form.field("autoRecall"),
      autoCurate: this.form.field("autoCurate"),
      extractProfile: this.form.field("extractProfile"),
      profileSchemaId: this.form.field("profileSchemaId"),
      profileSchemas: this.profileSchemas,
      profileSchemasLoading: this.profileSchemasLoading,
      profileSchemasError: this.profileSchemasError,
      recallTopK: this.form.field("recallTopK"),
      minScore: this.form.field("minScore"),
      memoryState: projectMemoryDisplayState(this.personal, enabled.text !== "false"),
      personal: this.personal,
      recentTasks: this.recentTasks,
      apiKey: this.apiKey,
      consoleLoginStatus: this.loginStatus,
      workspaceDraft: this.workspaceDraft,
      apiKeyDraft: this.apiKeyDraft,
      busy: this.busy,
      message: this.message,
    };
  }

  private publish(): void {
    this.store.set(this.projection());
  }

  setWorkspaceDraft(text: string): void {
    this.workspaceDraft = text;
    this.connectionDirty = true;
    this.publish();
  }

  setApiKeyDraft(text: string): void {
    this.apiKeyDraft = text;
    this.connectionDirty = true;
    this.publish();
  }

  async saveConnection(): Promise<void> {
    await this.post(
      "/plugins/bailian-memo-dsh/credentials",
      {
        workspaceId: this.workspaceDraft.trim(),
        apiKey: this.apiKeyDraft,
      },
      () => {
        this.apiKeyDraft = "";
        this.connectionDirty = false;
      },
    );
  }

  async refresh(): Promise<void> {
    try {
      const response = await fetch("/plugins/bailian-memo-dsh/status");
      if (!response.ok) return;
      const body = (await response.json()) as {
        personal?: PersonalStatus;
        plugin?: { workspaceId?: string };
        apiKey?: ApiKeyStatus;
        consoleLogin?: ConsoleLoginStatus;
        recentTasks?: RecentTaskStatus[];
      };
      if (body.consoleLogin?.phase === "done" && this.loginStatus?.phase !== "done") {
        this.apiKeyDraft = "";
        this.connectionDirty = false;
      }
      if (!this.connectionDirty) this.workspaceDraft = body.plugin?.workspaceId ?? "";
      this.personal = body.personal ?? null;
      this.recentTasks = body.recentTasks ?? [];
      this.apiKey = body.apiKey ?? { configured: false, writable: true };
      this.loginStatus = body.consoleLogin ?? null;
      this.publish();
      this.scheduleLoginPoll();
      if (this.form.field("extractProfile").text === "true") await this.refreshProfileSchemas();
    } catch {
      /* keep last snapshot */
    }
  }

  async refreshProfileSchemas(): Promise<void> {
    if (this.disposed) return;
    const request = ++this.profileRequest;
    this.profileSchemasLoading = true;
    this.profileSchemasError = null;
    this.profileSchemas = [];
    this.publish();
    try {
      const response = await fetch("/plugins/bailian-memo-dsh/profile-schemas");
      const body = (await response.json().catch(() => ({}))) as {
        schemas?: Array<{ id: string; name: string }>;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      if (!Array.isArray(body.schemas))
        throw new Error("Invalid profile rule response. / 画像规则响应无效。");
      if (!this.disposed && request === this.profileRequest) this.profileSchemas = body.schemas;
    } catch (error) {
      if (!this.disposed && request === this.profileRequest)
        this.profileSchemasError =
          error instanceof Error ? error.message : "Profile rules unavailable. / 画像规则不可用。";
    } finally {
      if (!this.disposed && request === this.profileRequest) {
        this.profileSchemasLoading = false;
        this.publish();
      }
    }
  }

  private async post(path: string, body?: unknown, onSuccess?: () => void): Promise<void> {
    this.busy = true;
    this.message = null;
    this.publish();
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      if (!response.ok) {
        const text = await response.text();
        try {
          const parsed = JSON.parse(text) as { error?: string };
          this.message = parsed.error || text || `HTTP ${response.status}`;
        } catch {
          this.message = text || `HTTP ${response.status}`;
        }
      } else {
        onSuccess?.();
        this.message = null;
      }
      await this.refresh();
    } catch (error) {
      this.message = error instanceof Error ? error.message : "request failed";
      this.publish();
    } finally {
      this.busy = false;
      this.publish();
    }
  }

  async enable(): Promise<void> {
    await this.post("/plugins/bailian-memo-dsh/enable", {
      workspaceId: this.workspaceDraft.trim(),
    });
  }

  async consoleLogin(): Promise<void> {
    await this.post("/plugins/bailian-memo-dsh/console-login", { site: "domestic" });
  }

  private scheduleLoginPoll(): void {
    if (this.loginPollTimer !== undefined) clearTimeout(this.loginPollTimer);
    this.loginPollTimer = undefined;
    if (this.loginStatus?.phase !== "waiting") return;
    this.loginPollTimer = setTimeout(() => {
      this.loginPollTimer = undefined;
      void this.refresh();
    }, 1000);
  }

  inject(): MemoCardFace {
    const actions = this.form.actions();
    return {
      ...actions,
      edit: (field, text) => {
        actions.edit(field, text);
        if (field === "extractProfile" && text === "true") void this.refreshProfileSchemas();
      },
      save: () => {
        if (this.form.field("extractProfile").text === "true") {
          const selected =
            this.form.field("profileSchemaId").text || this.profileSchemas.at(-1)?.id;
          if (
            this.profileSchemasLoading ||
            !selected ||
            !this.profileSchemas.some((schema) => schema.id === selected)
          ) {
            this.profileSchemasError =
              "Choose an available profile rule before saving. / 保存前请选择可用的画像规则。";
            this.publish();
            return;
          }
          actions.edit("profileSchemaId", selected);
        }
        actions.save();
      },
      refreshProfileSchemas: () => this.refreshProfileSchemas(),
      hooks: { memoCard: this.store },
      enable: () => this.enable(),
      consoleLogin: () => this.consoleLogin(),
      refresh: () => this.refresh(),
      setWorkspaceDraft: (text) => this.setWorkspaceDraft(text),
      setApiKeyDraft: (text) => this.setApiKeyDraft(text),
      saveConnection: () => this.saveConnection(),
    };
  }

  dispose(): void {
    this.disposed = true;
    this.profileRequest += 1;
    this.apiKeyDraft = "";
    this.publish();
    if (this.loginPollTimer !== undefined) clearTimeout(this.loginPollTimer);
    for (const dispose of this.disposeRemoteListeners) dispose();
    this.form.dispose();
  }
}
