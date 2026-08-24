import type { ProviderSkillInfo, SkillVersionInfo } from "@openagentpack/sdk";
import {
  downloadRemoteSkill,
  getRemoteSkill,
  listRemoteSkills,
  listRemoteSkillVersions,
} from "@openagentpack/sdk";
import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import {
  API_TARGET_FLAGS,
  CURSOR_FLAGS,
  displayValue,
  emitCollection,
  matchesQuery,
  SEARCH_FLAGS,
  searchCursorPages,
  validateLimitAndPageLimit,
} from "./_engine/api-helpers.ts";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import { writeOutputFile } from "./_engine/output-file.ts";
import { fetchAllPages } from "./_engine/pagination.ts";

const SKILL_SOURCES = ["custom", "official", "all"] as const;
type SkillSource = (typeof SKILL_SOURCES)[number];

const SOURCE_FLAG = {
  source: {
    type: "string",
    valueHint: "<source>",
    choices: SKILL_SOURCES,
    description: {
      "en-US": "Skill catalog: custom (default), official, or all",
      "zh-CN": "Skill Catalog：custom（默认）、official 或 all",
    },
  },
} as const;

const LIST_FLAGS = { ...API_TARGET_FLAGS, ...CURSOR_FLAGS, ...SOURCE_FLAG };
const SEARCH_RESOURCE_FLAGS = {
  ...API_TARGET_FLAGS,
  limit: CURSOR_FLAGS.limit,
  ...SEARCH_FLAGS,
  ...SOURCE_FLAG,
};
const GET_FLAGS = {
  ...API_TARGET_FLAGS,
  skillId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Skill ID", "zh-CN": "Skill ID" },
  },
} as const;
const VERSIONS_FLAGS = {
  ...GET_FLAGS,
  ...CURSOR_FLAGS,
};
const DOWNLOAD_FLAGS = {
  ...GET_FLAGS,
  skillVersion: {
    type: "string",
    valueHint: "<version>",
    required: true,
    description: { "en-US": "Skill version", "zh-CN": "Skill 版本" },
  },
  outputFile: {
    type: "string",
    valueHint: "<path>",
    required: true,
    description: { "en-US": "Destination ZIP path", "zh-CN": "目标 ZIP 路径" },
  },
  force: {
    type: "switch",
    description: { "en-US": "Overwrite an existing output file", "zh-CN": "覆盖已存在的输出文件" },
  },
} as const;

function skillRows(skills: ProviderSkillInfo[]): string[][] {
  return skills.map((skill) => [
    skill.id,
    displayValue(skill.name),
    skill.source,
    skill.status,
    displayValue(skill.latest_version),
    displayValue(skill.updated_at ?? skill.created_at),
  ]);
}

function versionRows(versions: SkillVersionInfo[]): string[][] {
  return versions.map((version) => [
    displayValue(version.version),
    displayValue(version.name),
    displayValue(version.type),
    displayValue(version.status),
    displayValue(version.updated_at ?? version.created_at),
  ]);
}

async function listOneCatalog(
  runtime: Parameters<typeof listRemoteSkills>[0],
  source: Exclude<SkillSource, "all">,
  options: { provider?: string; limit?: number; page?: string; all?: boolean },
) {
  return fetchAllPages(
    async (page) => {
      const response = await listRemoteSkills(runtime, {
        provider: options.provider,
        source,
        limit: options.limit,
        page,
      });
      return { items: response.data, hasMore: response.has_more, nextPage: response.next_page };
    },
    options.all,
    options.page,
  );
}

export const managedAgentSkillList = defineCommand({
  description: { "en-US": "List Managed Agent skills", "zh-CN": "列出托管 Agent Skill" },
  auth: "apiKey",
  usageArgs: "[--source custom|official|all] [--limit <n>] [--page <cursor>] [--all]",
  flags: LIST_FLAGS,
  exampleArgs: ["", "--source official", "--source all --all --output json"],
  notes: [
    ...CREDENTIALS_NOTE,
    {
      "en-US":
        "--source all combines one page from each catalog, or every page with --all; it does not accept --page.",
      "zh-CN":
        "--source all 默认合并两个 Catalog 的各一页，传入 --all 时获取全部分页；该模式不接受 --page。",
    },
  ],
  validate: (flags) =>
    validateLimitAndPageLimit(flags) ??
    (flags.source === "all" && flags.page
      ? "--source all cannot be combined with --page."
      : undefined),
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const source = (ctx.flags.source as SkillSource | undefined) ?? "custom";
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        if (source !== "all") {
          return listOneCatalog(runtime, source, {
            provider: ctx.flags.provider,
            limit: ctx.flags.limit,
            page: ctx.flags.page,
            all: ctx.flags.all,
          });
        }
        const [custom, official] = await Promise.all([
          listOneCatalog(runtime, "custom", {
            provider: ctx.flags.provider,
            limit: ctx.flags.limit,
            all: ctx.flags.all,
          }),
          listOneCatalog(runtime, "official", {
            provider: ctx.flags.provider,
            limit: ctx.flags.limit,
            all: ctx.flags.all,
          }),
        ]);
        return {
          items: [...custom.items, ...official.items],
          hasMore: custom.hasMore || official.hasMore,
          nextPage: undefined,
        };
      }),
    );
    emitCollection({
      format,
      key: "skills",
      items: result.items,
      headers: ["ID", "NAME", "SOURCE", "STATUS", "VERSION", "UPDATED"],
      rows: skillRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      emptyMessage: "No skills found.",
    });
  },
});

