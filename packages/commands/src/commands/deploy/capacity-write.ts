import { randomUUID } from "node:crypto";
import {
  BailianError,
  ExitCode,
  defineCommand,
  createCapacityInstance,
  scaleCapacityInstance,
  renewCapacityInstance,
  deleteCapacityInstance,
  buildReservationCapacity,
  buildPrepaidInfo,
  validateReservationCapacity,
  validatePrepaidFlags,
  hasPrepaidFlags,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { CAPACITY_INSTANCE_FLAG, DEPLOYED_MODEL_FLAG, validateQueryIds } from "./query-shared.ts";
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

const CREATE_FLAGS = {
  ...DEPLOYED_MODEL_FLAG,
  ...CAPACITY_FLAGS,
  ...PREPAID_FLAGS,
  ...WRITE_OPTIONS,
  billingMethod: {
    type: "string",
    valueHint: "<PRE_PAY|POST_PAY>",
    required: true,
    choices: ["PRE_PAY", "POST_PAY"] as const,
    description: {
      "en-US": "Capacity instance billing method (case-sensitive)",
      "zh-CN": "容量实例付费方式（区分大小写）",
    },
  },
} satisfies FlagsDef;

export const deployCapacityCreate = defineCommand({
  description: {
    "en-US": "Purchase an additional capacity instance for a ModelCode",
    "zh-CN": "为已有 ModelCode 叠加购买容量实例",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US": "Purchases additional throughput capacity and may enable recurring charges.",
      "zh-CN": "该操作将购买额外吞吐容量，可能开启持续续费。",
    },
  },
  flags: CREATE_FLAGS,
  usageArgs:
    "--deployed-model <code> --billing-method <PRE_PAY|POST_PAY> --input-tpm <kTPM> --output-tpm <kTPM> [--duration <days>] [--auto-renewal <true|false>] [--wait]",
  exampleArgs: [
    "--deployed-model example-code --billing-method POST_PAY --input-tpm 10000 --output-tpm 1000 --dry-run",
    "--deployed-model example-code --billing-method PRE_PAY --input-tpm 10000 --output-tpm 1000 --duration 30 --auto-renewal false --dry-run",
  ],
  notes: [
    ...MUTATION_NOTES,
    {
      "en-US":
        "Keeps the ModelCode, model and performance tier. Only one unreleased postpaid instance is allowed per ModelCode; the server validates purchase eligibility and slot limits.",
      "zh-CN":
        "沿用原 ModelCode、模型和性能档位。同一 ModelCode 只允许一个未释放的后付费实例；购买资格和实例数量限制由服务端校验。",
    },
  ],
  validate(flags) {
    const error =
      validateQueryIds(flags) ??
      validateWriteOptions(flags) ??
      validateReservationCapacity(flags, true);
    if (error) return error;
    if (flags.billingMethod === "POST_PAY" && hasPrepaidFlags(flags))
      return "POST_PAY cannot include prepaid settings. / 后付费不能携带预付费配置。";
    return validatePrepaidFlags(flags, flags.billingMethod === "PRE_PAY");
  },
  async run(ctx) {
    const { flags, settings } = ctx;
    const prepaid = buildPrepaidInfo(flags);
    const body = {
      billing_method: flags.billingMethod,
      ptu_capacity: buildReservationCapacity(flags),
      ...(prepaid ? { pre_paid_info: prepaid } : {}),
    };
    if (settings.dryRun) {
      emitResult(
        {
          action: "deploy.capacity.create",
          deployed_model: flags.deployedModel,
          body,
          client_request_id: flags.requestId ?? "<generated UUID>",
          wait: flags.wait,
        },
        "json",
      );
      return;
    }
    const requestId = flags.requestId ?? randomUUID();
    const response = await submitCapacityWrite(requestId, () =>
      createCapacityInstance(ctx.client, flags.deployedModel, body, {
        requestId,
      }),
    );
    await finishMutation(ctx.client, flags.deployedModel, response, flags, requestId, true);
  },
});

const SCALE_FLAGS = {
  ...DEPLOYED_MODEL_FLAG,
  ...CAPACITY_INSTANCE_FLAG,
  ...CAPACITY_FLAGS,
  ...PREPAID_FLAGS,
  ...ORDER_TYPE_FLAG,
  ...WRITE_OPTIONS,
} satisfies FlagsDef;

