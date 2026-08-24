/**
 * The Bailian page's controller: a hybrid form over two domains.
 *
 * The workspace, default-retrieval-service and default-chat-service ids live
 * in the `bailian-kb` settings section the Host half registers. The Host
 * exposes them over a bridge route (`/bailian-kb/settings`) so the page can
 * read and write without riding the settings wire (which requires an apiproxy
 * allowlist entry the composition does not grant out-of-tree namespaces).
 *
 * The API key always rides its credential reference (write-only by design:
 * the wire is structurally value-free), so that control starts blank and
 * reports only configured/unconfigured.
 */

import type { IApiClient } from "@deepseek-ai/dsh-client-connection/client";
import { createSnapshotStore, type SnapshotStore } from "@deepseek-ai/dsh-client-runtime/client";

/** The credential references this page addresses, keyed by their ref names. */
export const BAILIAN_CARD_REFS = [
  "DASHSCOPE_API_KEY",
  "BAILIAN_WORKSPACE_ID",
  "BAILIAN_DEFAULT_RETRIEVE_AGENT_ID",
  "BAILIAN_DEFAULT_CHAT_AGENT_ID",
] as const;

/** One page field, addressed by its credential reference. */
export type BailianFieldKey = (typeof BAILIAN_CARD_REFS)[number];

/** Settings-section field names of the echoing controls. */
export type BailianSettingsField = "workspaceId" | "defaultRetrieveAgentId" | "defaultChatAgentId";

/** Credential reference → settings-section field, for the hybrid controls. */
export const SETTINGS_FIELDS: Partial<Record<BailianFieldKey, BailianSettingsField>> = {
  BAILIAN_WORKSPACE_ID: "workspaceId",
  BAILIAN_DEFAULT_RETRIEVE_AGENT_ID: "defaultRetrieveAgentId",
  BAILIAN_DEFAULT_CHAT_AGENT_ID: "defaultChatAgentId",
};

/** The section subset this page reads and writes (the namespace holds the whole plugin Config). */
export interface BailianKbSection {
  workspaceId?: string;
  defaultRetrieveAgentId?: string;
  defaultChatAgentId?: string;
}

/** What the credentials domain reports for one reference (never the value). */
export interface BailianCredentialView {
  /** Whether any layer supplies a value for the reference. */
  configured: boolean;
  /** Whether `credentials.set` can affect it; false disables the control. */
  writable: boolean;
}

/** The page's mirror of the settings scope. */
export interface BailianSettingsView {
  /** `ready` enables echo; `unavailable` degrades to write-only credentials. */
  status: "loading" | "ready" | "unavailable";
  /** Whether the Host settings document accepts writes. */
  writable: boolean;
  /** Resolved section values (entry base + user layer) for the two hybrid controls. */
  values: BailianKbSection;
}

/** Where the autofill flow (adopt a Bailian console login) currently stands. */
export type BailianAutofillStatus = "idle" | "running" | "awaitingLogin" | "done" | "failed";

/** One cached retrieval or Q&A service, as the picker lists it. */
export interface BailianServiceEntry {
  agent_id: string;
  agent_name: string;
  scene: "search" | "chat";
  status: string;
  modify_time?: string;
}

/**
 * The service cache as the panel shows it.
 *
 * This exists because cache staleness is otherwise invisible: an agent that
 * silently stops retrieving looks identical whether the workspace is empty or the
 * list is merely out of date. `fetchedAt` with the per-scene counts distinguishes
 * those two in one glance, which is the whole reason the panel earns its space.
 */
export interface BailianCacheView {
  /** `unconfigured` = no workspace id yet; `unavailable` = the bridge route failed. */
  status: "loading" | "ready" | "unconfigured" | "unavailable";
  /** Epoch millis of the last successful fetch; absent when nothing is cached. */
  fetchedAt?: number;
  searchCount: number;
  chatCount: number;
  /** Server-reported total, which exceeds the counts when the fetch was capped. */
  total: number;
  truncated: boolean;
  stale: boolean;
  search: BailianServiceEntry[];
  chat: BailianServiceEntry[];
  /** Whether a forced refresh is in flight. */
  refreshing: boolean;
}

