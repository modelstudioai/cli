import { randomUUID } from "node:crypto";
import {
  defineCommand,
  scaleDeployment,
  listCapacityInstances,
  validateReservationCapacity,
  buildReservationCapacity,
  hasPrepaidFlags,
  validatePrepaidFlags,
  buildPrepaidInfo,
  BailianError,
  ExitCode,
  type Client,
  type FlagsDef,
  type ScaleDeploymentRequest,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import {
  CAPACITY_FLAGS,
  PREPAID_FLAGS,
  WRITE_OPTIONS,
  ORDER_TYPE_FLAG,
  MUTATION_NOTES,
  validateWriteOptions,
  requireCapacityInstance,
  finishMutation,
  submitCapacityWrite,
} from "./mutation-shared.ts";
import { validateQueryIds } from "./query-shared.ts";

const SCALE_FLAGS = {
  deployedModel: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Deployed model identifier (required)",
      "zh-CN": "已部署模型标识（必填）",
    },
    required: true,
  },
  capacity: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "MU target capacity: non-negative integer in plan units; must satisfy base_capacity",
      "zh-CN": "MU 目标容量：非负整数，单位为方案单元；须满足 base_capacity 约束",
    },
  },
  ...CAPACITY_FLAGS,
  instanceId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "PTU capacity instance ID; required when multiple unreleased instances exist",
      "zh-CN": "PTU 容量实例 ID；存在多个未释放实例时必填",
    },
  },
  ...PREPAID_FLAGS,
  ...WRITE_OPTIONS,
  ...ORDER_TYPE_FLAG,
} satisfies FlagsDef;

/** Resolve only a provably unique instance; never choose the first of several. */
async function resolveInstanceId(client: Client, deployedModel: string): Promise<string> {
  const response = await listCapacityInstances(client, deployedModel, {
    includeDeleted: false,
    pageNo: 1,
    pageSize: 2,
  });
  const page = response.output ?? response.data;
  const records = page?.records;
  if (
    !Array.isArray(records) ||
    records.length !== 1 ||
    page?.items !== 1 ||
    (page.page !== undefined && page.page !== 1) ||
    (page.pageCount !== undefined && page.pageCount !== 1) ||
    records[0]?.deleted === true ||
    typeof records[0]?.instance_id !== "string" ||
    !records[0].instance_id.trim()
  ) {
    throw new BailianError(
      "Cannot confirm exactly one unreleased capacity instance. Specify --instance-id; multiple instances must never be selected implicitly. / 无法确认恰好一个未释放容量实例，请指定 --instance-id；多个实例不能自动选择。",
      ExitCode.USAGE,
    );
  }
  return records[0].instance_id;
}

