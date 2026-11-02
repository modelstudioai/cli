import { modelsPermissionsPath, type CommandContext } from "bailian-cli-core";
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
}

/**
 * Shared grant/revoke execution: build the POST body (per-model tri-state
 * patch, or the access_all_entities one-key switch) and send it. Validation
 * (mutual exclusion, action values, model count) has already run.
 */
export async function runPermissionChange(
  ctx: Pick<CommandContext, "settings" | "client" | "output" | "localize">,
  flags: { model?: string; action?: string; all: boolean },
  grant: boolean,
): Promise<void> {
  const format = ctx.settings.output;
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
    ctx.output.result({
      endpoint: ctx.client.url(modelsPermissionsPath()),
      method: "POST",
      request: body,
    });
    return;
  }

  const result = await ctx.client.requestJson<{ request_id?: string }>({
    path: modelsPermissionsPath(),
    method: "POST",
    body,
  });

  const verb = grant ? "granted" : "revoked";
  const summary: Record<string, unknown> = flags.all
    ? { all: true, action: "inference" }
    : { models, actions };
  let text: string | undefined;
  if (format === "text") {
    text = flags.all
      ? ctx.localize(
          grant
            ? {
                "en-US":
                  "Inference permission granted for all models in the workspace (including future ones).",
                "zh-CN": "已授予工作空间内所有模型（包括未来新增模型）的推理权限。",
              }
            : {
                "en-US": "One-key authorization closed; historical inference grants cleared.",
                "zh-CN": "已关闭一键授权；历史推理授权已清除。",
              },
        )
      : ctx.localize(
          grant
            ? {
                "en-US": `Permissions granted (${actions.join(", ")}): ${models.join(", ")}`,
                "zh-CN": `已授予权限 (${actions.join(", ")}): ${models.join(", ")}`,
              }
            : {
                "en-US": `Permissions revoked (${actions.join(", ")}): ${models.join(", ")}`,
                "zh-CN": `已撤销权限 (${actions.join(", ")}): ${models.join(", ")}`,
              },
        );
  }
  ctx.output.result(
    { ...summary, [verb]: true, request_id: result.request_id },
    text === undefined ? undefined : { text },
  );
}
