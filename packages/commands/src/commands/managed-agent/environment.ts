import type { CloudEnvironment } from "@openagentpack/sdk";
import { getRemoteEnvironment, listRemoteEnvironments } from "@openagentpack/sdk";
import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import {
  API_TARGET_FLAGS,
  CURSOR_FLAGS,
  displayValue,
  emitCollection,
  INCLUDE_ARCHIVED_FLAG,
  matchesQuery,
  SEARCH_FLAGS,
  searchCursorPages,
  validateLimitAndPageLimit,
} from "./_engine/api-helpers.ts";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import { fetchAllPages } from "./_engine/pagination.ts";

const LIST_FLAGS = { ...API_TARGET_FLAGS, ...CURSOR_FLAGS, ...INCLUDE_ARCHIVED_FLAG };
const SEARCH_RESOURCE_FLAGS = {
  ...API_TARGET_FLAGS,
  limit: CURSOR_FLAGS.limit,
  ...SEARCH_FLAGS,
  ...INCLUDE_ARCHIVED_FLAG,
};
const GET_FLAGS = {
  ...API_TARGET_FLAGS,
  environmentId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Environment ID", "zh-CN": "Environment ID" },
  },
} as const;

function environmentRows(environments: CloudEnvironment[]): string[][] {
  return environments.map((environment) => [
    environment.id,
    displayValue(environment.name),
    displayValue(environment.scope),
    displayValue(environment.version),
    displayValue(environment.updated_at),
  ]);
}

export const managedAgentEnvironmentList = defineCommand({
  description: { "en-US": "List Managed Agent environments", "zh-CN": "列出托管 Agent 环境" },
  auth: "apiKey",
  usageArgs: "[--limit <n>] [--page <cursor>] [--all] [--include-archived]",
  flags: LIST_FLAGS,
  exampleArgs: ["", "--all --output json"],
  notes: CREDENTIALS_NOTE,
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return fetchAllPages(
          async (page) => {
            const response = await listRemoteEnvironments(runtime, {
              provider: ctx.flags.provider,
              limit: ctx.flags.limit,
              page,
              include_archived: ctx.flags.includeArchived,
            });
            return {
              items: response.data,
              hasMore: response.has_more,
              nextPage: response.next_page,
            };
          },
          ctx.flags.all,
          ctx.flags.page,
        );
      }),
    );
    emitCollection({
      format,
      key: "environments",
      items: result.items,
      headers: ["ID", "NAME", "SCOPE", "VERSION", "UPDATED"],
      rows: environmentRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      emptyMessage: "No environments found.",
    });
  },
});

export const managedAgentEnvironmentGet = defineCommand({
  description: { "en-US": "Get a Managed Agent environment", "zh-CN": "获取托管 Agent 环境详情" },
  auth: "apiKey",
  usageArgs: "--environment-id <id>",
  flags: GET_FLAGS,
  exampleArgs: ["--environment-id env_abc"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const environment = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return getRemoteEnvironment(runtime, ctx.flags.environmentId, {
          provider: ctx.flags.provider,
        });
      }),
    );
    if (format === "json") {
      emitResult(environment, format);
      return;
    }
    emitBare(`ID:          ${environment.id}`);
    emitBare(`Name:        ${displayValue(environment.name)}`);
    emitBare(`Description: ${displayValue(environment.description, 120)}`);
    emitBare(`Scope:       ${displayValue(environment.scope)}`);
    emitBare(`Version:     ${displayValue(environment.version)}`);
    emitBare(`Updated:     ${displayValue(environment.updated_at)}`);
  },
});

export const managedAgentEnvironmentSearch = defineCommand({
  description: { "en-US": "Search Managed Agent environments", "zh-CN": "搜索托管 Agent 环境" },
  auth: "apiKey",
  usageArgs: "--query <text> [--limit <n>] [--page-limit <n>] [--include-archived]",
  flags: SEARCH_RESOURCE_FLAGS,
  exampleArgs: ["--query sandbox", "--query production --page-limit 20 --output json"],
  notes: CREDENTIALS_NOTE,
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return searchCursorPages(
          async (page) => {
            const response = await listRemoteEnvironments(runtime, {
              provider: ctx.flags.provider,
              limit: ctx.flags.limit ?? 100,
              page,
              include_archived: ctx.flags.includeArchived,
            });
            return {
              items: response.data,
              hasMore: response.has_more,
              nextPage: response.next_page,
            };
          },
          (environment) =>
            matchesQuery(
              ctx.flags.query,
              environment.id,
              environment.name,
              environment.description,
            ),
          ctx.flags.pageLimit,
        );
      }),
    );
    emitCollection({
      format,
      key: "environments",
      items: result.items,
      headers: ["ID", "NAME", "SCOPE", "VERSION", "UPDATED"],
      rows: environmentRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      truncated: result.truncated,
      scannedPages: result.scannedPages,
      emptyMessage: "No matching environments found.",
    });
  },
});
