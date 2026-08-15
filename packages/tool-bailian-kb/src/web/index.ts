/**
 * Bailian knowledge-base plugin, browser half: one card in the plugin
 * configuration section staging the three credential references the Host half
 * resolves per call. The card is pure credentials-domain — this package
 * exposes no settings namespace (an out-of-tree package cannot get one onto
 * the browser settings surface), so nothing here touches a settings scope.
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
// Type-only: the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the remote service's Context merge (ctx.remote) and the forwarded
// credential-update events.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the 'settings.plugin.item' SlotMap merge, declared by the plugins
// settings section this card registers into.
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { BailianCard } from './BailianCard.tsx'
import { BailianCardController } from './bailian-card-controller.ts'
import { en, zh, type BailianKbLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Bailian card's copy. */
    'tool-bailian-kb': BailianKbLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'tool-bailian-kb'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection', 'remote']

/**
 * Mount the Bailian card into the plugin configuration section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const { api } = ctx.get('connection') as ConnectionHandle
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'tool-bailian-kb: dictionaries')

  const card = new BailianCardController(api)
  // Values can change elsewhere (Models page, external file edits); the badges
  // must follow the Host, not the card's last write.
  ctx.effect(
    () => ctx.remote.$on('credentials/updated', ref => { card.refresh(ref) }),
    'tool-bailian-kb: credential invalidations',
  )

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: 'bailian-kb',
    order: 30,
    locale: NS,
    inject: () => card.inject(),
  }, BailianCard))
}
