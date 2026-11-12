import { defineCommand } from "bailian-cli-core";
import {
  APP_CONTROL_CREATE_API,
  APP_DATA_CREATE_DRAFT_API,
  APP_TYPE_AGENT,
  CONFIG_FLAGS,
  APP_TYPE_FLAG,
  consoleCall,
  consoleDryRunPreview,
  extractAppCode,
  readConfigJson,
  resolveAppType,
  validateConfigFlags,
} from "./shared.ts";

/** Default agent config aligned with the console create modal (new-agent). */
function defaultAgentConfig(model?: string): Record<string, unknown> {
  return {
    model: model || "auto",
    model_config: {
      temperature: 0.7,
      enable_thinking: true,
      thinking_budget: 4000,
    },
    dialog_round: 3,
  };
}

export default defineCommand({
  description: {
    "en-US": "Create a Bailian application (agent or workflow)",
    "zh-CN": "创建百炼应用（智能体或工作流）",
  },
  auth: "console",
  usageArgs: "--name <name> [flags]",
  flags: {
    name: {
      type: "string",
      valueHint: "<name>",
      description: { "en-US": "Application name (required)", "zh-CN": "应用名称（必填）" },
      required: true,
    },
    ...APP_TYPE_FLAG,
    description: {
      type: "string",
      valueHint: "<text>",
      description: { "en-US": "Application description", "zh-CN": "应用描述" },
    },
    icon: {
      type: "string",
      valueHint: "<key>",
      description: { "en-US": "Application icon key", "zh-CN": "应用图标 key" },
    },
    model: {
      type: "string",
      valueHint: "<model>",
      description: {
        "en-US": "Agent model ID (default: auto; agent only)",
        "zh-CN": "智能体模型 ID（默认：auto；仅 agent 有效）",
      },
    },
    ...CONFIG_FLAGS,
  },
  notes: [
    {
      "en-US":
        "Agent creation uses the app-control 2.0 API with a default config (model auto, dialog_round 3). --config-json/--config-file shallow-merges over the default config; --model overrides config.model.",
      "zh-CN":
        "智能体创建走 app-control 2.0 接口，携带默认配置（model auto、dialog_round 3）。--config-json/--config-file 浅合并覆盖默认配置；--model 覆盖 config.model。",
    },
    {
      "en-US":
        "Workflow creation creates an empty draft canvas; edit it with `app workflow save` and publish with `app workflow publish`.",
      "zh-CN":
        "工作流创建为空草稿画布；用 `app workflow save` 编辑画布，用 `app workflow publish` 发布。",
    },
  ],
  exampleArgs: [
    {
      "en-US": '--name "Customer service"',
      "zh-CN": '--name "客户服务"',
    },
    {
      "en-US": '--name "Customer service" --model qwen3-max --description "After-sales bot"',
      "zh-CN": '--name "客户服务" --model qwen3-max --description "售后机器人"',
    },
    {
      "en-US": '--name "Order flow" --type workflow',
      "zh-CN": '--name "订单流程" --type workflow',
    },
    {
      "en-US": '--name "My agent" --config-file ./agent-config.json',
      "zh-CN": '--name "我的智能体" --config-file ./agent-config.json',
    },
  ],
  validate: (flags) => {
    const conflict = validateConfigFlags(flags);
    if (conflict) return conflict;
    if (
      resolveAppType(flags) === "workflow" &&
      (flags.model !== undefined ||
        flags.configJson !== undefined ||
        flags.configFile !== undefined)
    ) {
      return {
        "en-US":
          "--model/--config-json/--config-file only apply to agent creation; edit a workflow canvas with `app workflow save`",
        "zh-CN":
          "--model/--config-json/--config-file 仅适用于智能体创建；工作流画布请用 `app workflow save` 编辑",
      };
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const appType = resolveAppType(flags);
    const userConfig = await readConfigJson(flags);

    let api: string;
    let data: Record<string, unknown>;
    if (appType === "workflow") {
      api = APP_DATA_CREATE_DRAFT_API;
      data = {
        reqDTO: {
          name: flags.name,
          appDescription: flags.description,
          applicationConfigDTO: {},
          createType: "Workflow",
          modelId: "",
          icon: flags.icon,
          subType: "chat",
        },
      };
    } else {
      const config = { ...defaultAgentConfig(flags.model), ...userConfig };
      if (flags.model) config.model = flags.model;
      api = APP_CONTROL_CREATE_API;
      data = {
        reqDTO: {
          name: flags.name,
          description: flags.description,
          icon: flags.icon,
          source: "console",
          type: APP_TYPE_AGENT,
          status: 1,
          config,
        },
      };
    }

    if (settings.dryRun) {
      ctx.output.result(consoleDryRunPreview(settings, api, data));
      return;
    }

    const payload = await consoleCall(ctx.client, api, data);
    const appCode = extractAppCode(payload);
    ctx.output.result(
      { app_code: appCode ?? null, result: payload },
      settings.output === "text"
        ? {
            text: ctx.localize({
              "en-US": `Application created: ${appCode ?? "(see result)"}`,
              "zh-CN": `应用已创建：${appCode ?? "（见 result）"}`,
            }),
          }
        : undefined,
    );
  },
});
