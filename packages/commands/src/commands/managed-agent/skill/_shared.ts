import type { ProviderSkillInfo, SkillVersionInfo } from "@openagentpack/sdk";
import {
  API_TARGET_FLAGS,
  CURSOR_FLAGS,
  displayValue,
  SEARCH_FLAGS,
} from "../_engine/api-helpers.ts";

export const SKILL_SOURCES = ["custom", "official", "all"] as const;
export type SkillSource = (typeof SKILL_SOURCES)[number];

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

export const SKILL_LIST_FLAGS = { ...API_TARGET_FLAGS, ...CURSOR_FLAGS, ...SOURCE_FLAG };

export const SKILL_SEARCH_FLAGS = {
  ...API_TARGET_FLAGS,
  limit: CURSOR_FLAGS.limit,
  ...SEARCH_FLAGS,
  ...SOURCE_FLAG,
};

export const SKILL_GET_FLAGS = {
  ...API_TARGET_FLAGS,
  skillId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Skill ID", "zh-CN": "Skill ID" },
  },
} as const;

export const SKILL_VERSIONS_FLAGS = {
  ...SKILL_GET_FLAGS,
  ...CURSOR_FLAGS,
};

export const SKILL_DOWNLOAD_FLAGS = {
  ...SKILL_GET_FLAGS,
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

export function skillRows(skills: ProviderSkillInfo[]): string[][] {
  return skills.map((skill) => [
    skill.id,
    displayValue(skill.name),
    skill.source,
    skill.status,
    displayValue(skill.latest_version),
    displayValue(skill.updated_at ?? skill.created_at),
  ]);
}

export function versionRows(versions: SkillVersionInfo[]): string[][] {
  return versions.map((version) => [
    displayValue(version.version),
    displayValue(version.name),
    displayValue(version.type),
    displayValue(version.status),
    displayValue(version.updated_at ?? version.created_at),
  ]);
}
