import { defineCommand } from "bailian-cli-core";
import {
  APP_CONTROL_DETAIL_API,
  APP_CONTROL_UPDATE_API,
  APP_DATA_GET_API,
  APP_DATA_UPDATE_DRAFT_API,
  APP_ID_FLAG,
  APP_TYPE_FLAG,
  CONFIG_FLAGS,
  asRecord,
  consoleCall,
  consoleDryRunPreview,
  readConfigJson,
  resolveAppType,
  validateConfigFlags,
} from "./shared.ts";

export default defineCommand({
  description: {
    "en-US": "Update a Bailian application (agent config or workflow metadata)",
    "zh-CN": "更新百炼应用（智能体配置或工作流元信息）",
  },
  auth: "console",
  usageArgs: "--app-id <id> [flags]",
  flags: {
    ...APP_ID_FLAG,
    ...APP_TYPE_FLAG,
    name: {
      type: "string",
      valueHint: "<name>",
      description: { "en-US": "New application name", "zh-CN": "新的应用名称" },
    },
    description: {
      type: "string",
      valueHint: "<text>",
      description: { "en-US": "New application description", "zh-CN": "新的应用描述" },
    },
    icon: {
      type: "string",
      valueHint: "<key>",
      description: { "en-US": "New application icon key", "zh-CN": "新的应用图标 key" },
    },
    model: {
      type: "string",
      valueHint: "<model>",
      description: {
        "en-US": "Agent model ID (agent only; sets config.model)",
        "zh-CN": "智能体模型 ID（仅 agent；写入 config.model）",
      },
    },
    instructions: {
      type: "string",
      valueHint: "<text>",
      description: {
        "en-US": "Agent instructions (agent only; sets config.instruction)",
        "zh-CN": "智能体提示词（仅 agent；写入 config.instruction）",
      },
    },
    ...CONFIG_FLAGS,
  },
  notes: [
    {
      "en-US":
        "Reads the current draft first, then merges: current config -> --config-json/--config-file (shallow) -> --model/--instructions. Only changed fields are sent. Requires a console token even for --dry-run (read-only planning).",
      "zh-CN":
        "先读取当前草稿再合并：当前 config -> --config-json/--config-file（浅合并）-> --model/--instructions。仅提交变更字段。--dry-run 也需要 console 凭证（只读规划）。",
    },
    {
      "en-US":
        "Agent updates use app-control 2.0. Workflow updates only change metadata (name/description/icon); edit the canvas with `app workflow save`.",
      "zh-CN":
        "智能体更新走 app-control 2.0。工作流更新仅改元信息（名称/描述/图标）；画布编辑请用 `app workflow save`。",
    },
  ],
  exampleArgs: [
    '--app-id abc123 --name "New name"',
    "--app-id abc123 --model qwen3-max",
    '--app-id abc123 --instructions "You are a helpful assistant"',
    "--app-id abc123 --config-file ./agent-config.json",
    '--app-id abc123 --type workflow --name "New flow name"',
  ],
  validate: (flags) => {
    const conflict = validateConfigFlags(flags);
    if (conflict) return conflict;
    const hasChange =
      flags.name !== undefined ||
      flags.description !== undefined ||
      flags.icon !== undefined ||
      flags.model !== undefined ||
      flags.instructions !== undefined ||
      flags.configJson !== undefined ||
      flags.configFile !== undefined;
    if (!hasChange) {
      return {
        "en-US":
          "Provide at least one field to update (--name/--description/--icon/--model/--instructions/--config-json)",
        "zh-CN":
          "请至少提供一个待更新字段（--name/--description/--icon/--model/--instructions/--config-json）",
      };
    }
    if (
      resolveAppType(flags) === "workflow" &&
      (flags.model !== undefined ||
        flags.instructions !== undefined ||
        flags.configJson !== undefined ||
        flags.configFile !== undefined)
    ) {
      return {
        "en-US":
          "--model/--instructions/--config-json/--config-file only apply to agent; edit a workflow canvas with `app workflow save`",
        "zh-CN":
          "--model/--instructions/--config-json/--config-file 仅适用于智能体；工作流画布请用 `app workflow save` 编辑",
      };
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const appType = resolveAppType(flags);
    const code = flags.appId;
    const userConfig = await readConfigJson(flags);

    let api: string;
    let data: Record<string, unknown>;
    if (appType === "workflow") {
      // Read-modify-write the whole applicationDTO, mirroring the workflow editor.
      const detail = asRecord(
        await consoleCall(ctx.client, APP_DATA_GET_API, { reqDTO: { code, scope: "draft" } }),
      );
      const merged: Record<string, unknown> = { ...detail };
      if (flags.name !== undefined) merged.name = flags.name;
      if (flags.description !== undefined) merged.appDescription = flags.description;
      if (flags.icon !== undefined) merged.icon = flags.icon;
      api = APP_DATA_UPDATE_DRAFT_API;
      data = { reqDTO: merged };
    } else {
      const detail = asRecord(
        await consoleCall(ctx.client, APP_CONTROL_DETAIL_API, { reqDTO: { code, scope: "draft" } }),
      );
      const reqDTO: Record<string, unknown> = { code };
      if (flags.name !== undefined) reqDTO.name = flags.name;
      if (flags.description !== undefined) reqDTO.description = flags.description;
      if (flags.icon !== undefined) reqDTO.icon = flags.icon;
      if (userConfig || flags.model !== undefined || flags.instructions !== undefined) {
        const config: Record<string, unknown> = { ...asRecord(detail.config), ...userConfig };
        if (flags.model !== undefined) config.model = flags.model;
        if (flags.instructions !== undefined) config.instruction = flags.instructions;
        reqDTO.config = config;
      }
      api = APP_CONTROL_UPDATE_API;
      data = { reqDTO };
    }

    if (settings.dryRun) {
      ctx.output.result(consoleDryRunPreview(settings, api, data));
      return;
    }

    const payload = await consoleCall(ctx.client, api, data);
    ctx.output.result(
      { app_code: code, result: payload },
      settings.output === "text"
        ? {
            text: ctx.localize({
              "en-US": `Application ${code} updated.`,
              "zh-CN": `应用 ${code} 已更新。`,
            }),
          }
        : undefined,
    );
  },
});
