import { defineCommand, profileSchemaItemPath, detectOutputFormat } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: "Delete a profile schema",
  auth: "apiKey",
  usageArgs: "--schema-id <id> [flags]",
  flags: {
    schemaId: {
      type: "string",
      valueHint: "<id>",
      description: "Profile schema ID (required)",
      required: true,
    },
    memoryLibraryId: { type: "string", valueHint: "<id>", description: "Memory library ID" },
  },
  exampleArgs: ["--schema-id schema_xxx"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);

    const params = new URLSearchParams();
    if (flags.memoryLibraryId) params.set("memory_library_id", flags.memoryLibraryId);
    const query = params.toString();
    const base = profileSchemaItemPath(flags.schemaId);
    const path = query ? `${base}?${query}` : base;

    if (settings.dryRun) {
      emitResult({ endpoint: ctx.client.url(path), method: "DELETE" }, format);
      return;
    }

    const response = await ctx.client.requestJson<{ request_id: string }>({
      path,
      method: "DELETE",
    });

    if (settings.quiet || format === "text") {
      emitBare(`Profile schema ${flags.schemaId} deleted.`);
    } else {
      emitResult(response, format);
    }
  },
});
