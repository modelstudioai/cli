import { defineCommand } from "bailian-cli-core";
import { runPermissionChange, validatePermissionChange } from "./shared.ts";

export default defineCommand({
  description: {
    "en-US": "Grant model permissions (inference / finetune / deploy)",
    "zh-CN": "授予模型权限（推理 / 微调 / 部署）",
  },
  auth: "apiKey",
  usageArgs: "--model <models> [--action <actions>] | --all",
  flags: {
    model: {
      type: "string",
      valueHint: "<models>",
      description: {
        "en-US": "Model ID(s), comma-separated (max 20)",
        "zh-CN": "模型 ID，多个以逗号分隔（最多 20 个）",
      },
    },
    action: {
      type: "string",
      valueHint: "<actions>",
      description: {
        "en-US":
          "Permission action(s), comma-separated: inference, finetune, deploy (default: inference)",
        "zh-CN": "权限操作，多个以逗号分隔：inference、finetune、deploy（默认：inference）",
      },
    },
    all: {
      type: "switch",
      description: {
        "en-US": "One-key grant inference for all models in the workspace (including future ones)",
        "zh-CN": "一键授予 Workspace 中所有模型的推理权限（包括未来新增模型）",
      },
    },
  },
  exampleArgs: [
    "--model qwen-plus",
    "--model qwen-plus,qwen3-max --action inference,finetune",
    "--all",
    "--model qwen-plus --dry-run --output json",
  ],
  notes: [
    {
      "en-US": "Grants apply to the business workspace your API key belongs to.",
      "zh-CN": "授权将应用于 API Key 所属的业务 Workspace。",
    },
    {
      "en-US":
        "--all maps to the server one-key switch (access_all_entities: OPEN) and only covers inference.",
      "zh-CN": "--all 对应服务端一键授权开关（access_all_entities: OPEN），仅涵盖推理权限。",
    },
    {
      "en-US": "Actions you omit keep their current grants (server-side tri-state patch).",
      "zh-CN": "未指定的操作将保留当前授权状态（服务端三态增量更新）。",
    },
  ],
  validate: (flags) => validatePermissionChange(flags),
  async run(ctx) {
    await runPermissionChange(ctx, ctx.flags, true);
  },
});