/** What the Bailian page renders. */
export interface BailianCardState {
  /** Staged drafts; undefined = untouched (the control shows the echoed value). */
  drafts: Record<BailianFieldKey, string | undefined>;
  /** Last credentials-domain answer per reference; unknown refs read as writable. */
  credentials: Record<BailianFieldKey, BailianCredentialView>;
  /** Settings-scope echo state for the id fields. */
  settings: BailianSettingsView;
  /** Whether a save is in flight. */
  saving: boolean;
  /** Whether a default-service clear is in flight. */
  clearing: boolean;
  /** Whether the last save or clear was refused; drafts are kept for correction. */
  failed: boolean;
  /** The autofill flow's state; feeds the button label and its result notice. */
  autofill: BailianAutofillStatus;
  /** Console login URL while `awaitingLogin`, shown in case the host could not open a browser. */
  autofillLoginUrl?: string;
  /** Service cache diagnostics and the pickable services. */
  cache: BailianCacheView;
}

/** The registration-side face the page's slot entry injects. */
export interface BailianCardFace {
  hooks: {
    /** Page snapshot bound by the renderer as useBailianCard. */
    bailianCard: SnapshotStore<BailianCardState>;
  };
  /** Stage one draft. */
  edit: (key: BailianFieldKey, text: string) => void;
  /** Write every staged draft through its domain, then re-read. */
  save: () => Promise<void>;
  /** Drop every staged draft. */
  discard: () => void;
  /** Remove the stored default service from every writable layer, then re-read. */
  clearDefaultAgent: (
    key: "BAILIAN_DEFAULT_RETRIEVE_AGENT_ID" | "BAILIAN_DEFAULT_CHAT_AGENT_ID",
  ) => Promise<void>;
  /** Adopt a Bailian console login (api key + workspace id) via the Host. */
  autofill: () => Promise<void>;
  /** Force a service-cache refresh, bypassing the TTL. */
  refreshServices: () => Promise<void>;
  /**
   * Pin one scene's default service, or clear it when `agentId` is undefined.
   * Clearing removes the value from the settings user layer AND the credential
   * store, so the fallback chain cannot resurrect what the user just cleared.
   */
  selectDefaultAgent: (scene: "search" | "chat", agentId: string | undefined) => Promise<void>;
}

/** The text a field's control shows when its draft is untouched. */
export function echoedValue(state: BailianCardState, key: BailianFieldKey): string {
  const field = SETTINGS_FIELDS[key];
  if (field === undefined || state.settings.status !== "ready") return "";
  return state.settings.values[field] ?? "";
}

/** Whether one field stages a change a save would write. */
function staged(state: BailianCardState, key: BailianFieldKey): boolean {
  const draft = state.drafts[key];
  if (draft === undefined) return false;
  const field = SETTINGS_FIELDS[key];
  if (field !== undefined && state.settings.status === "ready") {
    return draft !== echoedValue(state, key);
  }
  // Write-only control: blank means untouched, never "erase the stored value".
  return draft !== "";
}

/** Whether any field stages a change (enables Save/Discard). */
export function dirtyOf(state: BailianCardState): boolean {
  return BAILIAN_CARD_REFS.some((key) => staged(state, key));
}

/** Bridge the settings bridge route and the credentials domain onto the page. */
export class BailianCardController {
  private readonly store: SnapshotStore<BailianCardState>;

  /**
   * @param api - wire face used for the three credential references.
   */
  constructor(private readonly api: Pick<IApiClient, "credentials">) {
    this.store = createSnapshotStore<BailianCardState>({
      drafts: {
        DASHSCOPE_API_KEY: undefined,
        BAILIAN_WORKSPACE_ID: undefined,
        BAILIAN_DEFAULT_RETRIEVE_AGENT_ID: undefined,
        BAILIAN_DEFAULT_CHAT_AGENT_ID: undefined,
      },
      credentials: {
        DASHSCOPE_API_KEY: { configured: false, writable: true },
        BAILIAN_WORKSPACE_ID: { configured: false, writable: true },
        BAILIAN_DEFAULT_RETRIEVE_AGENT_ID: { configured: false, writable: true },
        BAILIAN_DEFAULT_CHAT_AGENT_ID: { configured: false, writable: true },
      },
      settings: { status: "loading", writable: false, values: {} },
      saving: false,
      clearing: false,
      failed: false,
      autofill: "idle",
      autofillLoginUrl: undefined,
      cache: {
        status: "loading",
        searchCount: 0,
        chatCount: 0,
        total: 0,
        truncated: false,
        stale: true,
        search: [],
        chat: [],
        refreshing: false,
      },
    });
    void this.fetchSettings();
    void this.fetchServices();
    void this.read();
  }

