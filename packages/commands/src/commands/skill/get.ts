import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BailianError,
  fetchSkillsIndex,
  getSkillRegistryBaseUrl,
  readCatalogInstalls,
  skillsPath,
  type CommandContext,
} from "bailian-cli-core";
import { WORKSPACE_FLAG } from "../shared/workspace.ts";
import {
  describeSkill,
  invalidCatalogResponse,
  requestCatalog,
  type CatalogSkill,
} from "./catalog.ts";
import { readMcpDependencies } from "./mcp-dependencies.ts";
import { unpackRevision, type Revision } from "./packages.ts";
import { needsCloud, validName } from "./targets.ts";
import { defineSkillCommand, observeRegistry } from "./update-check.ts";

type Context = Pick<CommandContext, "client" | "localize">;

async function getRegistrySkill(ctx: Context, name: string) {
  const index = observeRegistry(ctx, await fetchSkillsIndex());
  const entry = Object.hasOwn(index.skills, name) && index.skills[name];
  if (!entry) {
    throw new BailianError(
      ctx.localize({
        "en-US": `Skill ${name} was not found in the OSS registry.`,
        "zh-CN": `OSS Registry 中未找到 Skill ${name}。`,
      }),
    );
  }
  const version = entry.version ?? null;
  const local = readCatalogInstalls(getSkillRegistryBaseUrl(), "oss");
  return {
    details: {
      skill_name: name,
      skill_code: entry.remoteId ?? null,
      description: entry.description ?? null,
      source: "oss",
      latest_version: version,
      published_at: entry.publishedAt ?? null,
      content_hash: entry.contentHash ?? null,
      ...local.inspect(entry.remoteId ?? name, version, name, entry.contentHash),
    },
    revision: { source: "oss", id: name, version: entry.version, oss: entry } satisfies Revision,
  };
}

async function getCloudSkill(ctx: Context, code: string, inspectPackage: boolean) {
  const path = skillsPath(code);
  const { data, request_id } = await requestCatalog<CatalogSkill>(ctx, path);
  if (data.id !== code) invalidCatalogResponse(ctx, request_id);
  const skill = describeSkill(ctx, data, request_id);
  const local = readCatalogInstalls(ctx.client.baseUrl, "openapi");
  let revision: Revision | undefined;
  if (inspectPackage && skill.latest_version !== null) {
    if (!validName(skill.latest_version)) invalidCatalogResponse(ctx, request_id);
    revision = {
      source: "cloud",
      id: code,
      version: skill.latest_version,
      versionPath: `${path}/versions/${encodeURIComponent(skill.latest_version)}`,
    };
  }
  return { details: { ...skill, ...local.inspect(code, skill.latest_version) }, revision };
}

export default defineSkillCommand({
  localDryRun: true,
  description: {
    "en-US": "Get skill details, installed versions and paths from the public registry or OpenAPI",
    "zh-CN": "查看 OSS Registry 或 OpenAPI 的 Skill 详情、已安装版本和路径",
  },
  auth: "apiKey",
  requiresApiKey: needsCloud,
  defaultOutput: "json",
  usageArgs: "(--name <name> | --code <code>) [--with-mcp <bool>]",
  flags: {
    ...WORKSPACE_FLAG,
    withMcp: {
      type: "boolean",
      implicitValue: true,
      valueHint: "<bool>",
      description: {
        "en-US":
          "Read declared MCP server codes from the latest version package (default true, null if the manifest is absent)",
        "zh-CN": "从最新版本的包中读取声明的 MCP 服务编码，默认读取，缺少声明文件时返回 null",
      },
    },
    name: {
      type: "string",
      valueHint: "<name>",
      description: {
        "en-US": "Skill name in the public OSS registry",
        "zh-CN": "公开 OSS Registry 中的 Skill 名称",
      },
    },
    code: {
      type: "string",
      valueHint: "<code>",
      description: {
        "en-US": "OpenAPI skill_code returned by skill search",
        "zh-CN": "skill search 返回的 OpenAPI skill_code",
      },
    },
  },
  exampleArgs: ["--name bailian-cli", "--code skill_example --with-mcp false"],
  validate({ name, code }) {
    if ((name === undefined) === (code === undefined))
      return {
        "en-US": "Specify exactly one of --name and --code.",
        "zh-CN": "--name 和 --code 请选择一个。",
      };
    if (name !== undefined && !validName(name.trim()))
      return {
        "en-US": "--name requires a valid OSS skill name.",
        "zh-CN": "--name 需要有效的 OSS Skill 名称。",
      };
    if (code !== undefined && (!code.trim() || [".", ".."].includes(code.trim())))
      return {
        "en-US": "--code requires a valid OpenAPI skill code.",
        "zh-CN": "--code 需要有效的 OpenAPI Skill 编码。",
      };
  },
  async run(ctx) {
    const name = ctx.flags.name?.trim();
    const code = ctx.flags.code?.trim();
    const inspectPackage = ctx.flags.withMcp !== false;
    if (ctx.settings.dryRun) {
      ctx.output.result({
        method: "GET",
        ...(name
          ? { url: `${getSkillRegistryBaseUrl()}/index.json`, name }
          : { path: skillsPath(code) }),
        ...(inspectPackage && { inspect_latest_package_file: "mcp-config.json" }),
      });
      return;
    }
    const { details, revision } = name
      ? await getRegistrySkill(ctx, name)
      : await getCloudSkill(ctx, code!, inspectPackage);
    if (!inspectPackage) return ctx.output.result(details);
    let dependencies: string[] | undefined;
    if (revision) {
      const scratch = mkdtempSync(join(tmpdir(), "bl-skill-get-"));
      try {
        const pkg = await unpackRevision(ctx, revision, scratch);
        dependencies = readMcpDependencies(pkg.root, ctx.localize);
      } catch (error) {
        ctx.output.result({ ...details, depends_on_mcp: null });
        throw error;
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    }
    ctx.output.result({ ...details, depends_on_mcp: dependencies ?? null });
  },
});
