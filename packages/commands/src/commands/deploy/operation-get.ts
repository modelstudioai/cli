import { defineCommand, getCapacityOperation } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { CAPACITY_OPERATION_FLAGS, validateQueryIds } from "./query-shared.ts";

export default defineCommand({
  description: {
    "en-US": "Query a throughput reservation capacity operation once",
    "zh-CN": "单次查询吞吐预留容量操作",
  },
  auth: "apiKey",
  flags: CAPACITY_OPERATION_FLAGS,
  usageArgs: "--deployed-model <code> --operation-id <id>",
  exampleArgs: ["--deployed-model example-model-code --operation-id 100001"],
  notes: [
    {
      "en-US":
        "Preserves the API envelope, including FAILED and its error fields; a successful GET returns exit code 0 regardless of operation status. Use operation wait to wait for success or fail with a non-zero exit. Use the actual returned operation ID; do not construct one.",
      "zh-CN":
        "保留 API 响应结构，包括 FAILED 状态及错误字段；GET 请求成功即返回退出码 0，不以操作状态判断。需要等待成功或失败时非零退出，请使用 operation wait。操作 ID 必须使用实际返回值，不要自行构造。",
    },
  ],
  validate: validateQueryIds,
  async run(ctx) {
    const { settings, flags } = ctx;
    if (settings.dryRun) {
      emitResult(
        {
          action: "deploy.operation.get",
          deployed_model: flags.deployedModel,
          operation_id: flags.operationId,
        },
        "json",
      );
      return;
    }
    emitResult(
      await getCapacityOperation(ctx.client, flags.deployedModel, flags.operationId),
      "json",
    );
  },
});
