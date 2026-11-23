import { createDeployment, defineCommand, type FlagsDef } from "bailian-cli-core";

import {
  ROUTER_CONFIG_FLAGS,
  buildCreateModelRouterRequest,
  validateRouterConfig,
  validateRouterName,
} from "./router-shared.ts";

const FLAGS = {
  name: {
    type: "string",
    valueHint: "<name>",
    required: true,
    description: {
      "en-US": "Router name (1–64 letters, digits or hyphens)",
      "zh-CN": "路由名称（1–64 个字母、数字或连字符）",
    },
  },
  ...ROUTER_CONFIG_FLAGS,
} satisfies FlagsDef;

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US": "Create a postpaid model router",
    "zh-CN": "创建后付费模型路由",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    reason: "billing",
    message: {
      "en-US":
        "Creating the model router starts it in RUNNING state immediately; postpaid routing may incur charges.",
      "zh-CN": "创建模型路由后会立即进入 RUNNING 状态；后付费路由可能产生费用。",
    },
  },
  usageArgs:
    "--name <name> --route-version <version> --strategy <EFFECT_FIRST|COST_FIRST> --candidates <model-id,...>",
  flags: FLAGS,
  exampleArgs: [
    "--name my-router --route-version v1 --strategy EFFECT_FIRST --candidates qwen-plus,qwen-turbo --dry-run",
  ],
  notes: [
    {
      "en-US":
        "Creation uses plan=mr and charge_type=post_paid. The router becomes RUNNING immediately and may incur postpaid charges; preview with --dry-run before confirming.",
      "zh-CN":
        "创建固定使用 plan=mr 和 charge_type=post_paid。路由会立即进入 RUNNING 状态并可能产生后付费费用；确认前请先使用 --dry-run 预览。",
    },
  ],
  validate: (flags) => validateRouterName(flags.name) ?? validateRouterConfig(flags),
  async run(ctx) {
    const body = buildCreateModelRouterRequest(ctx.flags);
    if (ctx.settings.dryRun) {
      const result = { action: "deploy.router.create", body };
      ctx.output.result(
        result,
        ctx.settings.output === "text" ? { text: JSON.stringify(result, null, 2) } : undefined,
      );
      return;
    }
    const response = await createDeployment(ctx.client, body);
    ctx.output.result(
      response,
      ctx.settings.output === "text" ? { text: JSON.stringify(response, null, 2) } : undefined,
    );
  },
});
