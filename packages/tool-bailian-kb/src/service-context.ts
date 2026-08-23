/**
 * Publishes the cached service catalog into each request as a sourced context
 * message, on the `agent/pre-step` waterfall.
 *
 * Why a context message rather than the tool descriptions: a tool description is
 * fixed when the plugin loads, and a plugin loads once per PROCESS, not once per
 * session. In a long-running host the TTL would be evaluated exactly once at
 * `apply()` and a service created elsewhere would never be noticed until a
 * restart. Re-registering tools to refresh a description instead invalidates the
 * prompt prefix cache from the first changed schema token. Injecting context
 * keeps the tool schemas byte-stable forever and still refreshes per step.
 *
 * Two hard constraints follow from `agent/pre-step` semantics:
 *
 * 1. `pre-step` fires once per STEP, and a step is one model request — a turn with
 *    five tool calls fires it six times. Re-injecting each time would insert six
 *    copies into one turn and void the KV cache from the first insertion onward,
 *    so change suppression is a correctness requirement, not an optimization.
 * 2. A throwing listener fails the proposed step, i.e. the user's turn stalls.
 *    Everything here is therefore wrapped: any failure degrades to "inject
 *    nothing this step".
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import { buildServiceCatalog } from './service-catalog.js'
import type { ServiceCache } from './service-cache.js'

/** Marks this plugin's own injections in the durable log. */
const SOURCE_PLUGIN = 'tool-bailian-kb/services'

export interface ServiceContextOptions {
  cache: ServiceCache
  /** Resolves the workspace being served; undefined means "not configured yet". */
  resolveWorkspaceId: () => Promise<string | undefined>
  /** Resolves the configured default retrieval service (settings then credential). */
  resolveDefaultRetrieveAgentId: () => Promise<string | undefined>
  /** Resolves the configured default chat service (settings then credential). */
  resolveDefaultChatAgentId: () => Promise<string | undefined>
  warn: (message: string) => void
}

/** Whether one durable message came from this module. */
function isOwnInjection(source: { kind: string; plugin?: string }): boolean {
  return source.kind === 'plugin' && source.plugin === SOURCE_PLUGIN
}

/** Concatenate a message's text parts, which is what the model actually reads. */
function messageText(message: UserMessage): string {
  return message.content
    .flatMap(part => part.type === 'text' ? [part.text] : [])
    .join('\n')
}

/**
 * The catalog text this session last injected AND still shows the model.
 *
 * The visibility test is the subtle half. Scanning only for "did we ever publish
 * this" would make compaction permanent data loss: once the catalog message is
 * dropped from the surface, an identical digest would suppress every future
 * injection and the model would silently spend the rest of the session without a
 * service list.
 * @param agent - the subject agent.
 * @returns the visible catalog text, or undefined when none is currently visible.
 */
function visibleCatalogText(agent: Agent): string | undefined {
  const visible = new Set(agent.session.surface.nodes)
  const events = agent.session.events
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event === undefined) continue
    if (event.type !== 'user/message' || !isOwnInjection(event.data.source)) continue
    return visible.has(event.seq) ? messageText(event.data) : undefined
  }
  return undefined
}

/** This module's proposed-but-not-yet-entered message, if the batch already carries one. */
function pendingCatalog(messages: readonly UserMessage[]): UserMessage | undefined {
  return messages.find(message => isOwnInjection(message.source))
}

/**
 * Install the pre-step listener that keeps the catalog present and current.
 * @param ctx - a context with `agents` available.
 * @param opts - the cache plus the deployment's resolved workspace and defaults.
 */
export function installServiceContext(ctx: Context, opts: ServiceContextOptions): void {
  ctx.on('agent/pre-step', async ({ agent, signal }, next): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    try {
      const workspaceId = await opts.resolveWorkspaceId()
      // Nothing is configured yet: the tools themselves will explain that.
      if (workspaceId === undefined || workspaceId === '') return decision

      // Refresh scheduling lives here, not at plugin load, so a long-running
      // process still notices services created elsewhere. Never awaited: a slow
      // list request must not delay the user's request.
      if (opts.cache.isStale(workspaceId)) void opts.cache.refresh()

      const document = opts.cache.peek(workspaceId)
      if (document === undefined) return decision
      const [defaultRetrieveAgentId, defaultChatAgentId] = await Promise.all([
        opts.resolveDefaultRetrieveAgentId(),
        opts.resolveDefaultChatAgentId(),
      ])
      if (signal.aborted) return decision
      const text = buildServiceCatalog({
        entries: document.entries,
        total: document.total,
        truncated: document.truncated,
        ...(defaultRetrieveAgentId !== undefined ? { defaultRetrieveAgentId } : {}),
        ...(defaultChatAgentId !== undefined ? { defaultChatAgentId } : {}),
      })
      if (text === undefined) return decision

      // Identical to what the model already sees: stay out of the way. This is
      // the branch that runs on nearly every step.
      if (visibleCatalogText(agent) === text) return decision

      const pending = pendingCatalog(decision.messages)
      if (pending !== undefined && messageText(pending) === text) return decision

      const catalog = createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'plugin', plugin: SOURCE_PLUGIN, form: 'catalog' },
      })
      return {
        kind: 'enter',
        messages: pending === undefined
          ? [...decision.messages, catalog]
          : decision.messages.map(message => message.id === pending.id ? catalog : message),
      }
    } catch (failed) {
      // A throw here would fail the user's step; a missing catalog is far cheaper.
      opts.warn(`bailian-kb service catalog not injected: ${String(failed)}`)
      return decision
    }
  }, { prepend: true })
}
