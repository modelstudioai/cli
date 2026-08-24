/**
 * Bailian knowledge-base plugin, browser half: one section page in the
 * Settings left nav. The workspace, default-retrieval-service and
 * default-chat-service ids ride the Host bridge route
 * (`/bailian-kb/settings`) the Host half registers, bypassing the settings
 * wire (which requires an apiproxy allowlist entry the composition does not
 * grant out-of-tree namespaces); the API key stays pure credentials-domain
 * and never echoes.
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
// Type-only: the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the remote service's Context merge (ctx.remote) and the forwarded
// credential-update events.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// The 'settings.section' SlotMap merge AND the ctx.settingsScope service,
// both declared by the settings domain base (type-only: the service arrives
// through cordis, never a value import).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { BailianCard } from './BailianCard.tsx'
import { BailianCardController } from './bailian-card-controller.ts'
import { en, zh, type BailianKbLocaleKey } from './locales.ts'
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Bailian section page's copy. */
    'tool-bailian-kb': BailianKbLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'tool-bailian-kb'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection', 'remote']

/**
 * Mount the Bailian section page into the Settings left nav.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const { api } = ctx.get('connection') as ConnectionHandle
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'tool-bailian-kb: dictionaries')

  // Registration-time text: the nav label is a thunk the shell resolves per
  // render, so copy freshness rides the locale revision without re-registering.
  const t = ctx.locale.bind(NS)

  // The echo transport: the Host bridge route (`/bailian-kb/settings`) lets
  // the page read and write the resolved section without riding the settings
  // wire (which requires an apiproxy allowlist entry).
  const card = new BailianCardController(api)
  // Values can change elsewhere (Models page, external file edits); the badges
  // must follow the Host, not the card's last write.
  ctx.effect(
    () => ctx.remote.$on('credentials/updated', ref => { card.refresh(ref) }),
    'tool-bailian-kb: credential invalidations',
  )

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'bailian-kb',
    order: 20,
    label: () => t('nav'),
    locale: NS,
    inject: () => card.inject(),
  }, BailianCard))
}
