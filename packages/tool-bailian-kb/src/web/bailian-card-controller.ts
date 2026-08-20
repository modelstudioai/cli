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

import type { IApiClient } from '@deepseek-ai/dsh-client-connection/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** The credential references this page addresses, keyed by their ref names. */
export const BAILIAN_CARD_REFS = [
  'DASHSCOPE_API_KEY',
  'BAILIAN_WORKSPACE_ID',
  'BAILIAN_DEFAULT_RETRIEVE_AGENT_ID',
  'BAILIAN_DEFAULT_CHAT_AGENT_ID',
] as const

/** One page field, addressed by its credential reference. */
export type BailianFieldKey = (typeof BAILIAN_CARD_REFS)[number]

/** Settings-section field names of the echoing controls. */
export type BailianSettingsField = 'workspaceId' | 'defaultRetrieveAgentId' | 'defaultChatAgentId'

/** Credential reference → settings-section field, for the hybrid controls. */
export const SETTINGS_FIELDS: Partial<Record<BailianFieldKey, BailianSettingsField>> = {
  BAILIAN_WORKSPACE_ID: 'workspaceId',
  BAILIAN_DEFAULT_RETRIEVE_AGENT_ID: 'defaultRetrieveAgentId',
  BAILIAN_DEFAULT_CHAT_AGENT_ID: 'defaultChatAgentId',
}

/** The section subset this page reads and writes (the namespace holds the whole plugin Config). */
export interface BailianKbSection {
  workspaceId?: string
  defaultRetrieveAgentId?: string
  defaultChatAgentId?: string
}

/** What the credentials domain reports for one reference (never the value). */
export interface BailianCredentialView {
  /** Whether any layer supplies a value for the reference. */
  configured: boolean
  /** Whether `credentials.set` can affect it; false disables the control. */
  writable: boolean
}

/** The page's mirror of the settings scope. */
export interface BailianSettingsView {
  /** `ready` enables echo; `unavailable` degrades to write-only credentials. */
  status: 'loading' | 'ready' | 'unavailable'
  /** Whether the Host settings document accepts writes. */
  writable: boolean
  /** Resolved section values (entry base + user layer) for the two hybrid controls. */
  values: BailianKbSection
}

/** Where the autofill flow (adopt the bl CLI's stored login) currently stands. */
export type BailianAutofillStatus = 'idle' | 'running' | 'done' | 'loginStarted' | 'blMissing' | 'failed'

/** What the Bailian page renders. */
export interface BailianCardState {
  /** Staged drafts; undefined = untouched (the control shows the echoed value). */
  drafts: Record<BailianFieldKey, string | undefined>
  /** Last credentials-domain answer per reference; unknown refs read as writable. */
  credentials: Record<BailianFieldKey, BailianCredentialView>
  /** Settings-scope echo state for the id fields. */
  settings: BailianSettingsView
  /** Whether a save is in flight. */
  saving: boolean
  /** Whether a default-service clear is in flight. */
  clearing: boolean
  /** Whether the last save or clear was refused; drafts are kept for correction. */
  failed: boolean
  /** The autofill flow's state; feeds the button label and its result notice. */
  autofill: BailianAutofillStatus
}

/** The registration-side face the page's slot entry injects. */
export interface BailianCardFace {
  hooks: {
    /** Page snapshot bound by the renderer as useBailianCard. */
    bailianCard: SnapshotStore<BailianCardState>
  }
  /** Stage one draft. */
  edit: (key: BailianFieldKey, text: string) => void
  /** Write every staged draft through its domain, then re-read. */
  save: () => Promise<void>
  /** Drop every staged draft. */
  discard: () => void
  /** Remove the stored default service from every writable layer, then re-read. */
  clearDefaultAgent: (key: 'BAILIAN_DEFAULT_RETRIEVE_AGENT_ID' | 'BAILIAN_DEFAULT_CHAT_AGENT_ID') => Promise<void>
  /** Adopt the bl CLI's stored login (api key + workspace id) via the Host. */
  autofill: () => Promise<void>
}

/** The text a field's control shows when its draft is untouched. */
export function echoedValue(state: BailianCardState, key: BailianFieldKey): string {
  const field = SETTINGS_FIELDS[key]
  if (field === undefined || state.settings.status !== 'ready') return ''
  return state.settings.values[field] ?? ''
}

/** Whether one field stages a change a save would write. */
function staged(state: BailianCardState, key: BailianFieldKey): boolean {
  const draft = state.drafts[key]
  if (draft === undefined) return false
  const field = SETTINGS_FIELDS[key]
  if (field !== undefined && state.settings.status === 'ready') {
    return draft !== echoedValue(state, key)
  }
  // Write-only control: blank means untouched, never "erase the stored value".
  return draft !== ''
}

