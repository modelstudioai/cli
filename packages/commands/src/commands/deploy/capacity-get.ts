import { defineCommand, getCapacityInstance } from "bailian-cli-core";

import { CAPACITY_INSTANCE_FLAG, DEPLOYED_MODEL_FLAG, validateQueryIds } from "./query-shared.ts";

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US": "Get a throughput reservation capacity instance",
    "zh-CN": "查询吞吐预留容量实例详情",
  },
  auth: "apiKey",
  flags: { ...DEPLOYED_MODEL_FLAG, ...CAPACITY_INSTANCE_FLAG },
  usageArgs: "--deployed-model <code> --instance-id <id>",
  exampleArgs: ["--deployed-model example-model-code --instance-id example-capacity-instance"],
  notes: [
    {
      "en-US":
        "Read-only; released instances can also be queried. Preserves the API envelope, capacity fields, can_scale/can_renew/can_delete and deleted. Capacities are kTPM; the instance must belong to this ModelCode.",
      "zh-CN":
        "只读查询，已释放实例也可查询。保留 API 响应结构、容量字段、can_scale/can_renew/can_delete 和 deleted。容量单位为 kTPM，实例必须属于指定 ModelCode。",
    },
  ],
  validate: validateQueryIds,
  async run(ctx) {
    const { settings, flags } = ctx;
    if (settings.dryRun) {
      const resultData1 = {
        action: "deploy.capacity.get",
        deployed_model: flags.deployedModel,
        instance_id: flags.instanceId,
      };
      ctx.output.result(
        resultData1,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData1, null, 2) } : undefined,
      );
      return;
    }
    const resultData2 = await getCapacityInstance(
      ctx.client,
      flags.deployedModel,
      flags.instanceId,
    );
    ctx.output.result(
      resultData2,
      ctx.settings.output === "text" ? { text: JSON.stringify(resultData2, null, 2) } : undefined,
    );
  },
});
