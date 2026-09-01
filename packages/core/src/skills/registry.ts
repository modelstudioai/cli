import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { withRetry } from "../utils/retry.ts";
import type { SkillIndexEntry, SkillsIndex } from "./types.ts";

/**
 * Skill registry client: public-read OSS, pure HTTPS GET, zero credentials (usable with auth: "none").
 * Defaults to the skills/ prefix of the bailian-wiki bucket; override with BAILIAN_SKILL_REGISTRY_URL
 * for canary/private mirror scenarios.
 */
const DEFAULT_REGISTRY_BASE_URL = "https://bailian-wiki.oss-cn-hangzhou.aliyuncs.com/skills";

const INDEX_TIMEOUT_MS = 30_000;
const ASSET_TIMEOUT_MS = 120_000;
/** Interactive channels retry transient failures; silent background channels pass 1 to fail fast */
const DEFAULT_ATTEMPTS = 3;

export function getSkillRegistryBaseUrl(): string {
  const override = process.env.BAILIAN_SKILL_REGISTRY_URL?.trim();
  return (override || DEFAULT_REGISTRY_BASE_URL).replace(/\/+$/, "");
}

/**
 * Fetch the remote skill index. No local caching — the diff comparison is always
 * "live remote index vs local skill-lock.json".
 * Silent background channels (advisor sync) may pass a tighter timeout and attempts=1
 * than the interactive defaults.
 */
export async function fetchSkillsIndex(
  timeoutMs: number = INDEX_TIMEOUT_MS,
  attempts: number = DEFAULT_ATTEMPTS,
): Promise<SkillsIndex> {
  return withRetry(
    async () => {
      const url = `${getSkillRegistryBaseUrl()}/index.json`;
      let res: Response;
      try {
        res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
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
      return index;
    },
    { attempts },
  );
}

/**
 * Strict shape check for entry.object (defense against a hostile/corrupted index —
 * anything not matching falls back to the legacy fixed key, never into the URL path).
 */
const OBJECT_FILE_RE = /^sha256-[0-9a-f]{64}\.tar\.br$/;

/** Resolve which file to download for a skill: content-addressed object, else legacy fixed key */
export function resolveAssetFileName(entry?: SkillIndexEntry): string {
  const object = entry?.object;
  return object && OBJECT_FILE_RE.test(object) ? object : "skill.tar.br";
}

/** Download the tar.br archive for a single skill (one skill = one GET) */
export async function downloadSkillAsset(
  name: string,
  entry?: SkillIndexEntry,
  attempts: number = DEFAULT_ATTEMPTS,
): Promise<Buffer> {
  return withRetry(
    async () => {
      const url = `${getSkillRegistryBaseUrl()}/${name}/${resolveAssetFileName(entry)}`;
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
    },
    { attempts },
  );
}
