import {
  defineCommand,
  memoryEndpoint,
  profileSchemaPath,
  detectOutputFormat,
  type FlagsDef,
  type ProfileSchemaListResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { buildQuery } from "../shared/params.ts";
import {
  MEMORY_LIBRARY_FLAG,
  MEMORY_WORKSPACE_NOTE,
  WORKSPACE_FLAG,
  checkMemoryScopeLengths,
  resolveWorkspaceId,
} from "./shared.ts";

const PROFILE_LIST_FLAGS = {
  pageSize: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Results per page (default: 10)", "zh-CN": "每页结果数（默认：10）" },
  },
  page: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Page number (default: 1)", "zh-CN": "页码（默认：1）" },
  },
  ...MEMORY_LIBRARY_FLAG,
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

export default defineCommand({
  description: { "en-US": "List profile schemas", "zh-CN": "列出画像模板" },
  auth: "apiKey",
  usageArgs: "[flags]",
  flags: PROFILE_LIST_FLAGS,
  notes: [MEMORY_WORKSPACE_NOTE],
  exampleArgs: [
    "--workspace-id ws_xxx",
    "--page-size 20 --page 2",
    "--memory-library-id lib_xxx --output json",
  ],
  validate: (flags) => {
    const scopeError = checkMemoryScopeLengths(flags);
    if (scopeError) return scopeError;
    if (flags.page !== undefined && flags.page < 1) return "--page must be at least 1.";
    if (flags.pageSize !== undefined && flags.pageSize < 1)
      return "--page-size must be at least 1.";
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;

    const format = detectOutputFormat(settings.output);
    const url =
      memoryEndpoint(resolveWorkspaceId(ctx), profileSchemaPath()) +
      buildQuery({
        page_size: flags.pageSize,
        page_num: flags.page,
        memory_library_id: flags.memoryLibraryId,
      });

    if (settings.dryRun) {
      emitResult({ endpoint: url, method: "GET" }, format);
      return;
    }

    const response = await ctx.client.requestJson<ProfileSchemaListResponse>({
      path: url,
      method: "GET",
    });

    if (settings.quiet || format === "text") {
      const schemas = response.profile_schemas ?? [];
      if (schemas.length === 0) {
        emitBare("No profile schemas found.");
      } else {
        for (const schema of schemas) {
          emitBare(`[${schema.profile_schema_id}] ${schema.name}`);
          if (schema.description) emitBare(`  ${schema.description}`);
        }
        if (response.total !== undefined) {
          emitBare(`\nTotal: ${response.total}`);
        }
      }
    } else {
      emitResult(response, format);
    }
  },
});
