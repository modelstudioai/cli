import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type FlagsDef,
  type RagGetConnectorResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const COLLECTION_GET_FLAGS = {
  collectionId: {
    type: "string",
    valueHint: "<id>",
    description: "Collection ID; alternative to --name",
  },
  name: {
    type: "string",
    valueHint: "<text>",
    description: "Collection name; alternative to --collection-id",
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: "Show data collection details",
  auth: "apiKey",
  usageArgs: "(--collection-id <id> | --name <text>) [flags]",
  flags: COLLECTION_GET_FLAGS,
  exampleArgs: ["--collection-id conn-xxx --workspace-id ws-xxx", "--name my-collection"],
  validate(flags) {
    if (!flags.collectionId && !flags.name) return "Pass --collection-id or --name";
    if (flags.collectionId && flags.name) return "Use either --collection-id or --name, not both";
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    // The server contract still uses connector* fields; only the CLI-facing term is collection
    const body = {
      ...(flags.collectionId ? { connectorId: flags.collectionId } : {}),
      ...(flags.name ? { connectorName: flags.name } : {}),
    };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.getConnector);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const response = await ctx.client.requestJson<RagGetConnectorResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    const collection = response.data;
    if (settings.quiet) {
      emitBare(collection?.connectorId ?? "");
      return;
    }
    if (format === "text") {
      emitBare(`id: ${collection?.connectorId ?? "-"}`);
      emitBare(`name: ${collection?.connectorName ?? "-"}`);
      emitBare(`description: ${collection?.description ?? "-"}`);
      // getConnector does not return fileConnectorConfig (storeType/regionId/bucketName);
      // these fields are only available on the create request body.
      return;
    }
    emitResult(response, format);
  },
});
