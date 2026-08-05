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
    description: "Collection name",
    required: true,
  },
  description: {
    type: "string",
    valueHint: "<text>",
    description: "Collection description (required by the server)",
    required: true,
  },
  storeType: {
    type: "string",
    valueHint: "<type>",
    description: "Storage: platform (managed) or custom (your own OSS bucket)",
  },
  ossRegion: {
    type: "string",
    valueHint: "<id>",
    description: "OSS region id (required with --store-type custom)",
  },
  ossBucket: {
    type: "string",
    valueHint: "<name>",
    description: "OSS bucket name (required with --store-type custom)",
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: "Create a FILE data collection",
  auth: "apiKey",
  usageArgs: "--name <text> --description <text> [flags]",
  flags: COLLECTION_CREATE_FLAGS,
  notes: [
    "Store type defaults to platform (managed storage); custom uses your authorized OSS bucket.",
    "Custom buckets must carry the bucket tag bailian-connector-access=ReadAndWrite (Bailian's tag-based access control); without it the server rejects creation with a misleading 'setBucketCORS failed' error.",
    "There is no collection delete API — create collections deliberately.",
  ],
  exampleArgs: [
    "--name my-collection --description 'team docs' --workspace-id ws-xxx",
    "--name oss-coll --description 'own bucket' --store-type custom --oss-region cn-beijing --oss-bucket my-bucket",
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
