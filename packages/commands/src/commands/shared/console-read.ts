import {
  defineCommand,
  effectiveConsoleGatewayConfig,
  type Command,
  type FlagsDef,
  type Settings,
} from "bailian-cli-core";
import { consoleWorkspaceIdentityPreview, resolveConsoleWorkspaceAgent } from "./workspace.ts";

/** Bind the whole read chain to one explicitly selected Console workspace. */
export function defineConsoleReadCommand<Flags extends FlagsDef>(
  spec: Command<Flags>,
): Command<Flags> {
  return defineCommand({
    ...spec,
    auth: "console",
    defaultOutput: "json",
    notes: [
      ...(spec.notes ?? []),
      {
        "en-US":
          "A selected workspace is resolved to its Console identity before business requests, overriding --console-switch-agent for this invocation only. Resolution failure stops the query; dry-run only previews this step.",
        "zh-CN":
          "选定工作空间时，先解析其 Console 身份，仅对本次执行覆盖 --console-switch-agent。解析失败即停止查询；dry-run 仅预览此步骤。",
      },
    ],
    async run(ctx) {
      let client = ctx.client;
      if (!ctx.settings.dryRun) {
        const switchAgent = await resolveConsoleWorkspaceAgent(ctx);
        if (switchAgent !== undefined) client = client.withConsoleSwitchAgent(switchAgent);
      }
      await spec.run({ ...ctx, client });
    },
  });
}

export function consoleReadTargetPreview(settings: Settings) {
  const target = effectiveConsoleGatewayConfig(settings);
  if (!settings.workspaceId) return target;
  const { consoleSwitchAgent: _configuredAgent, ...gateway } = target;
  return { ...gateway, ...consoleWorkspaceIdentityPreview(settings) };
}
