// Workspace scope shared by every command whose API lives on a per-workspace
// host (knowledge admin plane, knowledge search/chat, memory). The console
// credential scope does not apply to these, so the workspace is a per-command
// flag instead.
import { BailianError, ExitCode, type FlagsDef } from "bailian-cli-core";

export const WORKSPACE_FLAG = {
  workspaceId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)",
      "zh-CN": "API Endpoint URL 使用的 Workspace ID（也可设置 BAILIAN_WORKSPACE_ID）",
    },
  },
} satisfies FlagsDef;

/** Three-level fallback: flag > BAILIAN_WORKSPACE_ID env > config (env/config are merged into settings); missing → USAGE. */
export function resolveWorkspaceId(ctx: {
  flags: { workspaceId?: string };
  settings: { workspaceId?: string };
  identity: { binName: string };
}): string {
  const workspaceId = ctx.flags.workspaceId || ctx.settings.workspaceId;
  if (!workspaceId) {
    throw new BailianError(
      "Workspace ID is required.",
      ExitCode.USAGE,
      `Pass --workspace-id, set BAILIAN_WORKSPACE_ID env, or configure: ${ctx.identity.binName} config set workspace_id <id>`,
    );
  }
  return workspaceId;
}
