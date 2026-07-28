/**
 * Publish binary release assets to OSS entirely from the CI runner:
 * upload → HEAD-reconcile byte sizes → maintain release/manifest.json.
 * No external FC is involved anymore; CI is the single writer.
 *
 * Flow:
 *   - Every mode uploads its assets to `<prefix>/<tag>/<basename>`; rolling
 *     channel manifests (`<channel>.json`) go to the prefix root (empty tag).
 *   - After upload, every object is HEAD-verified against the local byte size
 *     (reconciliation — the runner has the ground-truth artifacts on disk).
 *   - Stable only: when the tag is a NEWER version than the current manifest
 *     (compareVersions), rewrite `<prefix>/manifest.json` and the rolling
 *     `<prefix>/latest.json` — both carry the SAME rolling-manifest body
 *     written by binary-build.mjs, so manifest.json shares the channel
 *     `<channel>.json` shape. Channel/prerelease never touches either.
 *
 * Zero-dependency: OSS V1 header signature (HMAC-SHA1) over plain fetch.
 *
 * Gating / failure model:
 *   - BAILIAN_OSS_AK / BAILIAN_OSS_SK unset → warn + no-op (npm/GitHub publish
 *     still succeed; set the secrets to enable the OSS channel).
 *   - Once enabled, any upload/reconcile/manifest failure THROWS and fails the
 *     release step — re-running the workflow is idempotent (uploads overwrite).
 *
 * Environment variables (all injected from GitHub repo Settings → Secrets;
 * no OSS defaults are hardcoded in this repo):
 *   BAILIAN_OSS_AK / BAILIAN_OSS_SK —— RAM AccessKey; needs oss:PutObject and
 *                                      oss:GetObject on the release prefix
 *   BAILIAN_OSS_BUCKET / BAILIAN_OSS_REGION / BAILIAN_RELEASE_PREFIX
 *                                   —— required once the channel is enabled
 *   BAILIAN_STATIC_PREFIX           —— prefix for static files (changelogs, etc.);
 *                                      same bucket/creds, separate namespace
 *   BAILIAN_OSS_ENDPOINT            —— optional request endpoint override;
 *                                      public manifest URLs always use the
 *                                      region endpoint
 */
import { createHash, createHmac } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";

/**
 * Resolve the OSS context from the environment. Returns null when the channel
 * is disabled (no credentials). Throws when credentials are present but the
 * non-credential configuration is incomplete — a misconfigured release must
 * fail loudly instead of uploading to a guessed location.
 */
function ossContext() {
  const ak = process.env.BAILIAN_OSS_AK?.trim();
  const sk = process.env.BAILIAN_OSS_SK?.trim();
  if (!ak || !sk) return null;
  const cfg = {
    bucket: process.env.BAILIAN_OSS_BUCKET?.trim() || "",
    region: process.env.BAILIAN_OSS_REGION?.trim() || "",
    endpoint: process.env.BAILIAN_OSS_ENDPOINT?.trim() || "",
    prefix: process.env.BAILIAN_RELEASE_PREFIX?.trim() || "",
  };
  const missing = [
    ["BAILIAN_OSS_BUCKET", cfg.bucket],
    ["BAILIAN_OSS_REGION", cfg.region],
    ["BAILIAN_RELEASE_PREFIX", cfg.prefix],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`OSS channel misconfigured; missing env: ${missing.join(", ")}`);
  }
  return { creds: { ak, sk }, cfg };
}

/** Virtual-hosted-style request host: <bucket>.<endpoint-or-region>. */
function ossHost(cfg) {
  return `${cfg.bucket}.${cfg.endpoint || `${cfg.region}.aliyuncs.com`}`;
}

