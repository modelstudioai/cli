import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  BailianError,
  computeDirContentHash,
  downloadSkillAsset,
  downloadSkillZip,
  extractSkillZip,
  extractTarBr,
  skillsPath,
  validateSkillDir,
  type CommandContext,
  type SkillIndexEntry,
} from "bailian-cli-core";
import {
  describeSkill,
  invalidCatalogResponse,
  requestCatalog,
  type CatalogSkill,
} from "./catalog.ts";
import { validName } from "./targets.ts";

type Context = Pick<CommandContext, "client" | "localize" | "settings">;
export async function cloudCatalog(ctx: Context) {
  const skills = new Map<string, CatalogSkill>();
  const size = 100;
  for (let page = 1; page * size <= 10000; page++) {
    const { data, request_id } = await requestCatalog<{
      items: CatalogSkill[];
      total: number;
      page_no: number;
      page_size: number;
    }>(ctx, `${skillsPath()}?pageNo=${page}&pageSize=${size}`);
    if (
      !Array.isArray(data.items) ||
      data.page_no !== page ||
      data.page_size !== size ||
      !Number.isSafeInteger(data.total) ||
      data.total < 0 ||
      data.items.length > size
    )
      invalidCatalogResponse(ctx, request_id);
    for (const item of data.items) {
      describeSkill(ctx, item, request_id);
      skills.set(item.id, item);
    }
    if (page * size >= data.total) return skills;
    if (!data.items.length) invalidCatalogResponse(ctx, request_id);
  }
  throw new BailianError(
    ctx.localize({
      "en-US": "The catalog exceeds the 10000-record API window.",
      "zh-CN": "云端目录超出接口一万条分页窗口。",
    }),
  );
}

export interface Revision {
  id: string;
  source: "oss" | "cloud";
  version?: string;
  description?: string;
  oss?: SkillIndexEntry;
  versionPath?: string;
}
export async function cloudRevision(
  ctx: Context,
  id: string,
  requested?: string,
): Promise<Revision> {
  const detail = await requestCatalog<CatalogSkill>(ctx, skillsPath(id));
  if (detail.data.id !== id) invalidCatalogResponse(ctx, detail.request_id);
  const skill = describeSkill(ctx, detail.data, detail.request_id);
  const version = requested ?? skill.latest_version;
  if (!version || !validName(version))
    throw new BailianError(
      ctx.localize({
        "en-US": "No installable skill version was returned.",
        "zh-CN": "服务未返回可安装的 Skill 版本。",
      }),
    );
  const versionPath = `${skillsPath(id)}/versions/${encodeURIComponent(version)}`;
  const reply = await requestCatalog<{ skill_id: string; version: string; status: string }>(
    ctx,
    versionPath,
  );
  if (reply.data.skill_id !== id || reply.data.version !== version)
    invalidCatalogResponse(ctx, reply.request_id);
  if (reply.data.status !== "active")
    throw new BailianError(
      ctx.localize({
        "en-US": `Skill version ${version} is ${reply.data.status}.`,
        "zh-CN": `Skill 版本 ${version} 的状态为 ${reply.data.status}。`,
      }),
    );
  return { id, version, source: "cloud", description: skill.description, versionPath };
}
export async function unpackRevision(ctx: Context, revision: Revision, scratch: string) {
  let root = join(scratch, "package");
  mkdirSync(root);
  if (revision.source === "oss") {
    if (!revision.oss || !validName(revision.id))
      throw new BailianError("Invalid OSS Skill / OSS Skill 无效");
    if (revision.oss.compression && revision.oss.compression !== "tar.br")
      throw new BailianError(
        ctx.localize({
          "en-US": `Skill ${revision.id} uses unsupported compression format: ${revision.oss.compression}`,
          "zh-CN": `Skill ${revision.id} 使用了不支持的压缩格式：${revision.oss.compression}`,
        }),
      );
    await extractTarBr(await downloadSkillAsset(revision.id, revision.oss), root);
  } else {
    const signedUrl = async () => {
      const reply = await requestCatalog<{ skill_id: string; version: string; file_url: string }>(
        ctx,
        revision.versionPath + "/content",
      );
      if (
        reply.data.skill_id !== revision.id ||
        reply.data.version !== revision.version ||
        typeof reply.data.file_url !== "string"
      )
        invalidCatalogResponse(ctx, reply.request_id);
      return reply.data.file_url;
    };
    const bytes = await downloadSkillZip(await signedUrl(), ctx.settings.timeout).catch(
      async (error: unknown) => {
        if (error instanceof BailianError && error.api?.httpStatus === 403)
          return downloadSkillZip(await signedUrl(), ctx.settings.timeout);
        throw error;
      },
    );
    root = await extractSkillZip(bytes, root);
  }
  const meta = validateSkillDir(root, revision.id);
  const name = revision.source === "oss" ? revision.id : meta.name;
  if (!validName(name))
    throw new BailianError(
      ctx.localize({
        "en-US": "Invalid canonical skill name in package.",
        "zh-CN": "包内 Skill 安装名无效。",
      }),
    );
  const hash = computeDirContentHash(root);
  if (revision.oss?.contentHash?.startsWith("sha256:") && revision.oss.contentHash !== hash)
    throw new BailianError("Skill package checksum mismatch / Skill 包摘要不匹配");
  return { root, name, hash };
}
