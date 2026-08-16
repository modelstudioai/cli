import {
  detectOutputFormat,
  modelsPermissionsPath,
  type Client,
  type Settings,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { parseCommaList } from "../shared/params.ts";

// POST /api/v1/models/permissions accepts at most 20 models per call.
export const MAX_MODELS_PER_REQUEST = 20;

// POST body field names (server ignores unknown keys silently — the docs' curl
// example spells `fine_tune`, but only `finetune` actually takes effect).
export const PERMISSION_ACTIONS = ["inference", "finetune", "deploy"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

/** Parse --action into deduped actions (default: inference); returns an error message on bad values. */
export function parsePermissionActions(
  actionFlag: string | undefined,
): PermissionAction[] | { error: string } {
  if (!actionFlag) return ["inference"];
  const actions = parseCommaList(actionFlag);
  if (actions.length === 0) return { error: "--action must not be empty." };
  for (const action of actions) {
    if (!(PERMISSION_ACTIONS as readonly string[]).includes(action)) {
      return { error: `--action "${action}" is invalid; use ${PERMISSION_ACTIONS.join(", ")}.` };
    }
  }
  return actions as PermissionAction[];
}

/** Cross-flag validation shared by grant and revoke. */
export function validatePermissionChange(flags: {
  model?: string;
  action?: string;
  all: boolean;
}): string | undefined {
  if (flags.all && flags.model) return "--all cannot be combined with --model.";
  if (!flags.all && !flags.model) return "one of --model / --all is required.";
  const actions = parsePermissionActions(flags.action);
  if ("error" in actions) return actions.error;
  if (flags.all && (actions.length !== 1 || actions[0] !== "inference"))
    return "--all only supports the inference action.";
  if (flags.model) {
    const models = parseCommaList(flags.model);
    if (models.length === 0) return "--model must not be empty.";
    if (models.length > MAX_MODELS_PER_REQUEST)
      return `--model accepts at most ${MAX_MODELS_PER_REQUEST} models per call.`;
  }
  return undefined;
}

/**
 * Shared grant/revoke execution: build the POST body (per-model tri-state
 * patch, or the access_all_entities one-key switch) and send it. Validation
 * (mutual exclusion, action values, model count) has already run.
 */
export async function runPermissionChange(
  ctx: { settings: Settings; client: Client },
  flags: { model?: string; action?: string; all: boolean },
  grant: boolean,
): Promise<void> {
  const format = ctx.settings.outputExplicit ? detectOutputFormat(ctx.settings.output) : "json";
  const actions = parsePermissionActions(flags.action) as PermissionAction[];
  const models = flags.model ? parseCommaList(flags.model) : [];

  const body: Record<string, unknown> = flags.all
    ? { access_all_entities: grant ? "OPEN" : "CLOSE" }
    : {
        models: models.map((model) => {
          const entry: Record<string, unknown> = { model };
          for (const action of actions) entry[action] = grant;
          return entry;
        }),
      };

  if (ctx.settings.dryRun) {
    emitResult(
      { endpoint: ctx.client.url(modelsPermissionsPath()), method: "POST", request: body },
      format,
    );
    return;
  }

  const result = await ctx.client.requestJson<{ request_id?: string }>({
    path: modelsPermissionsPath(),
    method: "POST",
    body,
  });

  const verb = grant ? "granted" : "revoked";
  if (format === "json") {
    const summary: Record<string, unknown> = flags.all
      ? { all: true, action: "inference" }
      : { models, actions };
    emitResult({ ...summary, [verb]: true, request_id: result.request_id }, format);
    return;
  }

  if (flags.all) {
    process.stdout.write(
      grant
        ? "Inference permission granted for all models in the workspace (including future ones).\n"
        : "One-key authorization closed; historical inference grants cleared.\n",
    );
    return;
  }
  process.stdout.write(`Permissions ${verb} (${actions.join(", ")}): ${models.join(", ")}\n`);
}
