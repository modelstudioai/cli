import {
  CONSOLE_DATASET_BY_ID_API,
  CONSOLE_DATASET_VERSIONS_API,
  buildConsoleDatasetVersionsRequest,
  consoleDatasetStatusAvailability,
  getConsoleDatasetById,
  listConsoleDatasetVersions,
  queryConsoleDatasetVersion,
} from "bailian-cli-core";
import { defineConsoleReadCommand, consoleReadTargetPreview } from "../shared/console-read.ts";

export default defineConsoleReadCommand({
  auth: "console",
  description: {
    "en-US": "List Console dataset versions by group or get one version by ID",
    "zh-CN": "按组列出 Console 数据集版本，或按版本 ID 查询详情",
  },
  usageArgs: "(--dataset-group-id <id> | --dataset-id <id> [--include-status])",
  flags: {
    datasetGroupId: {
      type: "string",
      valueHint: "<id>",
      description: {
        "en-US":
          "List versions of this Console dataset group; mutually exclusive with --dataset-id",
        "zh-CN": "列出此 Console 数据集组的版本；与 --dataset-id 互斥",
      },
    },
    datasetId: {
      type: "string",
      valueHint: "<id>",
      description: {
        "en-US": "Console dataset version ID, not an API file ID",
        "zh-CN": "Console 数据集版本 ID，不是 API 文件 ID",
      },
    },
    includeStatus: {
      type: "switch",
      description: {
        "en-US": "Also query import/release state; only valid with --dataset-id",
        "zh-CN": "追加查询导入和发布状态；仅可与 --dataset-id 一起使用",
      },
    },
  },
  exampleArgs: [
    "--dataset-group-id example-group-id",
    "--dataset-group-id example-group-id --dry-run",
    "--dataset-id example-version-id",
    "--dataset-id example-version-id --include-status --output json",
  ],
  notes: [
    {
      "en-US":
        "Exactly one of --dataset-group-id or --dataset-id is required; they cannot be combined. --include-status is only valid with --dataset-id, not group listing. IDs are never inferred from their format.",
      "zh-CN":
        "--dataset-group-id 与 --dataset-id 必选一个，不能同时传入。--include-status 仅可与 --dataset-id 一起使用，不用于按组列版本。不会根据 ID 格式推断类型。",
    },
    {
      "en-US":
        "Find datasetGroupId with dataset groups, then list versions with --dataset-group-id and get details with a returned datasetId via --dataset-id. An optional fileId belongs to the file/training workflow and cannot substitute for either Console ID; dataset list still returns API file IDs.",
      "zh-CN":
        "先用 dataset groups 获取 datasetGroupId，再用 --dataset-group-id 列版本，将返回的 datasetId 传给 --dataset-id 查详情。可选 fileId 用于文件或训练流程，不能替代这两个 Console ID；dataset list 仍返回 API 文件 ID。",
    },
    {
      "en-US":
        "Group listing returns result and preserves all other service fields; a raw array is wrapped as result. There are no pagination flags and no guarantee of exhaustive results. Version/task fields are included when returned; listing does not issue individual detail queries.",
      "zh-CN":
        "按组查询返回 result 并保留其他服务端字段；原始数组包装为 result。不提供分页选项，也不保证返回全部版本。保留服务端返回的版本和任务字段，不逐条追加详情查询。",
    },
    {
      "en-US":
        "Uses the .m_efm APIs without guessing a corpus suffix. dataset contains metadata; --include-status adds version and status_query. The file query using --file-id remains separate.",
      "zh-CN":
        "使用 .m_efm 接口，不推测语料后缀。dataset 为元信息；--include-status 增加 version 和 status_query。使用 --file-id 的文件查询仍是独立能力。",
    },
    {
      "en-US":
        "Version releaseStatus: 0 draft, 1 publishing, 2 published, 3 failed. Import taskStatus: 0 initializing, 3 importing, 10 failed, 20 succeeded, 23 partially succeeded. Codes are preserved; unknown/missing states never imply success. No separate validation result or training readiness is inferred.",
      "zh-CN":
        "版本 releaseStatus：0 草稿、1 发布中、2 已发布、3 失败。导入 taskStatus：0 初始化、3 导入中、10 失败、20 成功、23 部分成功。原始码保持不变；未知或缺失状态不代表成功，不推导独立校验结果或训练就绪。",
    },
    {
      "en-US":
        "The status query requests one import task; it does not assert that task is the latest or includes all tasks. No exact match means status was not obtained, not that the version does not exist. A second-query failure preserves metadata and exits nonzero; a returned failed resource state is still a successful query.",
      "zh-CN":
        "状态查询请求一条导入任务，不承诺它是最新任务或涵盖全部任务。未精确匹配仅表示未取得状态，不证明版本不存在。第二次查询失败时保留元信息并非零退出；查到失败资源状态仍属于查询成功。",
    },
  ],
  validate(flags) {
    if (flags.datasetId !== undefined && !flags.datasetId.trim())
      return { "en-US": "--dataset-id must not be blank.", "zh-CN": "--dataset-id 不能为空。" };
    if (flags.datasetGroupId !== undefined && !flags.datasetGroupId.trim())
      return {
        "en-US": "--dataset-group-id must not be blank.",
        "zh-CN": "--dataset-group-id 不能为空。",
      };
    if ((flags.datasetId === undefined) === (flags.datasetGroupId === undefined))
      return {
        "en-US": "Provide exactly one of --dataset-group-id or --dataset-id.",
        "zh-CN": "--dataset-group-id 与 --dataset-id 必须且只能提供一个。",
      };
    if (flags.includeStatus && flags.datasetId === undefined)
      return {
        "en-US": "--include-status is only valid with --dataset-id.",
        "zh-CN": "--include-status 仅可与 --dataset-id 一起使用。",
      };
    return undefined;
  },
  async run(ctx) {
    if (ctx.flags.datasetGroupId !== undefined) {
      const groupId = ctx.flags.datasetGroupId;
      if (ctx.settings.dryRun) {
        const preview = {
          action: "dataset.version",
          api: CONSOLE_DATASET_VERSIONS_API,
          data: buildConsoleDatasetVersionsRequest(groupId),
          ...consoleReadTargetPreview(ctx.settings),
        };
        ctx.output.result(preview, { text: JSON.stringify(preview, null, 2) });
        return;
      }
      const response = await listConsoleDatasetVersions(ctx.client, groupId);
      ctx.output.result(response, { text: JSON.stringify(response, null, 2) });
      return;
    }
    // validate guarantees a version ID when the group-list branch is not selected.
    const datasetId = ctx.flags.datasetId!;
    const { includeStatus } = ctx.flags;
    if (ctx.settings.dryRun) {
      const plan = {
        action: "dataset.version",
        api: CONSOLE_DATASET_BY_ID_API,
        data: { input: { datasetId } },
        ...consoleReadTargetPreview(ctx.settings),
        ...(includeStatus
          ? {
              status_query: {
                api: CONSOLE_DATASET_VERSIONS_API,
                input: {
                  datasetId,
                  page: 1,
                  itemsPerPage: 1,
                  datasetTaskTypeList: [0],
                  datasetTaskPageSize: 1,
                },
                datasetGroupIdFrom: "dataset.datasetGroupId",
              },
            }
          : {}),
      };
      ctx.output.result(plan, { text: JSON.stringify(plan, null, 2) });
      return;
    }
    const dataset = await getConsoleDatasetById(ctx.client, datasetId);
    if (!includeStatus) {
      const result = { dataset };
      ctx.output.result(result, { text: JSON.stringify(result, null, 2) });
      return;
    }
    const datasetGroupId = dataset.datasetGroupId;
    if (typeof datasetGroupId !== "string" || !datasetGroupId.trim()) {
      const result = {
        dataset,
        version: null,
        status_query: { state: "unavailable", reason: "missing_dataset_group_id" },
      };
      ctx.output.result(result, { text: JSON.stringify(result, null, 2) });
      return;
    }
    let version: Record<string, unknown> | null;
    try {
      version = await queryConsoleDatasetVersion(ctx.client, datasetId, datasetGroupId);
    } catch (error) {
      const result = { dataset, version: null, status_query: { state: "failed" } };
      ctx.output.result(result, { text: JSON.stringify(result, null, 2) });
      throw error;
    }
    const result = {
      dataset,
      version,
      status_query: {
        state: version ? "matched" : "unavailable",
        ...(!version ? { reason: "no_exact_match_in_response" } : {}),
        ...consoleDatasetStatusAvailability(version),
      },
    };
    ctx.output.result(result, { text: JSON.stringify(result, null, 2) });
  },
});