export default defineCommand({
  description: {
    "en-US": "Scale a deployment's capacity",
    "zh-CN": "调整部署容量",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US":
        "Scaling changes purchased capacity and may incur charges or reduce serving capacity.",
      "zh-CN": "扩缩容会变更购买的容量，可能产生费用或降低服务容量。",
    },
  },
  usageArgs:
    "--deployed-model <id> (--capacity <n> | --input-tpm <n> --output-tpm <n>) [--instance-id <id>] [flags]",
  flags: SCALE_FLAGS,
  exampleArgs: [
    "--deployed-model dep-... --capacity 8 --dry-run",
    "--deployed-model dep-... --instance-id instance-... --input-tpm 20000 --output-tpm 2000 --order-type UPGRADE --dry-run",
  ],
  notes: [
    ...MUTATION_NOTES,
    {
      "en-US":
        "PTU input/output values are the selected instance's absolute target capacity in kTPM (1 kTPM = 1000 tokens/minute), not deltas or deployment totals. Both zero is valid and does not release the instance. PTU options cannot be combined with --capacity.",
      "zh-CN":
        "PTU 输入/输出值为选中实例的绝对目标容量，单位 kTPM（1 kTPM = 1000 Token/分钟），不是增量或部署总容量。允许同时为零，但不等于释放实例。PTU 参数不能与 --capacity 混用。",
    },
    {
      "en-US":
        "Without --instance-id, execution must confirm exactly one unreleased instance and recheck can_scale. Dry-run does not resolve an instance or validate its billing type. Pass --yes only after confirming the costs and target.",
      "zh-CN":
        "省略 --instance-id 时，执行前必须确认恰好一个未释放实例并复查 can_scale。dry-run 不解析实例或验证其付费方式；仅在确认费用及目标后传入 --yes 执行。",
    },
  ],
  validate(flags) {
    const optionError = validateQueryIds(flags) ?? validateWriteOptions(flags);
    if (optionError) return optionError;
    if (flags.capacity !== undefined) {
      if (!Number.isSafeInteger(flags.capacity) || flags.capacity < 0) {
        return "--capacity must be a non-negative safe integer. / --capacity 必须是非负安全整数。";
      }
      if (
        flags.inputTpm !== undefined ||
        flags.outputTpm !== undefined ||
        flags.instanceId !== undefined ||
        flags.orderType !== undefined ||
        hasPrepaidFlags(flags) ||
        flags.wait ||
        flags.requestId !== undefined ||
        flags.interval !== undefined ||
        flags.pollTimeout !== undefined
      ) {
        return "PTU options cannot be used with --capacity. / PTU 参数不能与 --capacity 混用。";
      }
      return undefined;
    }
    return validateReservationCapacity(flags, true) ?? validatePrepaidFlags(flags, false);
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const deployedModel = flags.deployedModel;
    const isPtu = flags.capacity === undefined;
    const body: ScaleDeploymentRequest = isPtu
      ? {
          ptu_capacity: buildReservationCapacity(flags),
          ...(flags.instanceId !== undefined ? { instance_id: flags.instanceId } : {}),
          ...(flags.orderType !== undefined ? { order_type: flags.orderType } : {}),
          ...(hasPrepaidFlags(flags) ? { pre_paid_info: buildPrepaidInfo(flags) } : {}),
        }
      : { capacity: flags.capacity };

    if (settings.dryRun) {
      emitResult(
        {
          action: "deploy.scale",
          deployed_model: deployedModel,
          body,
          ...(isPtu && flags.instanceId === undefined
            ? {
                instance_resolution:
                  "Execution must resolve exactly one unreleased instance or require --instance-id. / 执行时须确认唯一未释放实例，否则必须指定 --instance-id。",
              }
            : {}),
        },
        "json",
      );
      return;
    }

    if (isPtu) {
      const instanceId = flags.instanceId ?? (await resolveInstanceId(ctx.client, deployedModel));
      const instance = await requireCapacityInstance(
        ctx.client,
        deployedModel,
        instanceId,
        "scale",
      );
      if (!["pre_paid", "post_paid"].includes(instance.charge_type ?? "")) {
        throw new BailianError(
          "Unknown instance billing type; cannot safely scale. / 实例付费类型不明确，无法安全变配。",
          ExitCode.USAGE,
        );
      }
      if (instance.charge_type === "post_paid" && hasPrepaidFlags(flags)) {
        throw new BailianError(
          "Postpaid instances do not accept prepaid options. / 后付费实例不接受预付费参数。",
          ExitCode.USAGE,
        );
      }
      body.instance_id = instanceId;
      const requestId = flags.requestId ?? randomUUID();
      const response = await submitCapacityWrite(requestId, () =>
        scaleDeployment(ctx.client, deployedModel, body, undefined, requestId),
      );
      await finishMutation(ctx.client, deployedModel, response, flags, requestId);
      return;
    }

    const response = await scaleDeployment(ctx.client, deployedModel, body);
    if (settings.quiet) {
      emitBare(deployedModel);
    } else {
      emitResult(response, "json");
    }
  },
});
