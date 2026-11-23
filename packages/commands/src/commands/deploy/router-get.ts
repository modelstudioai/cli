import { defineCommand, getDeployment } from "bailian-cli-core";

import {
  ROUTER_RESOURCE_FLAGS,
  assertModelRouter,
  validateRouterResource,
} from "./router-shared.ts";

export default defineCommand({
  defaultOutput: "json",
  description: { "en-US": "Get model router details", "zh-CN": "获取模型路由详情" },
  auth: "apiKey",
  usageArgs: "--deployed-model <id>",
  flags: ROUTER_RESOURCE_FLAGS,
  exampleArgs: ["--deployed-model router-example", "--deployed-model router-example --output json"],
  notes: [
    {
      "en-US": "The deployment is verified as plan=mr before its details are returned.",
      "zh-CN": "返回详情前会验证该部署为 plan=mr。",
    },
  ],
  validate: validateRouterResource,
  async run(ctx) {
    const { flags, settings } = ctx;
    if (settings.dryRun) {
      const result = { action: "deploy.router.get", deployed_model: flags.deployedModel };
      ctx.output.result(
        result,
        settings.output === "text" ? { text: JSON.stringify(result, null, 2) } : undefined,
      );
      return;
    }
    const response = await getDeployment(ctx.client, flags.deployedModel);
    const deployment = response.output ?? response.data;
    assertModelRouter(deployment);
    const result = { ...deployment, request_id: response.request_id };
    ctx.output.result(
      result,
      settings.output === "text" ? { text: JSON.stringify(result, null, 2) } : undefined,
    );
  },
});
