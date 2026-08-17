/**
 * Bailian knowledge-base consumer plugin: registers kb_search and kb_chat over the DashScope RAG API,
 * plus the kscli management skill.
 * @module dsh-tool-bailian-kb
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { settingsNamespace, SettingsProvider, type SettingsRegisterOptions, type SettingsScope } from '@deepseek-ai/dsh-settings'
import { KbClient } from './client.js'
import { registerSkill } from './skill.js'
import { createKbTools } from './tools.js'

/** Minimal webServer route shape (declared inline to avoid a host-package dependency). */
interface WebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}
/** Shell-environment registration shape (declared inline to avoid a host-package dependency). */
interface ShellEnvRegistration {
  name: string
  variables: Record<string, { description: string }>
  resolve: () => Record<string, string | undefined>
}
declare module '@deepseek-ai/cordis' {
  interface Context {
    webServer: {
      register(route: WebRoute): () => void
    }
    shellEnv: {
      register(registration: ShellEnvRegistration): void
    }
  }
}

export const name = 'tool-bailian-kb'
export const inject = ['tools', 'credentials']

/** Settings namespace this plugin registers when a settings service is composed. */
const SETTINGS_NS = settingsNamespace('bailian-kb')

/** Settings fields seeded once from their credential references ({@link seedFromCredentials}). */
const CREDENTIAL_SEEDS = [
  ['workspaceId', 'BAILIAN_WORKSPACE_ID'],
  ['defaultRetrieveAgentId', 'BAILIAN_DEFAULT_RETRIEVE_AGENT_ID'],
  ['defaultChatAgentId', 'BAILIAN_DEFAULT_CHAT_AGENT_ID'],
] as const

/**
 * Every {@link Config} field the bridge route accepts. A static allowlist,
 * NOT `key in current()`: optional fields with no default and no base
 * (the default service ids) vanish from the resolved config once cleared,
 * and a membership test against it would silently drop their next write.
 */
const CONFIG_FIELDS = new Set<string>([
  'workspaceId', 'endpointHost', 'defaultRetrieveAgentId', 'defaultChatAgentId', 'agentVersion', 'chatTimeoutMs',
])

/**
 * One-time migration: before this section existed, the workspace and
 * default-service ids lived only as credentials, which the wire never echoes.
 * Seed each field the resolved section does not answer from the WRITABLE
 * credential layer (`file`), so the page shows the value the deployment
 * already runs with; env-sourced values stay where they are — freezing one
 * into the document would shadow later environment changes.
 * @param ctx - registrant context carrying credentials.
 * @param scope - the registered `bailian-kb` scope the seed writes through.
 */
async function seedFromCredentials(ctx: Context, scope: SettingsScope<Config>): Promise<void> {
  try {
    const seeds: Partial<Record<(typeof CREDENTIAL_SEEDS)[number][0], string>> = {}
    for (const [field, ref] of CREDENTIAL_SEEDS) {
      if (scope.get()[field]) continue
      const resolved = await ctx.credentials.resolve(credentialRef(ref))
      if (resolved?.source !== 'file') continue
      seeds[field] = resolved.value
    }
    if (Object.keys(seeds).length > 0) await scope.update(seeds)
  } catch (_migrationFailure) {
    // Best-effort: a failed seed leaves the credential fallback in place, so
    // resolution still answers — the page merely starts blank.
  }
}

/** Bailian knowledge-base plugin configuration. */
export interface Config {
  /** Bailian workspace id; the API host is the workspace subdomain `https://<workspaceId>.<endpointHost>`. Optional here: an unset value falls back per call to the BAILIAN_WORKSPACE_ID credential (env/.env or ~/.dsh/.credentials.yaml). Editable with echo on the Settings → 百炼知识库 page (settings layer). */
  workspaceId?: string
  /** API host suffix; replace for other regions or private deployments. */
  endpointHost: string
  /** Retrieval-service id pinned by this deployment; when unset, the per-call fallback reads the BAILIAN_DEFAULT_RETRIEVE_AGENT_ID credential. */
  defaultRetrieveAgentId?: string
  /** Q&A-service id pinned by this deployment; when unset, the per-call fallback reads the BAILIAN_DEFAULT_CHAT_AGENT_ID credential. */
  defaultChatAgentId?: string
  /** Service version to call: `beta` (draft) or a published number; defaults to the latest published version. Never model-visible. */
  agentVersion?: string
  /** kb_chat timeout in milliseconds; the server side is a minutes-scale agentic loop. */
  chatTimeoutMs: number
}

