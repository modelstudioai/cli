import {
  BailianError,
  ExitCode,
  defineCommand,
  getDeployment,
  updateDeployment,
  type UpdateModelRouterRequest,
} from "bailian-cli-core";

import {
  ROUTER_UPDATE_FLAGS,
  assertModelRouter,
  assertRouterRunning,
  buildUpdateModelRouterRequest,
  hasCompleteRouterUpdate,
  validateRouterUpdate,
} from "./router-shared.ts";

interface RouterUpdatePrepared {
  body: UpdateModelRouterRequest;
}

export default defineCommand<typeof ROUTER_UPDATE_FLAGS, RouterUpdatePrepared>({
  defaultOutput: "json",
  description: {
    "en-US": "Update selected fields of a running model router configuration",
    "zh-CN": "更新运行中模型路由的指定配置项",
  },
  auth: "apiKey",
  usageArgs:
    "--deployed-model <id> [--route-version <version>] [--strategy <EFFECT_FIRST|COST_FIRST>] [--candidates <model-id,...>]",
  flags: ROUTER_UPDATE_FLAGS,
  exampleArgs: [
    "--deployed-model router-example --strategy COST_FIRST --dry-run",
    "--deployed-model router-example --route-version v1 --strategy COST_FIRST --candidates qwen-plus,qwen-turbo --dry-run",
  ],
  notes: [
    {
      "en-US":
        "Provide at least one routing field. The CLI reads the current router and preserves fields you do not provide; --candidates replaces the entire candidate list. Only RUNNING model routers can be updated.",
      "zh-CN":
        "请至少提供一个路由配置项。CLI 会读取当前路由并保留未提供的字段；--candidates 会替换整个候选模型列表。仅 RUNNING 状态的模型路由可更新。",
    },
    {
      "en-US":
        "A dry-run with all three routing fields stays offline. A partial dry-run requires credentials and reads the current router, but never submits an update.",
      "zh-CN":
        "同时提供三个路由配置项时，预览不会联网。部分参数预览需要凭证并读取当前路由，但不会提交更新。",
    },
  ],
  validate: validateRouterUpdate,
  async prepare(ctx) {
    let body: UpdateModelRouterRequest;
    if (ctx.settings.dryRun && hasCompleteRouterUpdate(ctx.flags)) {
      body = buildUpdateModelRouterRequest(ctx.flags);
    } else {
      const getResponse = await getDeployment(ctx.client, ctx.flags.deployedModel);
      const deployment = getResponse.output ?? getResponse.data;
      assertModelRouter(deployment);
      assertRouterRunning(deployment);
      body = buildUpdateModelRouterRequest(ctx.flags, deployment.routing_config);
    }
    return {
      data: { body },
      preview: {
        action: "deploy.router.update",
        deployed_model: ctx.flags.deployedModel,
        body,
      },
      risk: null,
      notices: [],
    };
  },
  async run(ctx) {
    if (!ctx.prepared) {
      throw new BailianError(
        "The model router update requires a prepared request. / 模型路由更新需要先完成请求预检。",
        ExitCode.GENERAL,
      );
    }
    const response = await updateDeployment(ctx.client, ctx.flags.deployedModel, ctx.prepared.body);
    ctx.output.result(
      response,
      ctx.settings.output === "text" ? { text: JSON.stringify(response, null, 2) } : undefined,
    );
  },
});
