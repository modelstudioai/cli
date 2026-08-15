/**
 * The Bailian card's controller: staged drafts over the credentials domain.
 *
 * All three values ride credential references (no settings namespace is
 * involved — an out-of-tree package cannot expose one to the browser), so the
 * card never holds a stored literal: it learns only whether each reference is
 * configured and writable, stages drafts locally, and one save writes every
 * non-blank draft through `credentials.set`. A blank draft writes nothing and
 * keeps the stored value. The default-service reference is the one value a
 * user can meaningfully remove, so it alone gets a clear action
 * (`credentials.unset`), immediate rather than staged.
 */

import type { IApiClient } from '@deepseek-ai/dsh-client-connection/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** The credential references this card stages, keyed by their ref names. */
export const BAILIAN_CARD_REFS = [
  'DASHSCOPE_API_KEY',
  'BAILIAN_WORKSPACE_ID',
  'BAILIAN_DEFAULT_AGENT_ID',
] as const

/** One card field, addressed by its credential reference. */
export type BailianFieldKey = (typeof BAILIAN_CARD_REFS)[number]

/** What the credentials domain reports for one reference (never the value). */
export interface BailianCredentialView {
  /** Whether any layer supplies a value for the reference. */
  configured: boolean
  /** Whether `credentials.set` can affect it; false disables the control. */
  writable: boolean
}

/** What the Bailian card renders. */
export interface BailianCardState {
  /** Staged drafts, blank = keep the stored value. */
  drafts: Record<BailianFieldKey, string>
  /** Last credentials-domain answer per reference; unknown refs read as writable. */
  credentials: Record<BailianFieldKey, BailianCredentialView>
  /** Whether a save is in flight. */
  saving: boolean
  /** Whether the default-service clear is in flight. */
  clearing: boolean
  /** Whether the last save or clear was refused; drafts are kept for correction. */
  failed: boolean
}

/** The registration-side face the card's slot entry injects. */
export interface BailianCardFace {
  hooks: {
    /** Card snapshot bound by the renderer as useBailianCard. */
    bailianCard: SnapshotStore<BailianCardState>
  }
  /** Stage one draft. */
  edit: (key: BailianFieldKey, text: string) => void
  /** Write every non-blank draft through `credentials.set`, then re-read. */
  save: () => Promise<void>
  /** Drop every staged draft. */
  discard: () => void
  /** Remove the stored default service (`credentials.unset`), then re-read. */
  clearDefaultAgent: () => Promise<void>
}

/** Bridge the credentials domain onto the card. */
export class BailianCardController {
  private readonly store: SnapshotStore<BailianCardState>

  /**
   * @param api - wire face used for the three credential references.
   */
  constructor(private readonly api: Pick<IApiClient, 'credentials'>) {
    this.store = createSnapshotStore<BailianCardState>({
      drafts: {
        DASHSCOPE_API_KEY: '',
        BAILIAN_WORKSPACE_ID: '',
        BAILIAN_DEFAULT_AGENT_ID: '',
      },
      credentials: {
        DASHSCOPE_API_KEY: { configured: false, writable: true },
        BAILIAN_WORKSPACE_ID: { configured: false, writable: true },
        BAILIAN_DEFAULT_AGENT_ID: { configured: false, writable: true },
      },
      saving: false,
      clearing: false,
      failed: false,
    })
    void this.read()
  }

  /** Whether any draft is staged. */
  get dirty(): boolean {
    return BAILIAN_CARD_REFS.some(key => this.store.getSnapshot().drafts[key] !== '')
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
   * Write every non-blank draft, then re-read all references. A refused write
   * keeps its draft: the copy tells the user the values were left to correct.
   */
  async save(): Promise<void> {
    const staged = new Map(
      BAILIAN_CARD_REFS
        .map(key => [key, this.store.getSnapshot().drafts[key]] as const)
        .filter(([, text]) => text !== ''),
    )
    if (staged.size === 0 || this.store.getSnapshot().saving) return
    this.store.update(draft => { draft.saving = true })
    let failed = false
    await Promise.all([...staged].map(async ([ref, value]) => {
      try {
        const response = await this.api.credentials.set({ ref, value })
        if (!response.result.ok) failed = true
      } catch (_credentialWriteFailure) {
        failed = true
      }
    }))
    this.store.update(draft => {
      draft.saving = false
      draft.failed = failed
      if (!failed) for (const ref of staged.keys()) draft.drafts[ref] = ''
    })
    await this.read()
  }

  /** Drop every staged draft and the failure mark. */
  discard(): void {
    this.store.update(draft => {
      for (const ref of BAILIAN_CARD_REFS) draft.drafts[ref] = ''
      draft.failed = false
    })
  }

  /** Remove the stored default service so every call names one again. */
  async clearDefaultAgent(): Promise<void> {
    if (this.store.getSnapshot().clearing) return
    this.store.update(draft => { draft.clearing = true })
    let failed = false
    try {
      const response = await this.api.credentials.unset({ ref: 'BAILIAN_DEFAULT_AGENT_ID' })
      if (!response.result.ok) failed = true
    } catch (_credentialWriteFailure) {
      failed = true
    }
    this.store.update(draft => {
      draft.clearing = false
      draft.failed = failed
    })
    await this.read()
  }

  /**
   * Re-read after the Host reports a change to a reference this card watches.
   *
   * A value can be written from somewhere else — the Models page addresses
   * DASHSCOPE_API_KEY too, and the file store accepts external edits — so
   * without this the badges keep reporting a state the Host already replaced.
   * @param ref - the reference the Host reports as changed.
   */
  refresh(ref: string): void {
    if (!(BAILIAN_CARD_REFS as readonly string[]).includes(ref)) return
    void this.read()
  }

  /**
   * Build the face the card's slot registration injects.
   * @returns the card's snapshot and its actions.
   */
  inject(): BailianCardFace {
    return {
      hooks: { bailianCard: this.store },
      edit: (key, text) => { this.edit(key, text) },
      save: () => this.save(),
      discard: () => { this.discard() },
      clearDefaultAgent: () => this.clearDefaultAgent(),
    }
  }

  /**
   * Ask the credentials domain about all three references and publish the
   * answer. A failed read keeps the last known state: the card stays usable
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
        // the Host is what refuses, rather than the card guessing a refusal.
        draft.credentials[ref] = {
          configured: view[ref]?.configured ?? false,
          writable: view[ref]?.writable ?? true,
        }
      }
    })
  }
}