  /**
   * Fetch the current settings from the Host bridge route. Called at
   * construction and after every mutation (save, clear).
   */
  async fetchSettings(): Promise<void> {
    try {
      const resp = await fetch("/bailian-kb/settings");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const value = (await resp.json()) as Record<string, unknown>;
      this.store.update((draft) => {
        draft.settings = {
          status: "ready",
          writable: true,
          values: {
            ...(typeof value.workspaceId === "string" ? { workspaceId: value.workspaceId } : {}),
            ...(typeof value.defaultRetrieveAgentId === "string"
              ? { defaultRetrieveAgentId: value.defaultRetrieveAgentId }
              : {}),
            ...(typeof value.defaultChatAgentId === "string"
              ? { defaultChatAgentId: value.defaultChatAgentId }
              : {}),
          },
        };
      });
    } catch (_fetchFailure) {
      this.store.update((draft) => {
        draft.settings = { status: "unavailable", writable: false, values: {} };
      });
    }
  }

  /**
   * Read the service cache snapshot from the Host bridge route.
   * @param force - POST instead of GET, making the Host refetch regardless of TTL.
   */
  async fetchServices(force = false): Promise<void> {
    if (force)
      this.store.update((draft) => {
        draft.cache.refreshing = true;
      });
    try {
      const resp = await fetch("/bailian-kb/services", { method: force ? "POST" : "GET" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const value = (await resp.json()) as {
        configured?: boolean;
        status?: {
          fetchedAt?: number;
          searchCount?: number;
          chatCount?: number;
          total?: number;
          truncated?: boolean;
          stale?: boolean;
        };
        search?: BailianServiceEntry[];
        chat?: BailianServiceEntry[];
      };
      this.store.update((draft) => {
        draft.cache.refreshing = false;
        if (value.configured !== true) {
          // No workspace id yet: the panel says so rather than showing zeros,
          // which would read as "the workspace has no services".
          draft.cache.status = "unconfigured";
          return;
        }
        draft.cache.status = "ready";
        draft.cache.fetchedAt = value.status?.fetchedAt;
        draft.cache.searchCount = value.status?.searchCount ?? 0;
        draft.cache.chatCount = value.status?.chatCount ?? 0;
        draft.cache.total = value.status?.total ?? 0;
        draft.cache.truncated = value.status?.truncated === true;
        draft.cache.stale = value.status?.stale === true;
        draft.cache.search = value.search ?? [];
        draft.cache.chat = value.chat ?? [];
      });
    } catch (_routeFailure) {
      this.store.update((draft) => {
        draft.cache.refreshing = false;
        draft.cache.status = "unavailable";
      });
    }
  }

  /** Force a refresh, bypassing the TTL, and show the updated numbers. */
  async refreshServices(): Promise<void> {
    if (this.store.getSnapshot().cache.refreshing) return;
    await this.fetchServices(true);
  }

  /**
   * Pin or clear one scene's default service.
   *
   * Clearing delegates to {@link clearDefaultAgent}, which removes the value from
   * the settings user layer AND the credential store — without the second
   * removal the fallback chain would resurrect what the user just cleared.
   * @param scene - which tool's default to set.
   * @param agentId - the service id to pin, or undefined to clear.
   */
  async selectDefaultAgent(scene: "search" | "chat", agentId: string | undefined): Promise<void> {
    const key =
      scene === "search" ? "BAILIAN_DEFAULT_RETRIEVE_AGENT_ID" : "BAILIAN_DEFAULT_CHAT_AGENT_ID";
    if (agentId === undefined) {
      await this.clearDefaultAgent(key);
      return;
    }
    const field: BailianSettingsField =
      scene === "search" ? "defaultRetrieveAgentId" : "defaultChatAgentId";
    this.store.update((draft) => {
      draft.saving = true;
    });
    try {
      const resp = await fetch("/bailian-kb/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: agentId }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      this.store.update((draft) => {
        draft.failed = false;
      });
    } catch (_writeFailure) {
      this.store.update((draft) => {
        draft.failed = true;
      });
    } finally {
      this.store.update((draft) => {
        draft.saving = false;
      });
      await this.fetchSettings();
    }
  }

  /**
   * Stage one draft; any edit clears the failure mark so the banner does not
   * outlive the correction it asks for.
   * @param key - the field's credential reference.
   * @param text - the staged text.
   */
  edit(key: BailianFieldKey, text: string): void {
    this.store.update((draft) => {
      draft.drafts[key] = text;
      draft.failed = false;
    });
  }

  /**
   * Write every staged draft through its domain: echoing fields go to the
   * settings user layer via the bridge route (blank = removal, falling back
   * to entry config and the credential store), write-only fields go to
   * `credentials.set`. A refused credential write keeps its draft; a refused
   * settings write self-heals by re-fetching the Host value.
   */
  async save(): Promise<void> {
    const state = this.store.getSnapshot();
    if (state.saving || !dirtyOf(state)) return;
    this.store.update((draft) => {
      draft.saving = true;
    });
    let failed = false;
    const settingsPatch: Record<string, unknown> = {};
    let hasSettingsWrite = false;
    const credentialWrites: Promise<void>[] = [];
    const settled: BailianFieldKey[] = [];
    for (const key of BAILIAN_CARD_REFS) {
      if (!staged(state, key)) continue;
      const text = state.drafts[key] as string;
      const field = SETTINGS_FIELDS[key];
      if (field !== undefined && state.settings.status === "ready") {
        settingsPatch[field] = text === "" ? null : text;
        hasSettingsWrite = true;
        settled.push(key);
        continue;
      }
      credentialWrites.push(
        (async () => {
          try {
            const response = await this.api.credentials.set({ ref: key, value: text });
            if (response.result.ok) settled.push(key);
            else failed = true;
          } catch (_credentialWriteFailure) {
            failed = true;
          }
        })(),
      );
    }
    if (hasSettingsWrite) {
      try {
        await this.saveSettings(settingsPatch);
      } catch (_settingsWriteFailure) {
        failed = true;
      }
    }
    await Promise.all(credentialWrites);
    this.store.update((draft) => {
      draft.saving = false;
      draft.failed = failed;
      for (const key of settled) draft.drafts[key] = undefined;
    });
    await this.fetchSettings();
    await this.read();
  }

  /** Drop every staged draft and the failure mark. */
  discard(): void {
    this.store.update((draft) => {
      for (const ref of BAILIAN_CARD_REFS) draft.drafts[ref] = undefined;
      draft.failed = false;
    });
  }

  /**
   * Fetch credentials by signing in to the Bailian console. The Host drives
   * the console's callback protocol itself, always asking for a freshly issued
   * api key, then persists the key into the credential store and the workspace
   * id into the settings section — so both values belong to the account that
   * just signed in, and the plain key never rides the wire to this page.
   *
   * Deliberately does NOT adopt the bl CLI's stored login: reusing a key from
   * `~/.bailian/config.json` can pair one account's key with another account's
   * workspace id (the CLI refuses to re-issue once any key is stored), and
   * nothing would flag the mismatch until a knowledge-base call fails.
   */
  async autofill(): Promise<void> {
    const phase = this.store.getSnapshot().autofill;
    if (phase === "running" || phase === "awaitingLogin") return;
    this.store.update((draft) => {
      draft.autofill = "running";
      draft.autofillLoginUrl = undefined;
    });
    await this.runConsoleLogin();
    await this.fetchSettings();
    await this.read();
  }

  /**
   * Ask the Host to open the console login page, then poll for the outcome.
   * The Host persists the credentials itself when the callback lands, always
   * asking the console to issue a fresh key — so the key and the workspace id
   * both come from the account signing in. (The bl CLI's own login refuses to
   * re-issue once any key is stored, which would otherwise pair an old
   * account's key with a new account's workspace.)
   */
  private async runConsoleLogin(): Promise<void> {
    let started: { status?: string; loginUrl?: string };
    try {
      started = (await this.postAutofill("login")) as { status?: string; loginUrl?: string };
    } catch (_routeFailure) {
      this.store.update((draft) => {
        draft.autofill = "failed";
      });
      return;
    }
    if (started.status !== "started" && started.status !== "already-running") {
      this.store.update((draft) => {
        draft.autofill = "failed";
      });
      return;
    }
    this.store.update((draft) => {
      draft.autofill = "awaitingLogin";
      draft.autofillLoginUrl = started.loginUrl;
    });
    await this.pollConsoleLogin();
  }

  /**
   * Poll the Host until the console login resolves. Bounded so a login the
   * user abandons does not leave the button spinning forever; the Host keeps
   * its own (longer) timeout, so a late callback still persists and shows up
   * on the next page read.
   */
  private async pollConsoleLogin(): Promise<void> {
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      let phase: string | undefined;
      try {
        phase = ((await this.postAutofill("loginStatus")) as { phase?: string }).phase;
      } catch (_pollFailure) {
        continue;
      }
      if (phase === "done") {
        this.store.update((draft) => {
          draft.autofill = "done";
          draft.autofillLoginUrl = undefined;
        });
        return;
      }
      if (phase === "failed") {
        this.store.update((draft) => {
          draft.autofill = "failed";
          draft.autofillLoginUrl = undefined;
        });
        return;
      }
    }
    this.store.update((draft) => {
      draft.autofill = "failed";
    });
  }