export const managedAgentSkillGet = defineCommand({
  description: { "en-US": "Get a Managed Agent skill", "zh-CN": "获取托管 Agent Skill 详情" },
  auth: "apiKey",
  usageArgs: "--skill-id <id>",
  flags: GET_FLAGS,
  exampleArgs: ["--skill-id skill_abc"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const skill = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return getRemoteSkill(runtime, ctx.flags.skillId, { provider: ctx.flags.provider });
      }),
    );
    if (format === "json") {
      emitResult(skill, format);
      return;
    }
    emitBare(`ID:          ${skill.id}`);
    emitBare(`Name:        ${skill.name}`);
    emitBare(`Description: ${displayValue(skill.description, 120)}`);
    emitBare(`Source:      ${skill.source}`);
    emitBare(`Status:      ${skill.status}`);
    emitBare(`Version:     ${displayValue(skill.latest_version)}`);
  },
});

export const managedAgentSkillSearch = defineCommand({
  description: { "en-US": "Search Managed Agent skills", "zh-CN": "搜索托管 Agent Skill" },
  auth: "apiKey",
  usageArgs: "--query <text> [--source custom|official|all] [--limit <n>] [--page-limit <n>]",
  flags: SEARCH_RESOURCE_FLAGS,
  exampleArgs: ["--query browser --source official", "--query report --source all --output json"],
  notes: CREDENTIALS_NOTE,
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const source = (ctx.flags.source as SkillSource | undefined) ?? "custom";
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        const searchCatalog = (catalog: Exclude<SkillSource, "all">) =>
          searchCursorPages(
            async (page) => {
              const response = await listRemoteSkills(runtime, {
                provider: ctx.flags.provider,
                source: catalog,
                limit: ctx.flags.limit ?? 100,
                page,
              });
              return {
                items: response.data,
                hasMore: response.has_more,
                nextPage: response.next_page,
              };
            },
            (skill) => matchesQuery(ctx.flags.query, skill.id, skill.name, skill.description),
            ctx.flags.pageLimit,
          );
        if (source !== "all") return searchCatalog(source);
        const [custom, official] = await Promise.all([
          searchCatalog("custom"),
          searchCatalog("official"),
        ]);
        return {
          items: [...custom.items, ...official.items],
          hasMore: custom.hasMore || official.hasMore,
          nextPage: undefined,
          scannedPages: custom.scannedPages + official.scannedPages,
          truncated: custom.truncated || official.truncated,
        };
      }),
    );
    emitCollection({
      format,
      key: "skills",
      items: result.items,
      headers: ["ID", "NAME", "SOURCE", "STATUS", "VERSION", "UPDATED"],
      rows: skillRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      truncated: result.truncated,
      scannedPages: result.scannedPages,
      emptyMessage: "No matching skills found.",
    });
  },
});

export const managedAgentSkillVersions = defineCommand({
  description: {
    "en-US": "List Managed Agent skill versions",
    "zh-CN": "列出托管 Agent Skill 版本",
  },
  auth: "apiKey",
  usageArgs: "--skill-id <id> [--limit <n>] [--page <cursor>] [--all]",
  flags: VERSIONS_FLAGS,
  exampleArgs: ["--skill-id skill_abc", "--skill-id skill_abc --all --output json"],
  notes: CREDENTIALS_NOTE,
  validate: validateLimitAndPageLimit,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return fetchAllPages(
          async (page) => {
            const response = await listRemoteSkillVersions(runtime, ctx.flags.skillId, {
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
      headers: ["VERSION", "NAME", "TYPE", "STATUS", "UPDATED"],
      rows: versionRows(result.items),
      hasMore: result.hasMore,
      nextPage: result.nextPage,
      emptyMessage: "No skill versions found.",
    });
  },
});

export const managedAgentSkillDownload = defineCommand({
  description: {
    "en-US": "Download a Managed Agent skill version",
    "zh-CN": "下载托管 Agent Skill 版本",
  },
  auth: "apiKey",
  usageArgs: "--skill-id <id> --skill-version <version> --output-file <path> [--force]",
  flags: DOWNLOAD_FLAGS,
  exampleArgs: ["--skill-id skill_abc --skill-version 3 --output-file ./skill.zip"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    if (ctx.settings.dryRun) {
      emitResult(
        {
          would_download_skill: ctx.flags.skillId,
          version: ctx.flags.skillVersion,
          output_file: ctx.flags.outputFile,
        },
        format,
      );
      return;
    }
    const content = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return downloadRemoteSkill(runtime, ctx.flags.skillId, ctx.flags.skillVersion, {
          provider: ctx.flags.provider,
        });
      }),
    );
    const outputFile = await writeOutputFile(ctx.flags.outputFile, content, ctx.flags.force);
    if (format === "json")
      emitResult(
        { downloaded: ctx.flags.skillId, version: ctx.flags.skillVersion, output_file: outputFile },
        format,
      );
    else emitBare(`Skill downloaded to ${outputFile}`);
  },
});