/** Whether any field stages a change (enables Save/Discard). */
export function dirtyOf(state: BailianCardState): boolean {
  return BAILIAN_CARD_REFS.some(key => staged(state, key))
}

/** Bridge the settings bridge route and the credentials domain onto the page. */
export class BailianCardController {
  private readonly store: SnapshotStore<BailianCardState>

  /**
   * @param api - wire face used for the three credential references.
   */
  constructor(
    private readonly api: Pick<IApiClient, 'credentials'>,
  ) {
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
      settings: { status: 'loading', writable: false, values: {} },
      saving: false,
      clearing: false,
      failed: false,
      autofill: 'idle',
    })
    void this.fetchSettings()
    void this.read()
  }

  /**
   * Fetch the current settings from the Host bridge route. Called at
   * construction and after every mutation (save, clear).
   */
  async fetchSettings(): Promise<void> {
    try {
      const resp = await fetch('/bailian-kb/settings')
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const value = await resp.json() as Record<string, unknown>
      this.store.update(draft => {
        draft.settings = {
          status: 'ready',
          writable: true,
          values: {
            ...(typeof value.workspaceId === 'string' ? { workspaceId: value.workspaceId } : {}),
            ...(typeof value.defaultRetrieveAgentId === 'string' ? { defaultRetrieveAgentId: value.defaultRetrieveAgentId } : {}),
            ...(typeof value.defaultChatAgentId === 'string' ? { defaultChatAgentId: value.defaultChatAgentId } : {}),
          },
        }
      })
    } catch (_fetchFailure) {
      this.store.update(draft => {
        draft.settings = { status: 'unavailable', writable: false, values: {} }
      })
    }
  }

  /**
   * Stage one draft; any edit clears the failure mark so the banner does not
   * outlive the correction it asks for.
   * @param key - the field's credential reference.
   * @param text - the staged text.
   */
  edit(key: BailianFieldKey, text: string): void {
    this.store.update(draft => {
      draft.drafts[key] = text
      draft.failed = false
    })
  }

  /**
   * Write every staged draft through its domain: echoing fields go to the
   * settings user layer via the bridge route (blank = removal, falling back
   * to entry config and the credential store), write-only fields go to
   * `credentials.set`. A refused credential write keeps its draft; a refused
   * settings write self-heals by re-fetching the Host value.
   */
  async save(): Promise<void> {
    const state = this.store.getSnapshot()
    if (state.saving || !dirtyOf(state)) return
    this.store.update(draft => { draft.saving = true })
    let failed = false
    const settingsPatch: Record<string, unknown> = {}
    let hasSettingsWrite = false
    const credentialWrites: Promise<void>[] = []
    const settled: BailianFieldKey[] = []
    for (const key of BAILIAN_CARD_REFS) {
      if (!staged(state, key)) continue
      const text = state.drafts[key] as string
      const field = SETTINGS_FIELDS[key]
      if (field !== undefined && state.settings.status === 'ready') {
        settingsPatch[field] = text === '' ? null : text
        hasSettingsWrite = true
        settled.push(key)
        continue
      }
      credentialWrites.push((async () => {
        try {
          const response = await this.api.credentials.set({ ref: key, value: text })
          if (response.result.ok) settled.push(key)
          else failed = true
        } catch (_credentialWriteFailure) {
          failed = true
        }
      })())
    }
    if (hasSettingsWrite) {
      try {
        await this.saveSettings(settingsPatch)
      } catch (_settingsWriteFailure) {
        failed = true
      }
    }
    await Promise.all(credentialWrites)
    this.store.update(draft => {
      draft.saving = false
      draft.failed = failed
      for (const key of settled) draft.drafts[key] = undefined
    })
    await this.fetchSettings()
    await this.read()
  }

  /** Drop every staged draft and the failure mark. */
  discard(): void {
    this.store.update(draft => {
      for (const ref of BAILIAN_CARD_REFS) draft.drafts[ref] = undefined
      draft.failed = false
    })
  }

  /**
   * Adopt the bl CLI's stored login through the Host autofill route. The
   * Host reads `~/.bailian/config.json` itself and writes the api key into
   * the credential store and the workspace id into the settings section —
   * the plain key never rides the wire to this page. When the file has no
   * key yet, ask the Host to start `bl auth login --console` (a browser
   * flow on the host machine); the user finishes it and clicks again.
   */
  async autofill(): Promise<void> {
    if (this.store.getSnapshot().autofill === 'running') return
    this.store.update(draft => { draft.autofill = 'running' })
    let outcome: BailianAutofillStatus = 'failed'
    try {
      const fill = await this.postAutofill('fill') as { apiKey?: string, workspaceId?: string }
      if (fill.apiKey === 'filled') {
        outcome = 'done'
      } else if (fill.apiKey === 'missing') {
        // Nothing to adopt yet: start the console login that provisions the
        // CLI's credential file, then have the user retry the button.
        const login = await this.postAutofill('login') as { status?: string }
        outcome = login.status === 'started' || login.status === 'already-running'
          ? 'loginStarted'
          : login.status === 'not-found' ? 'blMissing' : 'failed'
      }
      // apiKey === 'failed' (a read-only source shadows the credential):
      // fall through as 'failed' even when the workspace id was adopted.
    } catch (_autofillFailure) {
      outcome = 'failed'
    }
    this.store.update(draft => { draft.autofill = outcome })
    await this.fetchSettings()
    await this.read()
  }

  /**
   * Remove the stored default service from every writable layer — the
   * settings user layer AND the credential store, so the fallback chain does
   * not resurrect the value the user just cleared. Both removals are
   * idempotent; the credential unset is skipped when nothing is stored there.
   * @param key - which default service credential to clear.
   */
  async clearDefaultAgent(key: 'BAILIAN_DEFAULT_RETRIEVE_AGENT_ID' | 'BAILIAN_DEFAULT_CHAT_AGENT_ID'): Promise<void> {
    const settingsField: BailianSettingsField = key === 'BAILIAN_DEFAULT_RETRIEVE_AGENT_ID' ? 'defaultRetrieveAgentId' : 'defaultChatAgentId'
    const state = this.store.getSnapshot()
    if (state.clearing) return
    this.store.update(draft => { draft.clearing = true })
    let failed = false
    if (state.settings.status === 'ready') {
      try {
        await this.saveSettings({ [settingsField]: null })
      } catch (_settingsWriteFailure) {
        failed = true
      }
    }
    if (state.credentials[key].configured) {
      try {
        const response = await this.api.credentials.unset({ ref: key })
        if (!response.result.ok) failed = true
      } catch (_credentialWriteFailure) {
        failed = true
      }
    }
    this.store.update(draft => {
      draft.clearing = false
      draft.failed = failed
      draft.drafts[key] = undefined
    })
    await this.fetchSettings()
    await this.read()
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
    if (!(BAILIAN_CARD_REFS as readonly string[]).includes(ref)) return
    void this.read()
  }

  /**
   * Build the face the page's slot registration injects.
   * @returns the page's snapshot and its actions.
   */
  inject(): BailianCardFace {
    return {
      hooks: { bailianCard: this.store },
      edit: (key, text) => { this.edit(key, text) },
      save: () => this.save(),
      discard: () => { this.discard() },
      clearDefaultAgent: (key) => this.clearDefaultAgent(key),
      autofill: () => this.autofill(),
    }
  }

  /**
   * Post one autofill action to the Host bridge route.
   * @param action - `fill` adopts the CLI file; `login` starts the browser flow.
   * @returns the route's JSON answer.
   */
  private async postAutofill(action: 'fill' | 'login'): Promise<unknown> {
    const resp = await fetch('/bailian-kb/autofill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return resp.json()
  }

  /**
   * Send a settings patch to the Host bridge route. `null`-valued keys are
   * removals (the field falls back to the entry config and then the
   * credential store); other values are merged into the user layer.
   * @param patch - the partial settings update.
   */
  private async saveSettings(patch: Record<string, unknown>): Promise<void> {
    const resp = await fetch('/bailian-kb/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({})) as { error?: string }
      throw new Error(body.error ?? `HTTP ${resp.status}`)
    }
  }

  /**
   * Ask the credentials domain about all three references and publish the
   * answer. A failed read keeps the last known state: the page stays usable
   * and a write still reaches the Host.
   */
  private async read(): Promise<void> {
    let response: Awaited<ReturnType<IApiClient['credentials']['describe']>>
    try {
      response = await this.api.credentials.describe({ refs: [...BAILIAN_CARD_REFS] })
    } catch (_credentialReadFailure) {
      return
    }
    if (!response.result.ok) return
    const view = response.result.value.credentials
    this.store.update(draft => {
      for (const ref of BAILIAN_CARD_REFS) {
        // An unknown reference reads as writable: the control stays usable and
        // the Host is what refuses, rather than the page guessing a refusal.
        draft.credentials[ref] = {
          configured: view[ref]?.configured ?? false,
          writable: view[ref]?.writable ?? true,
        }
      }
    })
  }
}
