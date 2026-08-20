/** Runtime skill registration: the packaged bl-management SKILL.md joins the catalog when a skills registry is composed. */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
// Type-only: resolves ctx.skills for the optional inject below.
import type {} from '@deepseek-ai/dsh-skill'

const SKILL_DIR = fileURLToPath(new URL('../skills/bailian-kb-management/', import.meta.url))

/**
 * Register the management skill when the skills registry is composed; headless
 * assemblies without the seam stay unaffected.
 * @param ctx - the plugin context.
 */
export function registerSkill(ctx: Context): void {
  ctx.inject(['skills'], (skillCtx) => {
    const content = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8')
    skillCtx.skills.register({
      name: 'bailian-kb-management',
      description:
        'Manage Bailian knowledge bases with the bl CLI: create/update KBs, upload documents, deploy '
        + 'retrieval services, and maintain chunks. Retrieval itself uses the native kb_search/kb_chat tools. '
        + 'Credentials and workspace for kb_search/kb_chat resolve automatically from DSH config '
        + '(bailian-kb in ~/.dsh/settings.yaml, DASHSCOPE_API_KEY in ~/.dsh/.credentials.yaml).',
      content,
      source: 'bundled',
      resourceBase: { kind: 'directory', path: SKILL_DIR },
    })
  })
}
