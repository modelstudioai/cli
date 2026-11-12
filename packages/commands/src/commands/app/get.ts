import { defineCommand } from "bailian-cli-core";
import {
  APP_CONTROL_DETAIL_API,
  APP_CONTROL_VERSION_GET_API,
  APP_DATA_GET_API,
  APP_ID_FLAG,
  APP_TYPE_FLAG,
  SCOPE_FLAG,
  consoleCall,
  consoleDryRunPreview,
  resolveAppType,
} from "./shared.ts";

export default defineCommand({
  description: {
    "en-US": "Get Bailian application details (agent or workflow)",
    "zh-CN": "查询百炼应用详情（智能体或工作流）",
  },
  auth: "console",
  usageArgs: "--app-id <id> [flags]",
  flags: {
    ...APP_ID_FLAG,
    ...APP_TYPE_FLAG,
    ...SCOPE_FLAG,
    agentVersion: {
      type: "number",
      valueHint: "<n>",
      description: {
        "en-US": "Agent version number (agent only; implies published scope by default)",
        "zh-CN": "智能体版本号（仅 agent；默认读取发布态）",
      },
    },
  },
  notes: [
    {
      "en-US":
        "Agent details come from app-control 2.0; workflow details from app-data. For the workflow canvas config use `app workflow get`.",
      "zh-CN":
        "智能体详情走 app-control 2.0；工作流详情走 app-data。工作流画布配置请用 `app workflow get`。",
    },
  ],
  exampleArgs: [
    "--app-id abc123",
    "--app-id abc123 --scope publish",
    "--app-id abc123 --agent-version 3",
    "--app-id abc123 --type workflow",
  ],
  validate: (flags) => {
    if (resolveAppType(flags) === "workflow" && flags.agentVersion !== undefined) {
      return {
        "en-US":
          "--agent-version only applies to agent; use `app workflow get --flow-version` for workflow",
        "zh-CN": "--agent-version 仅适用于智能体；工作流请用 `app workflow get --flow-version`",
      };
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const appType = resolveAppType(flags);
    const code = flags.appId;

    let api: string;
    let data: Record<string, unknown>;
    if (appType === "workflow") {
      api = APP_DATA_GET_API;
      data = { reqDTO: { code, scope: flags.scope ?? "draft" } };
    } else if (flags.agentVersion !== undefined) {
      api = APP_CONTROL_VERSION_GET_API;
      data = { reqDTO: { code, version: flags.agentVersion, scope: flags.scope ?? "publish" } };
    } else {
      api = APP_CONTROL_DETAIL_API;
      data = { reqDTO: { code, scope: flags.scope ?? "draft" } };
    }

    if (settings.dryRun) {
      ctx.output.result(consoleDryRunPreview(settings, api, data));
      return;
    }

    const payload = await consoleCall(ctx.client, api, data);
    ctx.output.result(payload);
  },
});
