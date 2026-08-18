import { defineCommand, BailianError, ExitCode } from "bailian-cli-core";
import { runPermissionChange, validatePermissionChange } from "./shared.ts";

export default defineCommand({
  description: {
    "en-US": "Revoke model permissions (inference / finetune / deploy)",
    "zh-CN": "撤销模型权限（推理 / 微调 / 部署）",
  },
  auth: "apiKey",
  usageArgs: "--model <models> [--action <actions>] | --all --yes",
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
        "en-US": "Close one-key authorization and clear ALL historical inference grants",
        "zh-CN": "关闭一键授权并清除所有历史推理授权",
      },
    },
    yes: {
      type: "switch",
      description: {
        "en-US": "Confirm --all without an interactive prompt (required)",
        "zh-CN": "无需交互提示确认执行 --all（必填）",
      },
    },
  },
  exampleArgs: [
    "--model qwen-plus",
    "--model qwen-plus,qwen3-max --action inference,finetune",
    "--all --yes",
    "--model qwen-plus --dry-run --output json",
  ],
  notes: [
    {
      "en-US": "Grants apply to the business workspace your API key belongs to.",
      "zh-CN": "授权将应用于 API Key 所属的业务 Workspace。",
    },
    {
      "en-US":
        "--all maps to the server one-key switch (access_all_entities: CLOSE): it clears every historical inference grant and cannot be undone, so it requires --yes.",
      "zh-CN":
        "--all 对应服务端一键授权开关（access_all_entities: CLOSE）：它会清除所有历史推理授权且无法撤销，因此必须同时传入 --yes。",
    },
    {
      "en-US": "Actions you omit keep their current grants (server-side tri-state patch).",
      "zh-CN": "未指定的操作将保留当前授权状态（服务端三态增量更新）。",
    },
  ],
  validate: (flags) => validatePermissionChange(flags),
  async run(ctx) {
    const { flags, settings } = ctx;
    if (flags.all && !flags.yes && !settings.dryRun) {
      throw new BailianError(
        "Refusing to clear all historical inference grants without confirmation.",
        ExitCode.USAGE,
        "Re-run with --yes to close one-key authorization (or preview with --dry-run).",
      );
    }
    await runPermissionChange(ctx, flags, false);
  },
});