  /**
   * Remove the stored default service from every writable layer — the
   * settings user layer AND the credential store, so the fallback chain does
   * not resurrect the value the user just cleared. Both removals are
   * idempotent; the credential unset is skipped when nothing is stored there.
   * @param key - which default service credential to clear.
   */
  async clearDefaultAgent(
    key: "BAILIAN_DEFAULT_RETRIEVE_AGENT_ID" | "BAILIAN_DEFAULT_CHAT_AGENT_ID",
  ): Promise<void> {
    const settingsField: BailianSettingsField =
      key === "BAILIAN_DEFAULT_RETRIEVE_AGENT_ID" ? "defaultRetrieveAgentId" : "defaultChatAgentId";
    const state = this.store.getSnapshot();
    if (state.clearing) return;
    this.store.update((draft) => {
      draft.clearing = true;
    });
    let failed = false;
    if (state.settings.status === "ready") {
      try {
        await this.saveSettings({ [settingsField]: null });
      } catch (_settingsWriteFailure) {
        failed = true;
      }
    }
    if (state.credentials[key].configured) {
      try {
        const response = await this.api.credentials.unset({ ref: key });
        if (!response.result.ok) failed = true;
      } catch (_credentialWriteFailure) {
        failed = true;
      }
    }
    this.store.update((draft) => {
      draft.clearing = false;
      draft.failed = failed;
      draft.drafts[key] = undefined;
    });
    await this.fetchSettings();
    await this.read();
  }