function contentTypeFor(name) {
  if (name.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (name.endsWith(".zip")) return "application/zip";
  if (name.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

/**
 * Compare two version strings (strip a leading v/V, split on `.`, numeric
 * per-segment; non-numeric / missing segments count as 0).
 * @returns {number} 1 if a>b, -1 if a<b, 0 if equal
 */
export function compareVersions(a, b) {
  const norm = (v) =>
    String(v ?? "")
      .trim()
      .replace(/^[vV]/, "")
      .split(".")
      .map((s) => parseInt(s, 10) || 0);
  const pa = norm(a);
  const pb = norm(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/**
 * Signed OSS request (V1 header signature). Keys here are [A-Za-z0-9._/-] only,
 * so no URL encoding is needed and the signed resource matches the request path.
 */
async function ossRequest(
  method,
  key,
  { creds, cfg, body = null, contentType = "", extraHeaders = {} },
) {
  const date = new Date().toUTCString();
  const contentMd5 = body ? createHash("md5").update(body).digest("base64") : "";
  const canonical = `${method}\n${contentMd5}\n${contentType}\n${date}\n/${cfg.bucket}/${key}`;
  const signature = createHmac("sha1", creds.sk).update(canonical).digest("base64");
  const headers = { Date: date, Authorization: `OSS ${creds.ak}:${signature}`, ...extraHeaders };
  if (contentType) headers["Content-Type"] = contentType;
  if (contentMd5) headers["Content-MD5"] = contentMd5;
  const options = { method, headers };
  if (body) options.body = body;
  return fetch(`https://${ossHost(cfg)}/${key}`, options);
}

async function putObject({ creds, cfg, key, body, contentType }) {
  const res = await ossRequest("PUT", key, { creds, cfg, body, contentType });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OSS PUT ${key} failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
}

/** PUT with exponential-backoff retries (runner → OSS can flake too). */
async function putWithRetry(params, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await putObject(params);
    } catch (err) {
      if (attempt >= attempts) throw err;
      const delay = 1000 * 2 ** (attempt - 1);
      process.stdout.write(
        `  [oss] retry ${attempt}/${attempts - 1} for ${params.key} in ${delay}ms (${err.message})\n`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Remote object byte size; null when the object does not exist.
 * Forces the identity encoding: for compressible types (e.g. JSON) OSS gzips
 * the transfer and undici then strips the content-length header, which would
 * otherwise read as a bogus size 0 here.
 */
async function headObjectSize(key, creds, cfg) {
  const res = await ossRequest("HEAD", key, {
    creds,
    cfg,
    extraHeaders: { "Accept-Encoding": "identity" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OSS HEAD ${key} failed: HTTP ${res.status}`);
  const length = res.headers.get("content-length");
  if (length == null) throw new Error(`OSS HEAD ${key} returned no content-length`);
  return Number(length);
}

/** GET + parse a JSON object; null when missing or corrupt. */
async function getObjectJson(key, creds, cfg) {
  const res = await ossRequest("GET", key, { creds, cfg });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OSS GET ${key} failed: HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Run async task factories with a bounded concurrency pool.
 * Returns results in the same order as the input tasks array.
 * (Same contract as packages/commands/src/commands/skill/shared.ts)
 *
 * @template T
 * @param {Array<() => Promise<T>>} tasks
 * @param {number} limit
 * @returns {Promise<T[]>}
 */
async function runWithConcurrency(tasks, limit) {
  const results = Array.from({ length: tasks.length });
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await tasks[currentIndex]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * HEAD-reconcile: verify every uploaded object exists remotely with the same
 * byte size as the local file. Runs HEAD requests concurrently.
 *
 * @param {Array<{ path: string, key: string }>} jobs
 * @param {{ ak: string, sk: string }} creds
 * @param {object} cfg
 * @param {string} label  Context for error messages (e.g. "release", "static-files")
 */
async function reconcileUploads(jobs, creds, cfg, label) {
  const results = await runWithConcurrency(
    jobs.map((job) => async () => {
      const remote = await headObjectSize(job.key, creds, cfg);
      const local = statSync(job.path).size;
      if (remote !== local) {
        return {
          ok: false,
          key: job.key,
          error: `OSS ${label} reconcile mismatch for ${job.key}: local ${local}B vs remote ${remote ?? "missing"}`,
        };
      }
      return { ok: true, key: job.key };
    }),
    4,
  );
  const mismatches = results.filter((result) => !result.ok);
  if (mismatches.length > 0) {
    throw new Error(mismatches.map((item) => item.error).join("\n"));
  }
  process.stdout.write(`${label} reconcile ok: ${jobs.length}/${jobs.length} object(s) verified\n`);
}

/**
 * Upload release assets to OSS under `<prefix>/<tag>/<basename>`, then
 * HEAD-reconcile every object against the local byte size.
 * Throws on any upload or reconcile failure (CI is the only writer now).
 *
 * @param {{
 *   plans: Array<{ tag: string, paths: string[] }>,
 *   dryRun?: boolean,
 * }} options `paths` may be bare basenames in dry-run planning mode.
 * @returns {Promise<{ uploaded: number, skipped: boolean }>}
 */
export async function mirrorReleaseAssetsToOss({ plans, dryRun = false }) {
  const ctx = ossContext();
  if (!ctx) {
    process.stdout.write(
      "\n[warn] BAILIAN_OSS_AK/SK unset; skip the OSS release channel entirely\n",
    );
    return { uploaded: 0, skipped: true };
  }
  const { creds, cfg } = ctx;

  // An empty tag means the object lives at the prefix root (rolling manifests).
  const jobs = plans.flatMap(({ tag, paths }) =>
    paths.map((path) => ({
      path,
      key: [cfg.prefix, tag, basename(path)].filter(Boolean).join("/"),
    })),
  );
  if (jobs.length === 0) return { uploaded: 0, skipped: true };

  process.stdout.write(
    `\n==> OSS upload: ${jobs.length} object(s) → ${cfg.bucket} (${cfg.endpoint || cfg.region})\n`,
  );

  if (dryRun) {
    for (const job of jobs) {
      process.stdout.write(`[dry-run] PUT oss://${cfg.bucket}/${job.key}\n`);
    }
    process.stdout.write(`[dry-run] reconcile (HEAD size check) ${jobs.length} object(s)\n`);
    return { uploaded: 0, skipped: false };
  }

  const results = await runWithConcurrency(
    jobs.map((job) => async () => {
      const startedAt = Date.now();
      try {
        const body = readFileSync(job.path);
        await putWithRetry({
          creds,
          cfg,
          key: job.key,
          body,
          contentType: contentTypeFor(job.key),
        });
        process.stdout.write(
          `  [oss] ok ${job.key} (${(body.length / 1024 / 1024).toFixed(1)}MB, ${Date.now() - startedAt}ms)\n`,
        );
        return { ok: true, key: job.key };
      } catch (error) {
        process.stdout.write(`  [oss] FAIL ${job.key}: ${error.message}\n`);
        return { ok: false, key: job.key, error: error.message };
      }
    }),
    4,
  );

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    throw new Error(
      `OSS upload failed for ${failed.length}/${jobs.length} object(s): ${failed
        .map((item) => item.key)
        .join(", ")}`,
    );
  }

  await reconcileUploads(jobs, creds, cfg, "release");
  return { uploaded: jobs.length, skipped: false };
}

/**
 * Maintain the STABLE pointers at the prefix root: rewrite `manifest.json`
 * and the rolling `latest.json` when `tag` is a newer version than the
 * current manifest (first write included). Both objects carry the SAME
 * rolling-manifest body produced by binary-build.mjs (`channelJsonPath`):
 * `{ name, channel, version, releasedAt, assets: { "<os>-<arch>": { file, sha256, inner } } }`
 * — identical in shape to the channel `<channel>.json` manifests.
 *
 * @param {{
 *   tag: string,
 *   channelJsonPath?: string | null,
 *   dryRun?: boolean,
 * }} options `channelJsonPath` is required outside dry-run.
 * @returns {Promise<{ updated: boolean, latest: string | null }>}
 */
export async function maintainReleaseManifest({ tag, channelJsonPath = null, dryRun = false }) {
  const ctx = ossContext();
  if (!ctx) {
    process.stdout.write("[info] BAILIAN_OSS_AK/SK unset; skip manifest.json maintenance\n");
    return { updated: false, latest: null };
  }
  const { creds, cfg } = ctx;
  const key = `${cfg.prefix}/manifest.json`;

  if (dryRun) {
    process.stdout.write(
      `[dry-run] manifest: GET oss://${cfg.bucket}/${key} → rewrite manifest.json + latest.json from ${channelJsonPath ?? "<rolling manifest>"} when ${tag} > latest\n`,
    );
    return { updated: false, latest: null };
  }
  if (!channelJsonPath) {
    throw new Error("maintainReleaseManifest requires channelJsonPath outside dry-run");
  }

  const current = await getObjectJson(key, creds, cfg);
  // Rolling-manifest shape carries `version`; fall back to the legacy
  // `{ latest }` pointer shape so the first migrated write still compares.
  const currentLatest =
    typeof current?.version === "string"
      ? current.version
      : typeof current?.latest === "string"
        ? current.latest
        : null;
  const newer = currentLatest == null || compareVersions(tag, currentLatest) > 0;
  if (!newer) {
    process.stdout.write(`manifest unchanged: latest=${currentLatest} is not older than ${tag}\n`);
    return { updated: false, latest: currentLatest };
  }

  const body = readFileSync(channelJsonPath);
  await putObject({ creds, cfg, key, body, contentType: "application/json" });
  process.stdout.write(`manifest.json → latest=${tag} (was ${currentLatest ?? "none"})\n`);
  await putObject({
    creds,
    cfg,
    key: `${cfg.prefix}/latest.json`,
    body,
    contentType: "application/json",
  });
  process.stdout.write(`latest.json → ${tag}\n`);
  return { updated: true, latest: tag };
}

/**
 * Resolve the OSS context for the static-files channel. Same bucket/creds as
 * the release channel but uses BAILIAN_STATIC_PREFIX instead of
 * BAILIAN_RELEASE_PREFIX. Returns null when credentials are absent (channel
 * disabled); throws when creds exist but required config is incomplete.
 */
function staticOssContext() {
  const ak = process.env.BAILIAN_OSS_AK?.trim();
  const sk = process.env.BAILIAN_OSS_SK?.trim();
  if (!ak || !sk) return null;
  const cfg = {
    bucket: process.env.BAILIAN_OSS_BUCKET?.trim() || "",
    region: process.env.BAILIAN_OSS_REGION?.trim() || "",
    endpoint: process.env.BAILIAN_OSS_ENDPOINT?.trim() || "",
    prefix: process.env.BAILIAN_STATIC_PREFIX?.trim() || "",
  };
  const missing = [
    ["BAILIAN_OSS_BUCKET", cfg.bucket],
    ["BAILIAN_OSS_REGION", cfg.region],
    ["BAILIAN_STATIC_PREFIX", cfg.prefix],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`OSS static-files channel misconfigured; missing env: ${missing.join(", ")}`);
  }
  return { creds: { ak, sk }, cfg };
}

/**
 * Sync a list of local files to OSS under `<BAILIAN_STATIC_PREFIX>/<basename>`.
 * Generic utility for any repo files that need to be mirrored to the static
 * prefix (changelogs today; docs, banners, etc. in the future).
 *
 * Gating: BAILIAN_OSS_AK/SK unset → warn + no-op. BAILIAN_STATIC_PREFIX unset
 * (with creds present) → throw (misconfiguration).
 *
 * @param {{
 *   filePaths: string[],
 *   dryRun?: boolean,
 * }} options
 * @returns {Promise<{ uploaded: number, skipped: boolean }>}
 */
export async function syncStaticFilesToOss({ filePaths, dryRun = false }) {
  const ctx = staticOssContext();
  if (!ctx) {
    process.stdout.write("\n[warn] BAILIAN_OSS_AK/SK unset; skip static-files sync to OSS\n");
    return { uploaded: 0, skipped: true };
  }
  const { creds, cfg } = ctx;

  const jobs = filePaths.map((path) => ({
    path,
    key: `${cfg.prefix}/${basename(path)}`,
  }));
  if (jobs.length === 0) return { uploaded: 0, skipped: true };

  process.stdout.write(
    `\n==> OSS static-files sync: ${jobs.length} file(s) → ${cfg.bucket}/${cfg.prefix}/\n`,
  );

  if (dryRun) {
    for (const job of jobs) {
      process.stdout.write(`[dry-run] PUT oss://${cfg.bucket}/${job.key}\n`);
    }
    return { uploaded: 0, skipped: false };
  }

  const results = await runWithConcurrency(
    jobs.map((job) => async () => {
      const startedAt = Date.now();
      try {
        const body = readFileSync(job.path);
        await putWithRetry({
          creds,
          cfg,
          key: job.key,
          body,
          contentType: contentTypeFor(job.key),
        });
        process.stdout.write(
          `  [oss] ok ${job.key} (${(body.length / 1024).toFixed(1)}KB, ${Date.now() - startedAt}ms)\n`,
        );
        return { ok: true, key: job.key };
      } catch (error) {
        process.stdout.write(`  [oss] FAIL ${job.key}: ${error.message}\n`);
        return { ok: false, key: job.key, error: error.message };
      }
    }),
    4,
  );

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    throw new Error(
      `OSS static-files sync failed for ${failed.length}/${jobs.length} file(s): ${failed
        .map((item) => item.key)
        .join(", ")}`,
    );
  }

  await reconcileUploads(jobs, creds, cfg, "static-files");
  return { uploaded: jobs.length, skipped: false };
}
