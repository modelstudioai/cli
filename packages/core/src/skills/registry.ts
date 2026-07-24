import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import type { SkillsIndex } from "./types.ts";

/**
 * Skill registry client: public-read OSS, pure HTTPS GET, zero credentials (usable with auth: "none").
 * Defaults to the skills/ prefix of the bailian-wiki bucket; override with BAILIAN_SKILL_REGISTRY_URL
 * for canary/private mirror scenarios.
 */
const DEFAULT_REGISTRY_BASE_URL = "https://bailian-wiki.oss-cn-hangzhou.aliyuncs.com/skills";
/** index.json protocol version supported by this client */
const SUPPORTED_INDEX_VERSION = 1;

const INDEX_TIMEOUT_MS = 10_000;
const ASSET_TIMEOUT_MS = 120_000;

export function getSkillRegistryBaseUrl(): string {
  const override = process.env.BAILIAN_SKILL_REGISTRY_URL?.trim();
  return (override || DEFAULT_REGISTRY_BASE_URL).replace(/\/+$/, "");
}

/**
 * Fetch the remote skill index. No local caching — the diff comparison is always
 * "live remote index vs local skill-lock.json".
 */
export async function fetchSkillsIndex(): Promise<SkillsIndex> {
  const url = `${getSkillRegistryBaseUrl()}/index.json`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(INDEX_TIMEOUT_MS) });
  } catch (err) {
    throw new BailianError(
      `Cannot access skill registry: ${url}`,
      ExitCode.NETWORK,
      "Check network connectivity; if using a private mirror, verify BAILIAN_SKILL_REGISTRY_URL configuration",
      { cause: err },
    );
  }
  if (!res.ok) {
    throw new BailianError(
      `Skill registry returned HTTP ${res.status}: ${url}`,
      ExitCode.NETWORK,
      res.status === 404
        ? "Skill index not yet published or registry URL is incorrect; confirm the publisher has generated index.json"
        : "Remote error, retry later",
    );
  }
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch (err) {
    throw new BailianError(
      "Skill index index.json is not valid JSON",
      ExitCode.GENERAL,
      "Remote may be in the middle of publishing, retry later",
      { cause: err },
    );
  }
  const index = parsed as SkillsIndex;
  if (
    typeof index !== "object" ||
    index === null ||
    typeof index.skills !== "object" ||
    index.skills === null
  ) {
    throw new BailianError(
      "Skill index index.json has invalid structure",
      ExitCode.GENERAL,
      "Retry later or contact the publisher",
    );
  }
  if (index.version !== SUPPORTED_INDEX_VERSION) {
    throw new BailianError(
      `Skill index protocol version ${index.version} is not supported by this CLI`,
      ExitCode.GENERAL,
      "Upgrade bailian-cli to the latest version and retry",
    );
  }
  return index;
}

/** Download the tar.br archive for a single skill (one skill = one GET) */
export async function downloadSkillAsset(name: string): Promise<Buffer> {
  const url = `${getSkillRegistryBaseUrl()}/${name}/skill.tar.br`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(ASSET_TIMEOUT_MS) });
  } catch (err) {
    throw new BailianError(
      `Failed to download skill ${name}: ${url}`,
      ExitCode.NETWORK,
      "Network error, retryable",
      {
        cause: err,
      },
    );
  }
  if (!res.ok) {
    throw new BailianError(
      `Failed to download skill ${name}: HTTP ${res.status}`,
      ExitCode.NETWORK,
      res.status === 404
        ? "index.json and skill object are temporarily inconsistent (publishing in progress), retry later"
        : "Remote error, retry later",
    );
  }
  return Buffer.from(await res.arrayBuffer());
}
