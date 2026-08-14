import {
  defineCommand,
  profileSchemaPath,
  detectOutputFormat,
  type ProfileSchemaListResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: "List profile schemas",
  auth: "apiKey",
  usageArgs: "[flags]",
  flags: {
    memoryLibraryId: { type: "string", valueHint: "<id>", description: "Memory library ID" },
    pageSize: { type: "number", valueHint: "<n>", description: "Results per page (default: 10)" },
    page: { type: "number", valueHint: "<n>", description: "Page number (default: 1)" },
  },
  exampleArgs: ["", "--page-size 20 --page 2"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);

    const params = new URLSearchParams();
    if (flags.memoryLibraryId) params.set("memory_library_id", flags.memoryLibraryId);
    if (flags.pageSize !== undefined) params.set("page_size", String(flags.pageSize));
    if (flags.page !== undefined) params.set("page_num", String(flags.page));

    const query = params.toString();
    const path = query ? `${profileSchemaPath()}?${query}` : profileSchemaPath();

    if (settings.dryRun) {
      emitResult({ endpoint: ctx.client.url(path), method: "GET" }, format);
      return;
    }

    const response = await ctx.client.requestJson<ProfileSchemaListResponse>({
      path,
      method: "GET",
    });

    if (settings.quiet || format === "text") {
      const schemas = response.profile_schemas ?? [];
      if (schemas.length === 0) {
        emitBare("No profile schemas found.");
      } else {
        for (const schema of schemas) {
          emitBare(`[${schema.profile_schema_id}] ${schema.name}`);
        }
        if (response.total !== undefined) emitBare(`\nTotal: ${response.total}`);
      }
    } else {
      emitResult(response, format);
    }
  },
});
