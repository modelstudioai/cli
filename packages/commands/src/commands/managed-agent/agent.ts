import type { CloudAgent } from "@openagentpack/sdk";
import { getRemoteAgent, listRemoteAgents, listRemoteAgentVersions } from "@openagentpack/sdk";
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

const AGENT_LIST_FLAGS = {
  ...API_TARGET_FLAGS,
  ...CURSOR_FLAGS,
  ...INCLUDE_ARCHIVED_FLAG,
};

const AGENT_SEARCH_FLAGS = {
  ...API_TARGET_FLAGS,
  limit: CURSOR_FLAGS.limit,
  ...SEARCH_FLAGS,
  ...INCLUDE_ARCHIVED_FLAG,
};

const AGENT_GET_FLAGS = {
  ...API_TARGET_FLAGS,
  agentId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Agent ID", "zh-CN": "Agent ID" },
  },
  agentVersion: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Specific agent version", "zh-CN": "指定 Agent 版本" },
  },
} as const;

const AGENT_VERSIONS_FLAGS = {
  ...API_TARGET_FLAGS,
  ...CURSOR_FLAGS,
  agentId: AGENT_GET_FLAGS.agentId,
};

function agentRows(agents: CloudAgent[]): string[][] {
  return agents.map((agent) => [
    agent.id,
    displayValue(agent.name),
    displayValue(agent.version),
    displayValue(agent.type),
    displayValue(agent.updated_at),
  ]);
}

export const managedAgentAgentList = defineCommand({
  description: { "en-US": "List Managed Agents", "zh-CN": "列出托管 Agent" },
  auth: "apiKey",
  usageArgs: "[--limit <n>] [--page <cursor>] [--all] [--include-archived] [--file <path>]",
  flags: AGENT_LIST_FLAGS,
  exampleArgs: ["", "--limit 50", "--all --include-archived --output json"],
  notes: CREDENTIALS_NOTE,
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return fetchAllPages(
          async (page) => {
            const response = await listRemoteAgents(runtime, {
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
      key: "agents",
      items: result.items,
      headers: ["ID", "NAME", "VERSION", "TYPE", "UPDATED"],
      rows: agentRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      emptyMessage: "No agents found.",
    });
  },
});

export const managedAgentAgentGet = defineCommand({
  description: { "en-US": "Get a Managed Agent", "zh-CN": "获取托管 Agent 详情" },
  auth: "apiKey",
  usageArgs: "--agent-id <id> [--agent-version <n>] [--file <path>]",
  flags: AGENT_GET_FLAGS,
  exampleArgs: ["--agent-id agent_abc", "--agent-id agent_abc --agent-version 3 --output json"],
  notes: CREDENTIALS_NOTE,
  validate: (flags) =>
    flags.agentVersion !== undefined &&
    (!Number.isInteger(flags.agentVersion) || flags.agentVersion < 1)
      ? "--agent-version must be a positive integer."
      : undefined,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const agent = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return getRemoteAgent(runtime, ctx.flags.agentId, {
          provider: ctx.flags.provider,
          version: ctx.flags.agentVersion,
        });
      }),
    );
    if (format === "json") {
      emitResult(agent, format);
      return;
    }
    emitBare(`ID:          ${agent.id}`);
    emitBare(`Name:        ${displayValue(agent.name)}`);
    emitBare(`Description: ${displayValue(agent.description, 120)}`);
    emitBare(`Version:     ${displayValue(agent.version)}`);
    emitBare(`Type:        ${displayValue(agent.type)}`);
    emitBare(`Created:     ${displayValue(agent.created_at)}`);
    emitBare(`Updated:     ${displayValue(agent.updated_at)}`);
  },
});

export const managedAgentAgentSearch = defineCommand({
  description: { "en-US": "Search Managed Agents", "zh-CN": "搜索托管 Agent" },
  auth: "apiKey",
  usageArgs: "--query <text> [--limit <n>] [--page-limit <n>] [--include-archived]",
  flags: AGENT_SEARCH_FLAGS,
  exampleArgs: ["--query assistant", "--query code --page-limit 20 --output json"],
  notes: CREDENTIALS_NOTE,
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return searchCursorPages(
          async (page) => {
            const response = await listRemoteAgents(runtime, {
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
          (agent) => matchesQuery(ctx.flags.query, agent.id, agent.name, agent.description),
          ctx.flags.pageLimit,
        );
      }),
    );
    emitCollection({
      format,
      key: "agents",
      items: result.items,
      headers: ["ID", "NAME", "VERSION", "TYPE", "UPDATED"],
      rows: agentRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      truncated: result.truncated,
      scannedPages: result.scannedPages,
      emptyMessage: "No matching agents found.",
    });
  },
});

export const managedAgentAgentVersions = defineCommand({
  description: { "en-US": "List Managed Agent versions", "zh-CN": "列出托管 Agent 版本" },
  auth: "apiKey",
  usageArgs: "--agent-id <id> [--limit <n>] [--page <cursor>] [--all]",
  flags: AGENT_VERSIONS_FLAGS,
  exampleArgs: ["--agent-id agent_abc", "--agent-id agent_abc --all --output json"],
  notes: CREDENTIALS_NOTE,
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return fetchAllPages(
          async (page) => {
            const response = await listRemoteAgentVersions(runtime, ctx.flags.agentId, {
              provider: ctx.flags.provider,
              limit: ctx.flags.limit,
              page,
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
      key: "versions",
      items: result.items,
      headers: ["ID", "NAME", "VERSION", "TYPE", "UPDATED"],
      rows: agentRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      emptyMessage: "No agent versions found.",
    });
  },
});