  /**
   * Re-read after the Host reports a change to a reference this page watches.
   *
   * A value can be written from somewhere else — the Models page addresses
   * DASHSCOPE_API_KEY too, and the file store accepts external edits — so
   * without this the badges keep reporting a state the Host already replaced.
   * (Settings-document changes reach the page through the scope instead.)
   * @param ref - the reference the Host reports as changed.
   */
  refresh(ref: string): void {
    if (!(BAILIAN_CARD_REFS as readonly string[]).includes(ref)) return;
    void this.read();
  }

  /**
   * Build the face the page's slot registration injects.
   * @returns the page's snapshot and its actions.
   */
  inject(): BailianCardFace {
    return {
      hooks: { bailianCard: this.store },
      edit: (key, text) => {
        this.edit(key, text);
      },
      save: () => this.save(),
      discard: () => {
        this.discard();
      },
      clearDefaultAgent: (key) => this.clearDefaultAgent(key),
      autofill: () => this.autofill(),
      refreshServices: () => this.refreshServices(),
      selectDefaultAgent: (scene, agentId) => this.selectDefaultAgent(scene, agentId),
    };
  }

  /**
   * Post one autofill action to the Host bridge route.
   * @param action - `login` starts the console browser flow; `loginStatus`
   * reads that flow's progress.
   * @returns the route's JSON answer.
   */
  private async postAutofill(action: "login" | "loginStatus"): Promise<unknown> {
    const resp = await fetch("/bailian-kb/autofill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  }

  /**
   * Send a settings patch to the Host bridge route. `null`-valued keys are
   * removals (the field falls back to the entry config and then the
   * credential store); other values are merged into the user layer.
   * @param patch - the partial settings update.
   */
  private async saveSettings(patch: Record<string, unknown>): Promise<void> {
    const resp = await fetch("/bailian-kb/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!resp.ok) {
      const body = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `HTTP ${resp.status}`);
    }
  }

  /**
   * Ask the credentials domain about all three references and publish the
   * answer. A failed read keeps the last known state: the page stays usable
   * and a write still reaches the Host.
   */
  private async read(): Promise<void> {
    let response: Awaited<ReturnType<IApiClient["credentials"]["describe"]>>;
    try {
      response = await this.api.credentials.describe({ refs: [...BAILIAN_CARD_REFS] });
    } catch (_credentialReadFailure) {
      return;
    }
    if (!response.result.ok) return;
    const view = response.result.value.credentials;
    this.store.update((draft) => {
      for (const ref of BAILIAN_CARD_REFS) {
        // An unknown reference reads as writable: the control stays usable and
        // the Host is what refuses, rather than the page guessing a refusal.
        draft.credentials[ref] = {
          configured: view[ref]?.configured ?? false,
          writable: view[ref]?.writable ?? true,
        };
      }
    });
  }
}
