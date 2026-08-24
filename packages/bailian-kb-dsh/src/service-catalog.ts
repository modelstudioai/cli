/**
 * Renders the deployed-service catalog the model reads before deciding whether
 * to retrieve.
 *
 * This is a pure function on purpose: the four selection branches below are the
 * whole routing policy, and they are far easier to pin down in tests than
 * through a live pre-step.
 *
 * Rendering conventions (settled):
 * - English frame, service names verbatim — same language as the tool
 *   descriptions, so the model is not switched between languages mid-prompt.
 * - Truncation is always stated. Silently cutting the list makes the model treat
 *   it as complete and flatly answer "there is no such knowledge base".
 * - An empty scene omits its whole section. `no chat services` is pure noise and
 *   invites the model to handle a case that does not exist.
 */

import type { ServiceScene } from "./api-types.js";
import type { ServiceEntry } from "./services.js";

/** Entries rendered per scene before switching to "most recently modified" mode. */
export const CATALOG_ENTRY_LIMIT = 10;

/** Truncation applied to a service description once the backend returns one. */
const DESCRIPTION_LIMIT = 200;

export interface CatalogInput {
  entries: readonly ServiceEntry[];
  /** Server-reported total, which may exceed `entries` when the fetch itself was capped. */
  total: number;
  /** True when the fetch stopped before the server ran out of rows. */
  truncated: boolean;
  defaultRetrieveAgentId?: string;
  defaultChatAgentId?: string;
}

const SCENE_LABEL: Record<ServiceScene, string> = {
  search: "kb_search (retrieval)",
  chat: "kb_chat (grounded Q&A)",
};

/** Render one entry as a single line. */
function renderEntry(entry: ServiceEntry): string {
  const name = entry.agent_name === "" ? "(unnamed)" : entry.agent_name;
  const description =
    entry.description === undefined || entry.description.trim() === ""
      ? undefined
      : entry.description.trim().length > DESCRIPTION_LIMIT
        ? `${entry.description.trim().slice(0, DESCRIPTION_LIMIT - 1)}…`
        : entry.description.trim();
  return `- ${entry.agent_id} — ${name}${description === undefined ? "" : `: ${description}`}`;
}

/** Most recently modified first; entries without a timestamp sort last. */
function byRecency(left: ServiceEntry, right: ServiceEntry): number {
  const l = left.modify_time ?? "";
  const r = right.modify_time ?? "";
  if (l === r) return 0;
  if (l === "") return 1;
  if (r === "") return -1;
  return l < r ? 1 : -1;
}

/**
 * Render one scene's section, or undefined when the scene has no services.
 * @param entries - all cached entries (any scene).
 * @param scene - the scene to render.
 * @param defaultAgentId - this scene's configured default service, when set.
 * @param truncatedFetch - whether the fetch itself left rows unread.
 * @returns the section lines, or undefined to omit the section entirely.
 */
function renderScene(
  entries: readonly ServiceEntry[],
  scene: ServiceScene,
  defaultAgentId: string | undefined,
  truncatedFetch: boolean,
): string[] | undefined {
  const forScene = entries.filter((entry) => entry.scene === scene);
  if (forScene.length === 0) return undefined;
  const lines = [`${SCENE_LABEL[scene]}:`];

  const configured =
    defaultAgentId === undefined
      ? undefined
      : forScene.find((entry) => entry.agent_id === defaultAgentId);
  if (configured !== undefined) {
    // A configured default is the user's own pick: the highest-quality signal
    // available, so it is the only entry worth spending context on.
    lines.push(renderEntry(configured));
    const others = forScene.length - 1;
    if (others > 0) {
      lines.push(
        `  (default service; ${others} other${others === 1 ? "" : "s"} exist — ` +
          `run \`bl knowledge service list --scene ${scene}\` to see them)`,
      );
    }
    return lines;
  }

  if (forScene.length <= CATALOG_ENTRY_LIMIT && !truncatedFetch) {
    lines.push(...forScene.map(renderEntry));
    return lines;
  }

  const shown = [...forScene].sort(byRecency).slice(0, CATALOG_ENTRY_LIMIT);
  lines.push(...shown.map(renderEntry));
  // State the shortfall: the model must know this list is partial before it
  // concludes no service covers the question.
  const knownTotal = Math.max(forScene.length, shown.length);
  lines.push(
    `  (showing ${shown.length} most recently modified of ${truncatedFetch ? "more than " : ""}` +
      `${knownTotal} deployed ${scene} services — run \`bl knowledge service list --scene ${scene} ` +
      "--name <keyword>` to look for others)",
  );
  return lines;
}

/**
 * Build the catalog text for one cached service list.
 * @param input - the cached entries plus the deployment's configured defaults.
 * @returns the model-facing text, or undefined when there is nothing worth injecting.
 */
export function buildServiceCatalog(input: CatalogInput): string | undefined {
  const search = renderScene(
    input.entries,
    "search",
    input.defaultRetrieveAgentId,
    input.truncated,
  );
  const chat = renderScene(input.entries, "chat", input.defaultChatAgentId, input.truncated);
  if (search === undefined && chat === undefined) return undefined;
  return [
    "<system-reminder>",
    // The header must not name the tools: a scene with no services omits its
    // section, and naming that tool anyway would invite passing an id from the
    // other scene, which the service rejects. Section labels carry the mapping.
    "Bailian knowledge services deployed in this workspace, grouped by the tool that accepts them. " +
      "Pass an id from the matching section as that tool's `agent_id` argument — it is required and " +
      "cannot be guessed.",
    "",
    ...(search ?? []),
    ...(search !== undefined && chat !== undefined ? [""] : []),
    ...(chat ?? []),
    "",
    "If none of these services covers what the user is asking about, say so plainly rather than " +
      "trying the closest-looking id — an unrelated retrieval result is worse than none.",
    "</system-reminder>",
  ].join("\n");
}
