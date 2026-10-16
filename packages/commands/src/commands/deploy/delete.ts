import {
  defineCommand,
  deleteDeployment,
  getDeployment,
  listCapacityInstances,
  getCapacityOperation,
  BailianError,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const DELETE_FLAGS = {
  deployedModel: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Deployed model identifier (required)",
      "zh-CN": "已部署模型标识（必填）",
    },
    required: true,
  },
  skipPrecheck: {
    type: "switch",
    description: {
      "en-US": "Skip local checks only; the service still validates deletion prerequisites",
      "zh-CN": "仅跳过本地检查；服务端仍验证删除前提条件",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Delete a model deployment (PTU must be STOPPED with all capacity released)",
    "zh-CN": "删除模型部署（PTU 须为 STOPPED 且已释放全部容量）",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US": "This permanently deletes the specified model deployment and cannot be undone.",
      "zh-CN": "该操作会永久删除指定的模型部署，且无法撤销。",
    },
  },
  usageArgs: "--deployed-model <id> [--skip-precheck]",
  flags: DELETE_FLAGS,
  exampleArgs: [
    "--deployed-model dep-... --dry-run",
    {
      "en-US": "--deployed-model dep-... --yes  # Execute only after confirming deletion",
      "zh-CN": "--deployed-model dep-... --yes  # 仅在确认删除后执行",
    },
  ],
  notes: [
    {
      "en-US":
        "PTU deletion requires STOPPED, all capacity instances released, and no processing or queued capacity operations. Pausing or scaling to zero does not release an instance; prepaid capacity may require unsubscription.",
      "zh-CN":
        "PTU 删除要求状态为 STOPPED、全部容量实例已释放，且不存在执行中或排队的容量操作。暂停或缩容到零不等于释放实例；预付费容量可能需要先退订。",
    },
    {
      "en-US":
        "Local checks inspect the deployment, unreleased instances and any returned operation_id. There is no public queued-operation list API, so these checks cannot confirm all operations are finished; the service makes the final decision. --skip-precheck only omits local checks, never service validation or resource release requirements.",
      "zh-CN":
        "本地检查部署、未释放实例及返回的 operation_id。没有公开的排队操作列表接口，因此无法在本地确认所有操作均已完成，最终以服务端裁决为准。--skip-precheck 仅省略本地检查，不绕过服务端验证或资源释放要求。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const deployedModel = flags.deployedModel;

    if (settings.dryRun) {
      emitResult({ action: "deploy.delete", deployed_model: deployedModel }, "json");
      return;
    }

    if (!flags.skipPrecheck) {
      // Do not swallow a failed GET and proceed with a destructive request.
      const response = await getDeployment(ctx.client, deployedModel);
      const deployment = response.output ?? response.data;
      const status = (deployment?.status ?? "").toUpperCase();
      const isPtu =
        deployment?.plan === "ptu" ||
        deployment?.plan === "ptu_v2" ||
        deployment?.ptu_capacity !== undefined ||
        deployment?.ptu_service_tier !== undefined;
      if (isPtu) {
        if (status !== "STOPPED") {
          throw new BailianError(
            `PTU deployment ${deployedModel} must be STOPPED before deletion (current: ${status || "unknown"}). Release all capacity instances first; pausing is not release. / PTU 部署 ${deployedModel} 删除前必须为 STOPPED（当前：${status || "未知"}）；请先释放全部容量实例，暂停不等于释放。`,
            ExitCode.USAGE,
          );
        }
        const instancesResponse = await listCapacityInstances(ctx.client, deployedModel, {
          includeDeleted: false,
          pageNo: 1,
          pageSize: 1,
        });
        const page = instancesResponse.output ?? instancesResponse.data;
        if (
          (Array.isArray(page?.records) && page.records.length > 0) ||
          (typeof page?.items === "number" && page.items > 0) ||
          (typeof page?.total === "number" && page.total > 0)
        ) {
          throw new BailianError(
            "Release all capacity instances before deleting the PTU deployment; STOPPED or zero capacity does not mean released. / 删除 PTU 部署前请先释放全部容量实例；STOPPED 或零容量不等于已释放。",
            ExitCode.USAGE,
          );
        }
        // Require a recognizable empty page and an explicit zero total.
        if (
          !Array.isArray(page?.records) ||
          page.records.length !== 0 ||
          page.items !== 0 ||
          (page.total !== undefined && page.total !== 0) ||
          (page.page !== undefined && page.page !== 1) ||
          (page.pageCount !== undefined && page.pageCount !== 0 && page.pageCount !== 1)
        ) {
          throw new BailianError(
            "Cannot confirm all capacity instances are released from the list response; deletion was not submitted. / 无法从列表响应确认全部容量实例已释放；未提交删除请求。",
            ExitCode.USAGE,
          );
        }
        if (deployment?.operation_id) {
          const operationResponse = await getCapacityOperation(
            ctx.client,
            deployedModel,
            deployment.operation_id,
          );
          const operation = operationResponse.output ?? operationResponse.data;
          if (operation?.operation_status === "PROCESSING") {
            throw new BailianError(
              "A capacity operation is processing or queued. Wait for it to finish before deleting the deployment. / 存在执行中或排队的容量操作，请等待其结束后再删除部署。",
              ExitCode.USAGE,
            );
          }
          if (
            operation?.operation_status !== "SUCCEEDED" &&
            operation?.operation_status !== "FAILED"
          ) {
            throw new BailianError(
              "Cannot confirm the returned capacity operation has finished; deletion was not submitted. / 无法确认返回的容量操作已结束；未提交删除请求。",
              ExitCode.USAGE,
            );
          }
        }
      } else if (status !== "STOPPED" && status !== "FAILED") {
        throw new BailianError(
          `Deployment ${deployedModel} must be STOPPED or FAILED before deletion (current: ${status || "unknown"}). / 部署 ${deployedModel} 删除前必须为 STOPPED 或 FAILED（当前：${status || "未知"}）。`,
          ExitCode.USAGE,
          "Check the deployment status with `deploy get` before deletion. / 删除前请使用 `deploy get` 检查部署状态。",
        );
      }
    }

    // Prechecks are not atomic and cannot enumerate queued operations; the server decides.
    const response = await deleteDeployment(ctx.client, deployedModel);
    if (settings.quiet) {
      emitBare(deployedModel);
    } else {
      emitResult(response, "json");
    }
  },
});
