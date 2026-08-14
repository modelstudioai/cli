import {
  defineCommand,
  profileSchemaItemPath,
  detectOutputFormat,
  type ProfileSchemaGetResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: "Show a profile schema and its attribute IDs",
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
      emitResult({ endpoint: ctx.client.url(path), method: "GET" }, format);
      return;
    }

    const response = await ctx.client.requestJson<ProfileSchemaGetResponse>({
      path,
      method: "GET",
    });

    if (settings.quiet || format === "text") {
      emitBare(`${response.name}${response.description ? ` — ${response.description}` : ""}`);
      for (const attribute of response.attributes ?? []) {
        emitBare(`  [${attribute.attribute_id}] ${attribute.name}`);
      }
    } else {
      emitResult(response, format);
    }
  },
});
