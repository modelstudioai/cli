import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  type Client,
  type FlagsDef,
  type RagConnectorResponse,
  type RagDescribeFileResponse,
} from "bailian-cli-core";
import { emitResult, emitBare, confirmDangerousAction } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const FILE_DELETE_FLAGS = {
  fileId: {
    type: "string",
    valueHint: "<id>",
    description: "Data-center file ID to delete",
    required: true,
  },
  yes: { type: "switch", description: "Skip the confirmation prompt" },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

/** Confirmation summary lookup (file name/size); failure degrades to id-only */
async function buildDeleteSummary(
  client: Client,
  workspaceId: string,
  fileId: string,
): Promise<string> {
  let infoPart = "";
  try {
    const detail = await client.requestJson<RagDescribeFileResponse>({
      path: ragEndpoint(workspaceId, RAG_PATHS.describeFile),
      method: "POST",
      body: { fileId },
    });
    if (detail.data?.fileName) infoPart = `  name: ${detail.data.fileName}`;
  } catch {
    // Degrade gracefully: a failed lookup does not block confirmation
  }
  return `Delete data-center file ${fileId}${infoPart}\nPERMANENT: if the file is referenced by knowledge bases, their document indexes break too. This differs from removing a document from one knowledge base.`;
}

export default defineCommand({
  description: "Permanently delete a file from the data center",
  auth: "apiKey",
  usageArgs: "--file-id <id> [flags]",
  flags: FILE_DELETE_FLAGS,
  notes: [
    "Irreversible. If knowledge bases reference this file, their related document indexes become invalid.",
    "To remove a document from a single knowledge base only, use the document delete command instead.",
  ],
  exampleArgs: ["--file-id file-xxx --workspace-id ws-xxx", "--file-id file-xxx --yes"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    const body = { fileId: flags.fileId };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.deleteFile);

    if (settings.dryRun) {
      emitResult({ endpoint, request: body }, format);
      return;
    }

    const summary = flags.yes
      ? ""
      : await buildDeleteSummary(ctx.client, workspaceId, flags.fileId);
    await confirmDangerousAction(summary, flags.yes ?? false);

    const response = await ctx.client.requestJson<
      RagConnectorResponse<Record<string, unknown> | undefined>
    >({
      path: endpoint,
      method: "POST",
      body,
    });

    if (settings.quiet) return;
    if (format === "text") {
      emitBare(`deleted: ${flags.fileId}`);
      return;
    }
    emitResult(response, format);
  },
});
