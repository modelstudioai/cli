import { defineCommand, listCapacityInstances, type FlagsDef } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import {
  DEPLOYED_MODEL_FLAG,
  queryValues,
  validatePagination,
  validateQueryIds,
} from "./query-shared.ts";

const FLAGS = {
  ...DEPLOYED_MODEL_FLAG,
  page: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Page number (default: 1)", "zh-CN": "页码（默认：1）" },
  },
  pageSize: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Results per page (1–100, default: 20)",
      "zh-CN": "每页条数（1–100，默认：20）",
    },
  },
  includeDeleted: {
    type: "boolean",
    valueHint: "<true|false>",
    description: {
      "en-US": "Include released instances (default: true)",
      "zh-CN": "包含已释放实例（默认：true）",
    },
  },
  statuses: {
    type: "string",
    valueHint: "<status,...>",
    description: {
      "en-US": "Instance statuses, comma-separated (not ModelCode statuses)",
      "zh-CN": "实例状态，逗号分隔（非 ModelCode 状态）",
    },
  },
  chargeTypes: {
    type: "string",
    valueHint: "<pre_paid,post_paid>",
    description: {
      "en-US": "Charge types: pre_paid, post_paid; comma-separated",
      "zh-CN": "付费类型：pre_paid、post_paid，逗号分隔",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "List throughput reservation capacity instances",
    "zh-CN": "查询吞吐预留容量实例列表",
  },
  auth: "apiKey",
  flags: FLAGS,
  usageArgs:
    "--deployed-model <code> [--page <n>] [--page-size <n>] [--include-deleted <true|false>] [--statuses <status,...>] [--charge-types <pre_paid,post_paid>]",
  exampleArgs: [
    "--deployed-model example-model-code",
    "--deployed-model example-model-code --include-deleted false --statuses RUNNING,STOPPED",
  ],
  notes: [
    {
      "en-US":
        "Preserves the API envelope and records/items/page/itemsPerPage/pageCount pagination. Capacities are kTPM; effective, configured and target capacities are distinct. STOPPED alone does not mean released: inspect deleted.",
      "zh-CN":
        "保留 API 响应结构及 records/items/page/itemsPerPage/pageCount 分页字段。容量单位为 kTPM，区分生效、配置和目标容量。仅 STOPPED 不代表已释放，需检查 deleted。",
    },
  ],
  validate(flags) {
    const error = validateQueryIds(flags) ?? validatePagination(flags);
    if (error) return error;
    if (
      [flags.statuses, flags.chargeTypes].some((value) =>
        queryValues(value)?.some((entry) => !entry),
      )
    ) {
      return "Filter lists must not contain empty values. / 筛选列表不能包含空值。";
    }
    if (
      queryValues(flags.chargeTypes)?.some((value) => !["pre_paid", "post_paid"].includes(value))
    ) {
      return "--charge-types accepts pre_paid,post_paid. / --charge-types 仅支持 pre_paid、post_paid。";
    }
    return undefined;
  },
  async run(ctx) {
    const { flags, settings } = ctx;
    const params = {
      pageNo: flags.page ?? 1,
      pageSize: flags.pageSize ?? 20,
      includeDeleted: flags.includeDeleted ?? true,
      statuses: queryValues(flags.statuses),
      chargeTypes: queryValues(flags.chargeTypes),
    };
    if (settings.dryRun) {
      emitResult(
        {
          action: "deploy.capacity.list",
          deployed_model: flags.deployedModel,
          query: {
            page_no: params.pageNo,
            page_size: params.pageSize,
            include_deleted: params.includeDeleted,
            statuses: params.statuses?.join(","),
            charge_types: params.chargeTypes?.join(","),
          },
        },
        "json",
      );
      return;
    }
    emitResult(await listCapacityInstances(ctx.client, flags.deployedModel, params), "json");
  },
});
