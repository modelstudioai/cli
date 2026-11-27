import { defineCommand, deleteDeployment, getDeployment } from "bailian-cli-core";

import {
  ROUTER_RESOURCE_FLAGS,
  assertModelRouter,
  validateRouterResource,
} from "./router-shared.ts";

export default defineCommand({
  defaultOutput: "json",
  description: { "en-US": "Delete a model router", "zh-CN": "删除模型路由" },
  auth: "apiKey",
  risk: {
    level: "high",
    reason: "destructive",
    message: {
      "en-US": "This permanently deletes the specified model router and cannot be undone.",
      "zh-CN": "该操作会永久删除指定的模型路由，且无法撤销。",
    },
  },
  usageArgs: "--deployed-model <id>",
  flags: ROUTER_RESOURCE_FLAGS,
  exampleArgs: [
    "--deployed-model router-example --dry-run",
    {
      "en-US": "--deployed-model router-example --yes  # Execute only after confirmation",
      "zh-CN": "--deployed-model router-example --yes  # 仅在确认后执行",
    },
  ],
  notes: [
    {
      "en-US":
        "Deletion is irreversible. The command verifies plan=mr first; a RUNNING model router does not need to be stopped before deletion.",
      "zh-CN": "删除不可撤销。本命令会先验证 plan=mr；RUNNING 状态的模型路由无需停机即可删除。",
    },
  ],
  validate: validateRouterResource,
  async run(ctx) {
    const { flags, settings } = ctx;
    if (settings.dryRun) {
      const result = { action: "deploy.router.delete", deployed_model: flags.deployedModel };
      ctx.output.result(
        result,
        settings.output === "text" ? { text: JSON.stringify(result, null, 2) } : undefined,
      );
      return;
    }
    const getResponse = await getDeployment(ctx.client, flags.deployedModel);
    assertModelRouter(getResponse.output ?? getResponse.data);
    const response = await deleteDeployment(ctx.client, flags.deployedModel);
    ctx.output.result(
      response,
      settings.output === "text" ? { text: JSON.stringify(response, null, 2) } : undefined,
    );
  },
});
