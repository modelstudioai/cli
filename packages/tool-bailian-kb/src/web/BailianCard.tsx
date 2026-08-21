/**
 * The Bailian knowledge-base settings page: one section page in the
 * Settings left nav. The workspace, default-retrieval-service and
 * default-chat-service ids echo from the `bailian-kb` settings section
 * while the scope is ready (clearing one falls back down the resolution
 * chain), and degrade to write-only credential controls otherwise; the
 * API key is always write-only — it drafts behind a password mask,
 * starts blank, and reports only configured/unconfigured.
 */

import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  dirtyOf, echoedValue, SETTINGS_FIELDS,
  type BailianCardFace, type BailianCardState, type BailianFieldKey,
} from './bailian-card-controller.ts'
import type { BailianKbLocaleKey } from './locales.ts'
import css from './BailianCard.module.css'

/** Bailian console URL that lets the user create or copy an API key. */
const BAILIAN_CONSOLE_API_KEY_URL = 'https://bailian.console.aliyun.com/cn-beijing?tab=globalset#/efm/api_key'

/** Props the renderer binds for the Bailian section page. */
export type BailianCardProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'tool-bailian-kb'>
  & InjectFace<BailianCardFace>

/** One field's render description. */
interface FieldView {
  key: BailianFieldKey
  labelKey: BailianKbLocaleKey
  /** Locale key for the "get" link shown next to the label. */
  getKey?: BailianKbLocaleKey
  /** Echo-mode explanation (settings-backed value, blank save = fall back). */
  hintKey: BailianKbLocaleKey
  /** Write-only explanation (credential store, blank = keep the stored value). */
  fallbackHintKey: BailianKbLocaleKey
  setKey: BailianKbLocaleKey
  unsetKey: BailianKbLocaleKey
  /** Password-masked drafting; only the API key is an actual secret. */
  secret: boolean
  /** When true the field is hidden inside the collapsible advanced section. */
  advanced?: boolean
  /** External console URL for the "get" link. */
  getUrl?: string
}

/** The controls, in page order. */
const FIELDS: readonly FieldView[] = [
  { key: 'DASHSCOPE_API_KEY', labelKey: 'apiKey', getKey: 'apiKeyGet', hintKey: 'apiKeyHint', fallbackHintKey: 'apiKeyHint', setKey: 'apiKeySet', unsetKey: 'apiKeyUnset', secret: true, advanced: true, getUrl: BAILIAN_CONSOLE_API_KEY_URL },
  { key: 'BAILIAN_WORKSPACE_ID', labelKey: 'workspaceId', getKey: 'workspaceIdGet', hintKey: 'workspaceIdHint', fallbackHintKey: 'workspaceIdHintFallback', setKey: 'workspaceIdSet', unsetKey: 'workspaceIdUnset', secret: false, advanced: true, getUrl: BAILIAN_CONSOLE_API_KEY_URL },
  { key: 'BAILIAN_DEFAULT_RETRIEVE_AGENT_ID', labelKey: 'retrieveAgentId', hintKey: 'retrieveAgentIdHint', fallbackHintKey: 'retrieveAgentIdHintFallback', setKey: 'retrieveAgentIdSet', unsetKey: 'retrieveAgentIdUnset', secret: false, advanced: true },
  { key: 'BAILIAN_DEFAULT_CHAT_AGENT_ID', labelKey: 'chatAgentId', hintKey: 'chatAgentIdHint', fallbackHintKey: 'chatAgentIdHintFallback', setKey: 'chatAgentIdSet', unsetKey: 'chatAgentIdUnset', secret: false, advanced: true },
]

const ADVANCED_FIELDS = FIELDS.filter(field => field.advanced)

/** Whether both the API key and the workspace id already hold values. */
function fullyConfigured(state: BailianCardState): boolean {
  const apiKeyConfigured = state.credentials.DASHSCOPE_API_KEY.configured
  const workspaceConfigured = state.credentials.BAILIAN_WORKSPACE_ID.configured || echoedValue(state, 'BAILIAN_WORKSPACE_ID') !== ''
  return apiKeyConfigured && workspaceConfigured
}

/**
 * Render the Bailian section page.
 * @param props - locale copy, the page snapshot, and its actions.
 * @returns the section page.
 */