export const deployCapacityScale = defineCommand({
  description: {
    "en-US": "Scale the absolute capacity of one reservation instance",
    "zh-CN": "调整单个预留实例的绝对容量",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US":
        "Changes purchased capacity, may incur charges and can reduce serving capacity to zero.",
      "zh-CN": "该操作会变更购买容量、可能产生费用，也可能将服务容量降至零。",
    },
  },
  flags: SCALE_FLAGS,
  usageArgs:
    "--deployed-model <code> --instance-id <id> --input-tpm <kTPM> --output-tpm <kTPM> [--order-type <UPGRADE|DOWNGRADE>] [--wait]",
  exampleArgs: [
    "--deployed-model example-code --instance-id example-instance --input-tpm 20000 --output-tpm 2000 --dry-run",
    "--deployed-model example-code --instance-id example-instance --input-tpm 0 --output-tpm 0 --dry-run",
  ],
  notes: [
    ...MUTATION_NOTES,
    {
      "en-US":
        "Refreshes can_scale before writing. Omitted prepaid settings remain omitted, so the server can reuse saved information. Postpaid instances cannot receive prepaid settings.",
      "zh-CN":
        "写入前刷新 can_scale。未指定预付费参数时不发送该对象，由服务端复用已保存的信息。后付费实例不能携带预付费配置。",
    },
  ],
  validate: (flags) =>
    validateQueryIds(flags) ??
    validateWriteOptions(flags) ??
    validateReservationCapacity(flags, true) ??
    validatePrepaidFlags(flags, false),
  async run(ctx) {
    const { flags, settings } = ctx;
    const prepaid = buildPrepaidInfo(flags);
    const body = {
      ptu_capacity: buildReservationCapacity(flags),
      ...(flags.orderType ? { order_type: flags.orderType } : {}),
      ...(prepaid ? { pre_paid_info: prepaid } : {}),
    };
    if (settings.dryRun) {
      emitResult(
        {
          action: "deploy.capacity.scale",
          deployed_model: flags.deployedModel,
          instance_id: flags.instanceId,
          body,
          client_request_id: flags.requestId ?? "<generated UUID>",
          precheck: "can_scale",
          wait: flags.wait,
        },
        "json",
      );
      return;
    }
    const instance = await requireCapacityInstance(
      ctx.client,
      flags.deployedModel,
      flags.instanceId,
      "scale",
    );
    if (!["pre_paid", "post_paid"].includes(instance.charge_type ?? ""))
      throw new BailianError(
        "Unknown instance billing type; cannot safely scale. / 实例付费类型不明确，无法安全变配。",
        ExitCode.USAGE,
      );
    if (prepaid && instance.charge_type !== "pre_paid")
      throw new BailianError(
        "Prepaid settings require a prepaid instance. / 预付费配置只能用于预付费实例。",
        ExitCode.USAGE,
      );
    const requestId = flags.requestId ?? randomUUID();
    const response = await submitCapacityWrite(requestId, () =>
      scaleCapacityInstance(ctx.client, flags.deployedModel, flags.instanceId, body, { requestId }),
    );
    await finishMutation(ctx.client, flags.deployedModel, response, flags, requestId, true);
  },
});

const RENEW_FLAGS = {
  ...DEPLOYED_MODEL_FLAG,
  ...CAPACITY_INSTANCE_FLAG,
  ...CAPACITY_FLAGS,
  ...PREPAID_FLAGS,
  ...WRITE_OPTIONS,
  isChange: {
    type: "boolean",
    valueHint: "<true|false>",
    description: {
      "en-US": "Change capacity during renewal (default: false)",
      "zh-CN": "续订时同时变更容量（默认：false）",
    },
  },
} satisfies FlagsDef;

export const deployCapacityRenew = defineCommand({
  description: {
    "en-US": "Renew a prepaid capacity instance, optionally changing capacity",
    "zh-CN": "续订预付费容量实例，可同时变更容量",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US": "Renews a paid capacity instance and may enable automatic recurring renewal.",
      "zh-CN": "该操作将付费续订容量实例，可能开启自动持续续费。",
    },
  },
  flags: RENEW_FLAGS,
  usageArgs:
    "--deployed-model <code> --instance-id <id> --duration <days> --auto-renewal <true|false> [--is-change <true|false>] [--input-tpm <kTPM>] [--output-tpm <kTPM>] [--wait]",
  exampleArgs: [
    "--deployed-model example-code --instance-id example-instance --duration 30 --auto-renewal false --dry-run",
    "--deployed-model example-code --instance-id example-instance --duration 30 --auto-renewal true --auto-renewal-duration 30 --dry-run",
  ],
  notes: [
    ...MUTATION_NOTES,
    {
      "en-US":
        "Prepaid only; refreshes can_renew. Different capacity requires --is-change true; an unchanged capacity may be sent with false. No order_type is accepted by this endpoint.",
      "zh-CN":
        "仅支持预付费，写入前刷新 can_renew。变更容量必须指定 --is-change true；相同配置容量可随 false 发送。本接口不接受 order_type。",
    },
  ],
  validate: (flags) =>
    validateQueryIds(flags) ??
    validateWriteOptions(flags) ??
    validateReservationCapacity(flags, false) ??
    validatePrepaidFlags(flags, true),
  async run(ctx) {
    const { flags, settings } = ctx;
    const capacity = flags.inputTpm !== undefined ? buildReservationCapacity(flags) : undefined;
    const body = {
      pre_paid_info: buildPrepaidInfo(flags)!,
      is_change: flags.isChange ?? false,
      ...(capacity ? { ptu_capacity: capacity } : {}),
    };
    if (settings.dryRun) {
      emitResult(
        {
          action: "deploy.capacity.renew",
          deployed_model: flags.deployedModel,
          instance_id: flags.instanceId,
          body,
          client_request_id: flags.requestId ?? "<generated UUID>",
          precheck: "can_renew/pre_paid/configured_capacity",
          wait: flags.wait,
        },
        "json",
      );
      return;
    }
    const instance = await requireCapacityInstance(
      ctx.client,
      flags.deployedModel,
      flags.instanceId,
      "renew",
    );
    if (instance.charge_type !== "pre_paid")
      throw new BailianError(
        "Only prepaid instances can be renewed. / 仅预付费实例可以续订。",
        ExitCode.USAGE,
      );
    if (
      capacity &&
      !flags.isChange &&
      (capacity.input_tpm !== instance.configured_capacity?.input_tpm ||
        capacity.output_tpm !== instance.configured_capacity?.output_tpm)
    ) {
      throw new BailianError(
        "Different capacity requires --is-change true. / 变更容量必须指定 --is-change true。",
        ExitCode.USAGE,
      );
    }
    const requestId = flags.requestId ?? randomUUID();
    const response = await submitCapacityWrite(requestId, () =>
      renewCapacityInstance(ctx.client, flags.deployedModel, flags.instanceId, body, { requestId }),
    );
    await finishMutation(ctx.client, flags.deployedModel, response, flags, requestId, true);
  },
});

