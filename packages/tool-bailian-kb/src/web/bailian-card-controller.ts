/**
 * The Bailian page's controller: a hybrid form over two domains.
 *
 * The workspace, default-retrieval-service and default-chat-service ids live
 * in the `bailian-kb` settings section the Host half registers, so while the
 * settings scope is `ready` they ECHO: the page shows the resolved value and
 * stages edits over it (clearing a field unsets the user layer, falling back
 * to the entry config and then the credential store). When the scope is
 * unavailable — a remote browser (memory mode) or a composition without a
 * settings service — both fields degrade to the original write-only credential
 * controls.
 *
 * The API key always rides its credential reference (write-only by design:
 * the wire is structurally value-free), so that control starts blank and
 * reports only configured/unconfigured.
 */

import type { IApiClient } from '@deepseek-ai/dsh-client-connection/client'
import { createSnapshotStore, type SettingsScope, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

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

/** Bridge the settings scope and the credentials domain onto the page. */
export class BailianCardController {
  private readonly store: SnapshotStore<BailianCardState>

  /**
   * @param api - wire face used for the three credential references.
   * @param scope - the bound `bailian-kb` settings scope (echo transport).
   */
  constructor(
    private readonly api: Pick<IApiClient, 'credentials'>,
    private readonly scope: SettingsScope<BailianKbSection>,
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
    })
    this.syncSettings()
    void this.read()
  }

  /**
   * Mirror the scope snapshot into the page state. Called at construction and
   * from the registration-side subscription (the scope self-refreshes on
   * pushed document invalidations and connection resets).
   */
  syncSettings(): void {
    const snapshot = this.scope.getSnapshot()
    const value = snapshot.value
    this.store.update(draft => {
      draft.settings = {
        status: snapshot.status,
        writable: snapshot.writable,
        values: {
          ...(value?.workspaceId !== undefined ? { workspaceId: value.workspaceId } : {}),
          ...(value?.defaultRetrieveAgentId !== undefined ? { defaultRetrieveAgentId: value.defaultRetrieveAgentId } : {}),
          ...(value?.defaultChatAgentId !== undefined ? { defaultChatAgentId: value.defaultChatAgentId } : {}),
        },
      }
    })
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
   * settings user layer (blank = unset, falling back to entry config and the
   * credential store), write-only fields go to `credentials.set`. A refused
   * credential write keeps its draft; a refused settings write self-heals by
   * the scope's own recovery read (the control snaps back to the Host value).
   */
  async save(): Promise<void> {
    const state = this.store.getSnapshot()
    if (state.saving || !dirtyOf(state)) return
    this.store.update(draft => { draft.saving = true })
    let failed = false
    const writes: Promise<void>[] = []
    const settled: BailianFieldKey[] = []
    for (const key of BAILIAN_CARD_REFS) {
      if (!staged(state, key)) continue
      const text = state.drafts[key] as string
      const field = SETTINGS_FIELDS[key]
      if (field !== undefined && state.settings.status === 'ready') {
        writes.push(text === '' ? this.scope.unset(field) : this.scope.set(field, text))
        settled.push(key)
        continue
      }
      writes.push((async () => {
        try {
          const response = await this.api.credentials.set({ ref: key, value: text })
          if (response.result.ok) settled.push(key)
          else failed = true
        } catch (_credentialWriteFailure) {
          failed = true
        }
      })())
    }
    await Promise.all(writes)
    this.store.update(draft => {
      draft.saving = false
      draft.failed = failed
      for (const key of settled) draft.drafts[key] = undefined
    })
    this.syncSettings()
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
    if (state.settings.status === 'ready') await this.scope.unset(settingsField)
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
    this.syncSettings()
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
