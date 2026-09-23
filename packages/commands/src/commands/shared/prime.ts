import {
  BailianError,
  ExitCode,
  workspaceMaaSBaseUrl,
  type Client,
  type FlagsDef,
} from "bailian-cli-core";

export const PRIME_FLAGS = {
  prime: {
    type: "switch",
    description: {
      "en-US": "Use Prime mode with a workspace-scoped endpoint",
      "zh-CN": "使用工作空间专属 Endpoint 的 Prime 模式",
    },
  },
  workspaceId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Workspace ID for the default Prime endpoint (or set BAILIAN_WORKSPACE_ID)",
      "zh-CN": "默认 Prime Endpoint 使用的 Workspace ID（也可设置 BAILIAN_WORKSPACE_ID）",
    },
  },
} satisfies FlagsDef;

interface PrimeFlags {
  prime: boolean;
  workspaceId?: string;
  model?: string;
}

export function validatePrimeFlags(flags: PrimeFlags): string | undefined {
  if (flags.workspaceId && !flags.prime) {
    return "--workspace-id requires --prime.";
  }
  if (flags.prime && !flags.model) {
    return "--prime requires an explicit --model.";
  }
  return undefined;
}

export function resolvePrimeEndpoint(
  ctx: {
    flags: Pick<PrimeFlags, "workspaceId">;
    settings: { workspaceId?: string };
    identity: { binName: string };
    client: Pick<Client, "url">;
  },
  path: string,
): string {
  return ctx.client.url(path, () => {
    const workspaceId = ctx.flags.workspaceId || ctx.settings.workspaceId;
    if (!workspaceId) {
      throw new BailianError(
        "Workspace ID is required for the default Prime endpoint.",
        ExitCode.USAGE,
        `Pass --workspace-id, set BAILIAN_WORKSPACE_ID env, or configure: ${ctx.identity.binName} config set workspace_id <id>. You can also override the endpoint with --base-url.`,
      );
    }
    return workspaceMaaSBaseUrl(workspaceId);
  });
}