export function BailianCard(props: BailianCardProps) {
  const { t } = props
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const state = props.useBailianCard(snapshot => snapshot)
  const dirty = dirtyOf(state)
  const busy = state.saving || state.clearing

  // The flow spans a browser login, so the button stays disabled until it settles.
  const autofillBusy = state.autofill === 'running' || state.autofill === 'awaitingLogin'

  // Pick the notice under the autofill button: settled outcome first, then
  // a green "already configured" hint, then the default invitation.
  let autofillNotice: BailianKbLocaleKey | undefined
  let autofillNoticeSuccess = false
  if (state.autofill === 'done') {
    autofillNotice = 'autofillDone'
    autofillNoticeSuccess = true
  } else if (state.autofill === 'awaitingLogin') {
    autofillNotice = 'autofillAwaitingLogin'
  } else if (state.autofill === 'failed') {
    autofillNotice = 'autofillFailed'
  } else if (fullyConfigured(state)) {
    autofillNotice = 'autofillConfigured'
    autofillNoticeSuccess = true
  }

  const renderField = (field: FieldView) => {
    const credential = state.credentials[field.key]
    // Echo mode: the settings scope answers with the resolved value, so
    // the control is an ordinary pre-filled input. Otherwise the control
    // is write-only and the badge is all the state there is.
    const echo = SETTINGS_FIELDS[field.key] !== undefined && state.settings.status === 'ready'
    const echoed = echoedValue(state, field.key)
    const value = state.drafts[field.key] ?? (echo ? echoed : '')
    const disabled = busy || (echo ? !state.settings.writable : !credential.writable)
    // The launch environment wins over the credential store and refuses
    // writes; in echo mode a non-empty settings value shadows both, so
    // the badge only reports the fallback under an empty input.
    const badge = echo
      ? (echoed !== ''
          ? undefined
          : credential.configured
            ? { label: t('fallbackConfigured'), set: true }
            : { label: t(field.unsetKey), set: false })
      : credential.configured
        ? { label: credential.writable ? t(field.setKey) : t('fromEnv'), set: true }
        : { label: t(field.unsetKey), set: false }
    const showClear = (field.key === 'BAILIAN_DEFAULT_RETRIEVE_AGENT_ID' || field.key === 'BAILIAN_DEFAULT_CHAT_AGENT_ID')
      && (credential.configured || (echo && echoed !== ''))
    return (
      <div className={css.field} key={field.key}>
        <div className={css.head}>
          <span className={css.labelWrap}>
            <label className={css.label} htmlFor={`bailian-kb-${field.key}`}>{t(field.labelKey)}</label>
            {field.getUrl !== undefined && field.getKey !== undefined
              ? (
                <a
                  className={css.getLink}
                  href={field.getUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t(field.getKey)}
                </a>
              )
              : null}
          </span>
          <span className={css.badges}>
            {showClear
              ? (
                <button
                  type="button"
                  className={css.clear}
                  disabled={busy}
                  onClick={() => { void props.clearDefaultAgent(field.key as 'BAILIAN_DEFAULT_RETRIEVE_AGENT_ID' | 'BAILIAN_DEFAULT_CHAT_AGENT_ID') }}
                >
                  {t(state.clearing ? 'clearing' : 'clear')}
                </button>
              )
              : null}
            {badge !== undefined
              ? <span className={badge.set ? css.badgeSuccess : css.badgeMuted}>{badge.label}</span>
              : null}
          </span>
        </div>
        <input
          id={`bailian-kb-${field.key}`}
          className={css.input}
          type={field.secret ? 'password' : 'text'}
          autoComplete="off"
          value={value}
          disabled={disabled}
          onChange={(event) => { props.edit(field.key, event.target.value) }}
        />
        <p className={css.hint}>{t(echo ? field.hintKey : field.fallbackHintKey)}</p>
      </div>
    )
  }

  return (
    <section className={css.section}>
      <div className={css.headRow}>
        <h2 className={css.title}>{t('title')}</h2>
        {dirty ? <span className={css.pending}>{t('unsaved')}</span> : null}
      </div>
      <p className={css.intro}>{t('description')}</p>
      <div className={css.autofillRow}>
        <button
          type="button"
          className={css.discard}
          disabled={busy || autofillBusy}
          onClick={() => { void props.autofill() }}
        >
          {t(state.autofill === 'running' ? 'autofilling' : 'autofill')}
        </button>
        <span className={autofillNoticeSuccess ? css.autofillNoticeSuccess : css.hint}>
          {autofillNotice !== undefined ? t(autofillNotice) : t('autofillHint')}
          {/* The host opens the page itself; this link is the fallback when it cannot. */}
          {state.autofillLoginUrl !== undefined && state.autofillLoginUrl !== ''
            ? <>
                {' '}
                <a href={state.autofillLoginUrl} target="_blank" rel="noreferrer">{t('autofillOpenUrl')}</a>
              </>
            : null}
        </span>
      </div>
      <div className={css.form}>
        {state.settings.status === 'unavailable'
          ? <p className={css.notice}>{t('settingsUnavailable')}</p>
          : null}
        <div className={css.advancedSection}>
          <button
            type="button"
            className={css.advancedToggle}
            aria-expanded={advancedOpen}
            onClick={() => { setAdvancedOpen(open => !open) }}
          >
            {t('advancedConfig')}
          </button>
          {advancedOpen
            ? (
              <div className={css.advancedFields}>
                {ADVANCED_FIELDS.map(renderField)}
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
        </div>
      </div>
    </section>
  )
}
