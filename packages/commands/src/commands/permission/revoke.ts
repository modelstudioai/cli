import { defineCommand } from "bailian-cli-core";
import { runPermissionChange, validatePermissionChange } from "./shared.ts";

export default defineCommand({
  description: {
    "en-US": "Revoke model permissions (inference / finetune / deploy)",
    "zh-CN": "撤销模型权限（推理 / 微调 / 部署）",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US":
        "This revokes model permissions and may interrupt inference, fine-tuning, or deployment workloads. With --all, it also clears all historical inference grants.",
      "zh-CN":
        "该操作会撤销模型权限，可能导致推理、精调或部署任务中断；使用 --all 时会清除全部历史推理授权。",
    },
  },
  usageArgs: "--model <models> [--action <actions>] | --all [flags]",
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
  },
  exampleArgs: [
    "--model qwen-plus --yes",
    "--model qwen-plus,qwen3-max --action inference,finetune --yes",
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
        "All revoke operations require --yes; use --dry-run to preview the request without confirmation.",
      "zh-CN": "所有撤权操作均需使用 --yes；可通过 --dry-run 免确认预览请求。",
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
    await runPermissionChange(ctx, ctx.flags, false);
  },
});