/** Schemastery validation for {@link Config}; workspaceId and default agent ids are optional — both resolve per call with a credentials fallback. */
export const Config: z<Config> = z.object({
  workspaceId: z.string(),
  endpointHost: z.string().default('cn-beijing.maas.aliyuncs.com'),
  defaultRetrieveAgentId: z.string(),
  defaultChatAgentId: z.string(),
  agentVersion: z.string(),
  chatTimeoutMs: z.number().default(300_000),
})

/**
 * Register the three knowledge tools over one shared client, plus the
 * management skill when a skills registry is composed. The Config doubles as
 * the `bailian-kb` settings section (entry config as the base layer), so
 * every value is read through the live source thunk per call — tool schemas
 * are static (agent_id stays optional regardless), so a settings edit needs
 * no re-registration.
 * @param ctx - registrant context carrying tools and credentials.
 * @param config - deployment's workspace, host, pinning, and timeout choices.
 */
export function apply(ctx: Context, config: Config): void {
  // The active configuration source: the composition entry until a settings
  // service attaches, then the resolved section (schema defaults → entry
  // base → user layer). Detach falls back to the entry automatically.
  // Hand-rolled instead of `installSettingsSection` for two extras it does
  // not carry: the `expose` opt-in (this page edits the section from the
  // browser) and the scope handle the credential migration writes through.
  let current: () => Config = () => config
  let scope: SettingsScope<Config> | undefined
  /** The settings provider, captured for `mutate` (path-level unset) access. */
  let settings: SettingsProvider | undefined
  ctx.inject(['settings'], (sctx) => {
    settings = sctx.settings
    // `expose` is the wire opt-in the harness documents as deferred work; the
    // assertion keeps this compiling against pristine upstream types, which do
    // not declare it yet. Until upstream lands it the option is ignored and
    // the browser page degrades to its credentials-only fallback.
    const options = { base: config, expose: true } as SettingsRegisterOptions<Config>
    scope = sctx.settings.register(SETTINGS_NS, Config, options)
    current = () => scope!.get()
    sctx.effect(() => () => { current = () => config }, 'tool-bailian-kb: settings source fallback')
    void seedFromCredentials(ctx, scope)
  })

  const client = new KbClient({
    resolveWorkspaceId: async () => {
      const pinned = current().workspaceId
      if (pinned) return pinned
      const resolved = await ctx.credentials.resolve(credentialRef('BAILIAN_WORKSPACE_ID'))
      if (!resolved) {
        throw new Error(
          'BAILIAN_WORKSPACE_ID is not configured. Set the workspace id in the web UI (Settings → 百炼知识库) '
          + 'or in ~/.dsh/.credentials.yaml; it appears as the subdomain of your Bailian endpoints.',
        )
      }
      return resolved.value
    },
    // Live settings reads: the client keeps no copy, so a committed edit to
    // the section applies on the next call.
    get endpointHost() { return current().endpointHost },
    get agentVersion() { return current().agentVersion },
    resolveApiKey: async () => {
      const resolved = await ctx.credentials.resolve(credentialRef('DASHSCOPE_API_KEY'))
      if (!resolved) {
        throw new Error(
          'DASHSCOPE_API_KEY is not configured. Set it in the web UI (Settings → 百炼知识库) '
          + 'or in ~/.dsh/.credentials.yaml (create a key at https://bailian.console.aliyun.com/?tab=app#/api-key).',
        )
      }
      return resolved.value
    },
  })
  for (const tool of createKbTools({
    client,
    resolveDefaultRetrieveAgentId: async () => {
      const pinned = current().defaultRetrieveAgentId
      if (pinned) return pinned
      const resolved = await ctx.credentials.resolve(credentialRef('BAILIAN_DEFAULT_RETRIEVE_AGENT_ID'))
      return resolved?.value
    },
    resolveDefaultChatAgentId: async () => {
      const pinned = current().defaultChatAgentId
      if (pinned) return pinned
      const resolved = await ctx.credentials.resolve(credentialRef('BAILIAN_DEFAULT_CHAT_AGENT_ID'))
      return resolved?.value
    },
    get chatTimeoutMs() { return current().chatTimeoutMs },
  })) {
    ctx.tools.register(tool)
  }
  registerSkill(ctx)

  // Export the resolved workspace id as a shell environment variable so
  // management CLI commands (`bl knowledge list`, `kscli kb list`, etc.)
  // running in bash can see the value the settings service resolved.
  // Without this, the settings.yaml value is invisible to child processes.
  ctx.inject(['shellEnv'], (envCtx) => {
    envCtx.shellEnv.register({
      name: 'bailian-kb',
      variables: {
        BAILIAN_WORKSPACE_ID: {
          description: 'Bailian workspace id resolved from settings (Settings → 百炼知识库) or credentials.',
        },
      },
      resolve: () => {
        const wsId = current().workspaceId
        return wsId ? { BAILIAN_WORKSPACE_ID: wsId } : {}
      },
    })
  })

  // Bridge routes let the browser settings page read and write the resolved
  // section without riding the settings wire (which requires an apiproxy
  // allowlist entry the composition does not grant out-of-tree namespaces).
  // GET and POST share one exact-route registration: the webServer map keys
  // on (kind, path), so two registrations for the same path throw
  // "duplicate route" and the second handler silently replaces the first.
  ctx.inject(['webServer'], (wctx) => {
    wctx.effect(() => wctx.webServer.register({
      kind: 'exact',
      path: '/bailian-kb/settings',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method === 'GET' || req.method === 'HEAD') {
          sendJson(res, 200, current())
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'use GET or POST' })
          return
        }
        if (!scope) {
          sendJson(res, 503, { error: 'settings service unavailable' })
          return
        }
        let body: unknown
        try { body = await readJsonBody(req) } catch (err) {
          sendJson(res, 400, { error: err instanceof Error ? err.message : 'bad request' })
          return
        }
        if (typeof body !== 'object' || body === null) {
          sendJson(res, 400, { error: 'expected JSON object' })
          return
        }
        // Build a settings update patch. null-valued keys are removals (the
        // field falls back to the entry config and then the credential store).
        const patch: Record<string, unknown> = {}
        const removals = new Set<string>()
        for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
          if (!CONFIG_FIELDS.has(key)) continue
          if (value === null) { removals.add(key); continue }
          patch[key] = value
        }
        try {
          // Apply non-removal patches first (scope.update merges into the user
          // layer without disturbing other fields).
          if (Object.keys(patch).length > 0) await scope.update(patch)
          // Remove fields via path-level unset ops: this deletes the key from
          // the user layer so it re-inherits the entry base and schema defaults.
          // Using scope.replace() with the resolved config would bake defaults
          // (endpointHost, chatTimeoutMs) and entry values into the user layer,
          // shadowing future entry changes and polluting the stored document.
          if (removals.size > 0 && settings) {
            for (const key of removals) {
              await settings.mutate(SETTINGS_NS, [{ op: 'unset', path: [key] }])
            }
          }
          sendJson(res, 200, scope.get())
        } catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : 'settings write failed' })
        }
      },
    }), 'tool-bailian-kb: settings bridge route')
  })
}

/** Write a JSON response. */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

/** Read a UTF-8 JSON body up to a size limit. */
function readJsonBody(req: IncomingMessage, maxBytes = 16384): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > maxBytes) { req.destroy(); reject(new Error('body too large')); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch (err) { reject(err) }
    })
    req.on('error', reject)
  })
}
