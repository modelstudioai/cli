/**
 * Renders the deployed-service catalog the model reads before deciding whether
 * to retrieve, plus the notice for a workspace that deploys nothing at all.
 *
 * These are pure functions on purpose: the selection branches below are the
 * whole routing policy, and they are far easier to pin down in tests than
 * through a live pre-step.
 *
 * Rendering conventions (settled):
 * - English frame, service names verbatim — same language as the tool
 *   descriptions, so the model is not switched between languages mid-prompt.
 * - Truncation is always stated. Silently cutting the list makes the model treat
 *   it as complete and flatly answer "there is no such knowledge base".
 * - An empty scene omits its whole section. `no chat services` is pure noise and
 *   invites the model to handle a case that does not exist. An empty CATALOG is
 *   the opposite case and does get a message: see {@link buildNoServiceNotice}.
 * - `bl` is only ever recommended together with how to get it. This plugin talks
 *   to the API directly and never shells out, so a fully configured deployment
 *   can have no `bl` on PATH at all.
 */

import type { ServiceScene } from "./api-types.js";
import type { ServiceEntry } from "./services.js";

/** Entries rendered per scene before switching to "most recently modified" mode. */
export const CATALOG_ENTRY_LIMIT = 10;

/** Truncation applied to a service description once the backend returns one. */
const DESCRIPTION_LIMIT = 200;

/**
 * Appended once whenever the text tells the model to look further with `bl`.
 *
 * The install line belongs next to the recommendation, not in the tool
 * descriptions: those are static and every token there is spent on every
 * request, while this is needed only in the branches that actually name the
 * command. A single-service catalog never carries it.
 */
const BL_AVAILABILITY_NOTE =
  "(`bl` is the Bailian CLI — install it with `npm install -g bailian-cli` if the command is not found.)";

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
): { lines: string[]; usedLookupHint: boolean } | undefined {
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
      return { lines, usedLookupHint: true };
    }
    return { lines, usedLookupHint: false };
  }

  if (forScene.length <= CATALOG_ENTRY_LIMIT && !truncatedFetch) {
    lines.push(...forScene.map(renderEntry));
    return { lines, usedLookupHint: false };
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
  return { lines, usedLookupHint: true };
}

/**
 * The notice injected when the workspace is reachable but deploys nothing the
 * tools can call.
 *
 * This deliberately contradicts the "omit what does not exist" rule above, and
 * the cases are not symmetric: an empty SECTION is noise because the other
 * section still hands the model ids, whereas an empty CATALOG leaves it with no
 * id at all while `agent_id` stays required. With nothing said, the model either
 * invents an id — earning a raw server rejection — or silently drops the
 * retrieval; both read to the user as a broken plugin when the real answer is
 * "deploy a service". Naming the fix is the only way out that does not require
 * the model to already have loaded the management skill.
 * @returns the model-facing notice text.
 */
export function buildNoServiceNotice(): string {
  return [
    "<system-reminder>",
    "The Bailian knowledge tools (kb_search / kb_chat) are configured, but this workspace has no " +
      "deployed knowledge service, so neither tool can be called: both require an `agent_id` and there " +
      "is none to use. Do not call them, and do not invent an id.",
    "",
    "If the user asks for something that should come from their knowledge base, tell them a service has " +
      "to be created and deployed first — in the Bailian console (https://bailian.console.aliyun.com/), " +
      "or with `bl knowledge service create` followed by `bl knowledge service deploy`. " +
      BL_AVAILABILITY_NOTE,
    "</system-reminder>",
  ].join("\n");
}

/**
 * The service list appended to a call the server rejected, rendered from a
 * just-refreshed cache.
 *
 * Lives here rather than at the call site so every model-facing rendering obeys
 * the one set of conventions documented at the top of this file — in particular
 * that a shortfall is stated and that `bl` never appears without its install
 * line.
 * @param scene - the scene the failed call targeted.
 * @param entries - that scene's entries as of the refresh, newest first.
 * @returns the text to append to the failure.
 */
export function buildRefreshedSceneList(
  scene: ServiceScene,
  entries: readonly ServiceEntry[],
): string {
  if (entries.length === 0) return buildNoSceneServiceNotice(scene);
  const shown = entries.slice(0, CATALOG_ENTRY_LIMIT);
  const more = entries.length - shown.length;
  return [
    `Deployed ${scene} services in this workspace, re-read just now:`,
    ...shown.map(renderEntry),
    ...(more > 0
      ? [
          `(and ${more} more — run \`bl knowledge service list --scene ${scene}\` to see them) ` +
            BL_AVAILABILITY_NOTE,
        ]
      : []),
  ].join("\n");
}

/**
 * What a rejected call is told when the refreshed list holds no service for that
 * scene at all.
 *
 * The tool has already failed by this point, so this text is the model's only
 * instruction. Without it the bare server rejection ("invalid agent_id") invites
 * a retry with another guess, and no guess can succeed.
 * @param scene - the scene whose services came back empty.
 * @returns the text to append to the failure.
 */
function buildNoSceneServiceNotice(scene: ServiceScene): string {
  return (
    `This workspace has no deployed ${scene} services at all (re-checked just now), so no agent_id can ` +
    "work — do not retry with a different id. Tell the user one has to be created and deployed, in the " +
    "Bailian console (https://bailian.console.aliyun.com/) or with `bl knowledge service create` " +
    `followed by \`bl knowledge service deploy\`. ${BL_AVAILABILITY_NOTE}`
  );
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
  const usedLookupHint = search?.usedLookupHint === true || chat?.usedLookupHint === true;
  return [
    "<system-reminder>",
    // The header must not name the tools: a scene with no services omits its
    // section, and naming that tool anyway would invite passing an id from the
    // other scene, which the service rejects. Section labels carry the mapping.
    "Bailian knowledge services deployed in this workspace, grouped by the tool that accepts them. " +
      "Pass an id from the matching section as that tool's `agent_id` argument — it is required and " +
      "cannot be guessed.",
    "",
    ...(search?.lines ?? []),
    ...(search !== undefined && chat !== undefined ? [""] : []),
    ...(chat?.lines ?? []),
    "",
    "If none of these services covers what the user is asking about, say so plainly rather than " +
      "trying the closest-looking id — an unrelated retrieval result is worse than none.",
    ...(usedLookupHint ? [BL_AVAILABILITY_NOTE] : []),
    "</system-reminder>",
  ].join("\n");
}
