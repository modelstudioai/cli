import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type FlagsDef,
  type RagAddConnectorResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const COLLECTION_CREATE_FLAGS = {
  name: {
    type: "string",
    valueHint: "<text>",
    description: { "en-US": "Collection name", "zh-CN": "数据集合名称" },
    required: true,
  },
  description: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Collection description (required by the server)",
      "zh-CN": "数据集合描述（服务端必填）",
    },
    required: true,
  },
  storeType: {
    type: "string",
    valueHint: "<type>",
    description: {
      "en-US": "Storage: platform (managed) or custom (your own OSS bucket)",
      "zh-CN": "存储类型：platform（托管）或 custom（自有 OSS Bucket）",
    },
  },
  ossRegion: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "OSS region id (required with --store-type custom)",
      "zh-CN": "OSS Region ID（使用 --store-type custom 时必填）",
    },
  },
  ossBucket: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "OSS bucket name (required with --store-type custom)",
      "zh-CN": "OSS Bucket 名称（使用 --store-type custom 时必填）",
    },
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: { "en-US": "Create a FILE data collection", "zh-CN": "创建 FILE 数据集合" },
  auth: "apiKey",
  usageArgs: "--name <text> --description <text> [flags]",
  flags: COLLECTION_CREATE_FLAGS,
  notes: [
    {
      "en-US":
        "Store type defaults to platform (managed storage); custom uses your authorized OSS bucket.",
      "zh-CN": "存储类型默认为 platform（托管存储）；custom 使用已授权的自有 OSS Bucket。",
    },
    {
      "en-US":
        "Custom buckets must carry the bucket tag bailian-connector-access=ReadAndWrite (Bailian's tag-based access control); without it the server rejects creation with a misleading 'setBucketCORS failed' error.",
      "zh-CN":
        "自定义 Bucket 必须带有 bailian-connector-access=ReadAndWrite 标签（百炼基于标签的访问控制）；缺少该标签时，服务端会以容易误解的 'setBucketCORS failed' 错误拒绝创建。",
    },
    {
      "en-US": "There is no collection delete API — create collections deliberately.",
      "zh-CN": "目前没有删除数据集合的 API——请谨慎创建。",
    },
  ],
  exampleArgs: [
    {
      "en-US": "--name my-collection --description 'team docs' --workspace-id ws-xxx",
      "zh-CN": "--name my-collection --description '团队文档' --workspace-id ws-xxx",
    },
    {
      "en-US":
        "--name oss-coll --description 'own bucket' --store-type custom --oss-region cn-beijing --oss-bucket my-bucket",
      "zh-CN":
        "--name oss-coll --description '自有 Bucket' --store-type custom --oss-region cn-beijing --oss-bucket my-bucket",
    },
  ],
  validate(flags) {
    // Server rejects names longer than 20 characters ("Connector name is longer than 20")
    if (flags.name.length < 1 || flags.name.length > 20) return "--name must be 1-20 characters";
    const storeType = flags.storeType ?? "platform";
    if (storeType !== "platform" && storeType !== "custom") {
      return "--store-type must be platform or custom";
    }
    if (storeType === "custom" && (!flags.ossRegion || !flags.ossBucket)) {
      return "--store-type custom requires --oss-region and --oss-bucket";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    const storeType = (flags.storeType ?? "platform").toUpperCase();
    // The server contract still uses connector* fields; only the CLI-facing term is collection.
    // CUSTOM fields are regionId/bucketName per api/connector/add-connector.md (live-verified;
    // the earlier ossRegionId/ossBucket naming was an implementation error, rejected with InvalidParameter).
    const body = {
      connectorType: "FILE",
      connectorName: flags.name,
      description: flags.description,
      fileConnectorConfig: {
        storeType,
        ...(storeType === "CUSTOM"
          ? { regionId: flags.ossRegion, bucketName: flags.ossBucket }
          : {}),
      },
    };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.addConnector);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<RagAddConnectorResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    const collectionId = response.data?.connectorId;
    if (settings.quiet) {
      emitBare(collectionId ?? "");
      return;
    }
    if (format === "text") {
      emitBare(`created: ${collectionId ?? "-"}  (${flags.name}, ${storeType})`);
      return;
    }
    emitResult(response, format);
  },
});
