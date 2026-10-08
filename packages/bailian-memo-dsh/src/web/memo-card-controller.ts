/**
 * Settings page controller: Volatile plugin config via configForms + host status routes.
 */

import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-api-remotes/client";
import type { SnapshotStore } from "@deepseek-ai/dsh-client-store";
import {
  SettingsFormModel,
  settingsNumberField,
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
  profile_schema_id: string | null;
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
  recallTopK: SettingsFieldState;
  minScore: SettingsFieldState;
  memoryState: MemoryDisplayState;
  personal: PersonalStatus | null;
  recentTasks: RecentTaskStatus[];
  apiKey: ApiKeyStatus;
  consoleLoginStatus: ConsoleLoginStatus | null;
  workspaceDraft: string;
  busy: boolean;
  message: string | null;
}

export interface MemoCardFace extends SettingsFormActions {
  hooks: {
    memoCard: SnapshotStore<MemoCardState>;
  };
  enable: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  consoleLogin: () => Promise<void>;
  refresh: () => Promise<void>;
  setWorkspaceDraft: (text: string) => void;
}

export class MemoCardController {
  private readonly form: SettingsFormModel<MemoPluginSettings>;
  private readonly store: SnapshotStore<MemoCardState>;
  private personal: PersonalStatus | null = null;
  private recentTasks: RecentTaskStatus[] = [];
  private apiKey: ApiKeyStatus = { configured: false, writable: true };
  private loginStatus: ConsoleLoginStatus | null = null;
  private workspaceDraft = "";
  private busy = false;
  private message: string | null = null;
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
      settingsNumberField("recallTopK"),
      settingsScoreField("minScore"),
    ]);
    this.store = this.form.bind(() => this.projection());
    const credentialEvents = this._ctx.remote as typeof this._ctx.remote & CredentialEventRemote;
    this.disposeRemoteListeners.push(
      credentialEvents.$on("credentials/reference-updated", (reference) => {
        if (reference === "DASHSCOPE_API_KEY") void this.refresh();
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
      recallTopK: this.form.field("recallTopK"),
      minScore: this.form.field("minScore"),
      memoryState: projectMemoryDisplayState(this.personal, enabled.text !== "false"),
      personal: this.personal,
      recentTasks: this.recentTasks,
      apiKey: this.apiKey,
      consoleLoginStatus: this.loginStatus,
      workspaceDraft: this.workspaceDraft,
      busy: this.busy,
      message: this.message,
    };
  }

  private publish(): void {
    this.store.set(this.projection());
  }

  setWorkspaceDraft(text: string): void {
    this.workspaceDraft = text;
    this.publish();
  }

  async refresh(): Promise<void> {
    try {
      const response = await fetch("/plugins/bailian-memo-dsh/status");
      if (!response.ok) return;
      const body = (await response.json()) as {
        personal?: PersonalStatus;
        apiKey?: ApiKeyStatus;
        consoleLogin?: ConsoleLoginStatus;
        recentTasks?: RecentTaskStatus[];
      };
      this.personal = body.personal ?? null;
      this.recentTasks = body.recentTasks ?? [];
      this.apiKey = body.apiKey ?? { configured: false, writable: true };
      this.loginStatus = body.consoleLogin ?? null;
      if (this.personal?.workspace_id && !this.workspaceDraft) {
        this.workspaceDraft = this.personal.workspace_id;
      }
      this.publish();
      this.scheduleLoginPoll();
    } catch {
      /* keep last snapshot */
    }
  }

  private async post(path: string, body?: unknown): Promise<void> {
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

  async pause(): Promise<void> {
    await this.post("/plugins/bailian-memo-dsh/pause");
  }

  async resume(): Promise<void> {
    await this.post("/plugins/bailian-memo-dsh/resume");
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
    return {
      ...this.form.actions(),
      hooks: { memoCard: this.store },
      enable: () => this.enable(),
      pause: () => this.pause(),
      resume: () => this.resume(),
      consoleLogin: () => this.consoleLogin(),
      refresh: () => this.refresh(),
      setWorkspaceDraft: (text) => this.setWorkspaceDraft(text),
    };
  }

  dispose(): void {
    if (this.loginPollTimer !== undefined) clearTimeout(this.loginPollTimer);
    for (const dispose of this.disposeRemoteListeners) dispose();
    this.form.dispose();
  }
}