const DELETE_FLAGS = {
  ...DEPLOYED_MODEL_FLAG,
  ...CAPACITY_INSTANCE_FLAG,
  ...WRITE_OPTIONS,
  reason: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Optional release reason, sent as a query parameter",
      "zh-CN": "可选释放原因，以查询参数发送",
    },
  },
} satisfies FlagsDef;

export const deployCapacityDelete = defineCommand({
  description: {
    "en-US": "Release a capacity instance without deleting its ModelCode",
    "zh-CN": "释放容量实例，保留所属 ModelCode",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US":
        "Releases serving capacity and may interrupt requests; this cannot be undone by this command. This is not a prepaid unsubscribe/refund action.",
      "zh-CN":
        "该操作将释放服务容量，可能中断请求，不能通过本命令撤销。这不是预付费退订或退款操作。",
    },
  },
  flags: DELETE_FLAGS,
  usageArgs: "--deployed-model <code> --instance-id <id> [--reason <text>] [--wait]",
  exampleArgs: ["--deployed-model example-code --instance-id example-instance --dry-run"],
  notes: [
    ...MUTATION_NOTES,
    {
      "en-US":
        "Active prepaid instances must be unsubscribed via `deploy capacity unsubscribe` (billing console link), even when can_delete=true. Failed prepaid instances may have no associated order; only the server can decide whether direct release is supported. Release is asynchronous; verify deleted=true, not merely STOPPED or zero capacity.",
      "zh-CN":
        "已生效预付费实例须通过 `deploy capacity unsubscribe` 获取费用中心退订链接完成退订，即使 can_delete=true 也不能直接删除。失败的预付费实例可能尚未关联订单，能否直接释放由服务端裁决。释放是异步操作，须确认 deleted=true，不能只看 STOPPED 或零容量。",
    },
  ],
  validate: (flags) => validateQueryIds(flags) ?? validateWriteOptions(flags),
  async run(ctx) {
    const { flags, settings } = ctx;
    if (settings.dryRun) {
      emitResult(
        {
          action: "deploy.capacity.delete",
          deployed_model: flags.deployedModel,
          instance_id: flags.instanceId,
          query: flags.reason === undefined ? {} : { reason: flags.reason },
          client_request_id: flags.requestId ?? "<generated UUID>",
          precheck: "can_delete/prepaid_unsubscribe",
          wait: flags.wait,
        },
        "json",
      );
      return;
    }
    const instance = await requireCapacityInstance(
      ctx.client,
      flags.deployedModel,
      flags.instanceId,
      "delete",
    );
    if (instance.charge_type === "pre_paid" && instance.status !== "FAILED")
      throw new BailianError(
        "Prepaid instances must be unsubscribed in the billing console; DELETE is not a refund. Run `deploy capacity unsubscribe --instance-id <id>` to get the refund page link. / 预付费实例请在费用中心退订，DELETE 不能替代退订退款。运行 `deploy capacity unsubscribe --instance-id <id>` 获取退订页面链接。",
        ExitCode.USAGE,
      );
    if (!["pre_paid", "post_paid"].includes(instance.charge_type ?? ""))
      throw new BailianError(
        "Unknown instance billing type; cannot safely release. / 实例付费类型不明确，无法安全释放。",
        ExitCode.USAGE,
      );
    const requestId = flags.requestId ?? randomUUID();
    const response = await submitCapacityWrite(requestId, () =>
      deleteCapacityInstance(ctx.client, flags.deployedModel, flags.instanceId, {
        requestId,
        reason: flags.reason,
      }),
    );
    await finishMutation(
      ctx.client,
      flags.deployedModel,
      response,
      flags,
      requestId,
      true,
      flags.instanceId,
    );
  },
});
