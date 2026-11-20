import { WORKSPACE_FLAG } from "../shared/workspace.ts";
import { defineSkillCommand } from "./update-check.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unpackRevision } from "./packages.ts";
import { readMcpDependencies } from "./mcp-dependencies.ts";
import { validName } from "./targets.ts";
import { readCatalogInstalls, skillsPath, UsageError } from "bailian-cli-core";
import {
  describeSkill,
  invalidCatalogResponse,
  requestCatalog,
  type CatalogSkill,
} from "./catalog.ts";

export default defineSkillCommand({
  localDryRun: true,
  description: {
    "en-US": "Get cloud skill details, installed versions and paths",
    "zh-CN": "查看云端 Skill 详情、已安装版本和路径",
  },
  auth: "apiKey",
  defaultOutput: "json",
  usageArgs: "--name <code> [--with-mcp <bool>]",
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
      valueHint: "<code>",
      required: true,
      description: {
        "en-US": "Remote skill ID or canonical installation name",
        "zh-CN": "远端 Skill ID 或本地安装名",
      },
    },
  },
  notes: [
    {
      "en-US":
        "Installation names resolve through the local lock. Use skill_code from search for other skills. Older installations can have locked_version=null.",
      "zh-CN":
        "安装名通过本地安装锁解析，其他 Skill 可使用 search 返回的 skill_code。旧安装记录的 locked_version 可能为 null。",
    },
  ],
  exampleArgs: ["--name pdf", "--name skill_example --with-mcp false"],
  validate({ name }) {
    if (!name.trim() || [".", ".."].includes(name.trim()))
      return {
        "en-US": "--name requires a skill ID or installation name.",
        "zh-CN": "--name 需要有效的 Skill ID 或安装名。",
      };
  },
  async run(ctx) {
    const local = readCatalogInstalls(ctx.client.baseUrl);
    const ids = local.resolveIds(ctx.flags.name.trim());
    if (ids.length !== 1)
      throw new UsageError(
        ctx.localize({
          "en-US": "This installation name matches multiple skills. Pass the remote skill_code.",
          "zh-CN": "该安装名对应多个 Skill，请直接传入远端 skill_code。",
        }),
      );
    const id = ids[0]!;
    const path = skillsPath(id);
    if (ctx.settings.dryRun) {
      ctx.output.result({
        method: "GET",
        path,
        ...(ctx.flags.withMcp !== false && { inspect_latest_package_file: "mcp-config.json" }),
      });
      return;
    }
    const { data, request_id } = await requestCatalog<CatalogSkill>(ctx, path);
    if (data.id !== id) invalidCatalogResponse(ctx, request_id);
    const skill = describeSkill(ctx, data, request_id);
    const details = { ...skill, ...local.inspect(id, skill.latest_version) };
    if (ctx.flags.withMcp === false) return ctx.output.result(details);
    let dependencies: string[] | undefined;
    if (skill.latest_version !== null) {
      if (!validName(skill.latest_version)) invalidCatalogResponse(ctx, request_id);
      const scratch = mkdtempSync(join(tmpdir(), "bl-skill-get-"));
      try {
        const versionPath = `${path}/versions/${encodeURIComponent(skill.latest_version)}`;
        const pkg = await unpackRevision(
          ctx,
          { source: "cloud", id, version: skill.latest_version, versionPath },
          scratch,
        );
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
