/**
 * The Bailian knowledge-base card: three write-only credential controls plus
 * the default-service clear. Values never ride a response, so each control
 * starts blank and reports only configured/unconfigured; the API key drafts
 * behind a password mask while the workspace and agent ids draft in the clear
 * — they are pasted identifiers, not secrets, and a visible draft can be
 * proofread.
 */

import { useState } from 'react'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { BAILIAN_CARD_REFS, type BailianCardFace, type BailianFieldKey } from './bailian-card-controller.ts'
import type { BailianKbLocaleKey } from './locales.ts'
import css from './BailianCard.module.css'

/** Props the renderer binds for the Bailian card. */
export type BailianCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'tool-bailian-kb'>
  & InjectFace<BailianCardFace>

/** One field's render description. */
interface FieldView {
  key: BailianFieldKey
  labelKey: BailianKbLocaleKey
  hintKey: BailianKbLocaleKey
  setKey: BailianKbLocaleKey
  unsetKey: BailianKbLocaleKey
  /** Password-masked drafting; only the API key is an actual secret. */
  secret: boolean
}

/** The three controls, in card order. */
const FIELDS: readonly FieldView[] = [
  { key: 'DASHSCOPE_API_KEY', labelKey: 'apiKey', hintKey: 'apiKeyHint', setKey: 'apiKeySet', unsetKey: 'apiKeyUnset', secret: true },
  { key: 'BAILIAN_WORKSPACE_ID', labelKey: 'workspaceId', hintKey: 'workspaceIdHint', setKey: 'workspaceIdSet', unsetKey: 'workspaceIdUnset', secret: false },
  { key: 'BAILIAN_DEFAULT_AGENT_ID', labelKey: 'agentId', hintKey: 'agentIdHint', setKey: 'agentIdSet', unsetKey: 'agentIdUnset', secret: false },
]

/**
 * Render the Bailian card.
 * @param props - locale copy, the card snapshot, and its actions.
 * @returns the card.
 */
export function BailianCard(props: BailianCardProps) {
  const { t } = props
  const state = props.useBailianCard(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  const dirty = BAILIAN_CARD_REFS.some(key => state.drafts[key] !== '')
  const busy = state.saving || state.clearing
  return (
    <li className={css.card + (open ? ` ${css.cardOpen}` : '')}>
      <button
        type="button"
        className={css.header}
        aria-expanded={open}
        aria-label={`${props.t(open ? 'collapse' : 'expand')}: ${props.t('title')}`}
        onClick={() => { setOpen(!open) }}
      >
        <span className={css.headText}>
          <span className={css.name}>{t('title')}</span>
          <span className={css.description}>{t('description')}</span>
        </span>
        {dirty ? <span className={css.pending}>{t('unsaved')}</span> : null}
        <IconChevronDownOutline14 className={css.chevron + (open ? ` ${css.chevronOpen}` : '')} />
      </button>
      {open
        ? (
          <div className={css.body}>
            {FIELDS.map(field => {
              const credential = state.credentials[field.key]
              // The launch environment wins and refuses writes: the badge says
              // where the value lives instead of a control that cannot act.
              const stateLabel = credential.configured
                ? (credential.writable ? t(field.setKey) : t('fromEnv'))
                : t(field.unsetKey)
              const showClear = field.key === 'BAILIAN_DEFAULT_AGENT_ID' && credential.configured
              return (
                <div className={css.field} key={field.key}>
                  <div className={css.head}>
                    <label className={css.label} htmlFor={`bailian-kb-${field.key}`}>{t(field.labelKey)}</label>
                    <span className={css.badges}>
                      {showClear
                        ? (
                          <button
                            type="button"
                            className={css.clear}
                            disabled={busy || !credential.writable}
                            onClick={() => { void props.clearDefaultAgent() }}
                          >
                            {t(state.clearing ? 'clearing' : 'clear')}
                          </button>
                        )
                        : null}
                      <span className={credential.configured ? css.badge : css.badgeMuted}>{stateLabel}</span>
                    </span>
                  </div>
                  <input
                    id={`bailian-kb-${field.key}`}
                    className={css.input}
                    type={field.secret ? 'password' : 'text'}
                    autoComplete="off"
                    value={state.drafts[field.key]}
                    disabled={!credential.writable || busy}
                    onChange={(event) => { props.edit(field.key, event.target.value) }}
                  />
                  <p className={css.hint}>{t(field.hintKey)}</p>
                </div>
              )
            })}
            <div className={css.footer}>
              {state.failed ? <p className={css.failed} role="status">{t('saveFailed')}</p> : null}
              <button
                type="button"
                className={css.discard}
                disabled={!dirty || busy}
                onClick={props.discard}
              >
                {t('discard')}
              </button>
              <button
                type="button"
                className={css.save}
                disabled={!dirty || busy}
                onClick={() => { void props.save() }}
              >
                {t(state.saving ? 'saving' : 'save')}
              </button>
            </div>
          </div>
        )
        : null}
    </li>
  )
}
