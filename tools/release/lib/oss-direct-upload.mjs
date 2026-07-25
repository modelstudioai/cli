/**
 * Publish binary release assets to OSS entirely from the CI runner:
 * upload → HEAD-reconcile byte sizes → maintain release/manifest.json.
 * No external FC is involved anymore; CI is the single writer.
 *
 * Flow:
 *   - Every mode uploads its assets to `<prefix>/<tag>/<basename>` (channel
 *     builds include the rolling `channel-<name>/<name>.json`).
 *   - After upload, every object is HEAD-verified against the local byte size
 *     (reconciliation — the runner has the ground-truth artifacts on disk).
 *   - Stable only: when the tag is a NEWER version than manifest.latest
 *     (compareVersions), rewrite `<prefix>/manifest.json`. Channel/prerelease
 *     never touches it — same semantics the FC sync-release used to enforce.
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

/** Format now (or a given time) as an Asia/Shanghai +08:00 string. */
function toBeijing(input) {
  const d = input ? new Date(input) : new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}:${g("second")}+08:00`;
}

/**
 * Build the manifest.json contents. Public URLs always use the durable region
 * endpoint (never the acceleration endpoint used for uploads).
 */
function buildManifest(tag, releasedAt, assetNames, cfg) {
  const base = `https://${cfg.bucket}.${cfg.region}.aliyuncs.com/${cfg.prefix}/${tag}`;
  const assets = {};
  for (const name of [...assetNames].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    assets[name] = `${base}/${encodeURIComponent(name)}`;
  }
  return { latest: tag, releasedAt, assets };
}

/**
 * Signed OSS request (V1 header signature). Keys here are [A-Za-z0-9._/-] only,
 * so no URL encoding is needed and the signed resource matches the request path.
 */
async function ossRequest(method, key, { creds, cfg, body = null, contentType = "" }) {
  const date = new Date().toUTCString();
  const contentMd5 = body ? createHash("md5").update(body).digest("base64") : "";
  const canonical = `${method}\n${contentMd5}\n${contentType}\n${date}\n/${cfg.bucket}/${key}`;
  const signature = createHmac("sha1", creds.sk).update(canonical).digest("base64");
  const headers = { Date: date, Authorization: `OSS ${creds.ak}:${signature}` };
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

/** Remote object byte size; null when the object does not exist. */
async function headObjectSize(key, creds, cfg) {
  const res = await ossRequest("HEAD", key, { creds, cfg });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OSS HEAD ${key} failed: HTTP ${res.status}`);
  return Number(res.headers.get("content-length"));
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

  const jobs = plans.flatMap(({ tag, paths }) =>
    paths.map((path) => ({ path, key: `${cfg.prefix}/${tag}/${basename(path)}` })),
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

  // Bounded worker pool; collect failures, then throw once at the end.
  const failed = [];
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= jobs.length) return;
      const { path, key } = jobs[index];
      const startedAt = Date.now();
      try {
        const body = readFileSync(path);
        await putWithRetry({ creds, cfg, key, body, contentType: contentTypeFor(key) });
        process.stdout.write(
          `  [oss] ok ${key} (${(body.length / 1024 / 1024).toFixed(1)}MB, ${Date.now() - startedAt}ms)\n`,
        );
      } catch (err) {
        failed.push({ key, error: err.message });
        process.stdout.write(`  [oss] FAIL ${key}: ${err.message}\n`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, () => worker()));

  if (failed.length > 0) {
    throw new Error(
      `OSS upload failed for ${failed.length}/${jobs.length} object(s): ${failed
        .map((f) => f.key)
        .join(", ")}`,
    );
  }

  // Reconcile: every uploaded object must exist remotely with the local byte size.
  for (const { path, key } of jobs) {
    const remote = await headObjectSize(key, creds, cfg);
    const local = statSync(path).size;
    if (remote !== local) {
      throw new Error(
        `OSS reconcile mismatch for ${key}: local ${local}B vs remote ${remote ?? "missing"}`,
      );
    }
  }
  process.stdout.write(`reconcile ok: ${jobs.length}/${jobs.length} object(s) verified on OSS\n`);
  return { uploaded: jobs.length, skipped: false };
}

/**
 * Maintain `<prefix>/manifest.json` for STABLE releases only: rewrite it when
 * `tag` is a newer version than the current `latest` (first write included).
 * Same update rule the FC sync-release used to apply.
 *
 * @param {{ tag: string, assetNames: string[], dryRun?: boolean }} options
 * @returns {Promise<{ updated: boolean, latest: string | null }>}
 */
export async function maintainReleaseManifest({ tag, assetNames, dryRun = false }) {
  const ctx = ossContext();
  if (!ctx) {
    process.stdout.write("[info] BAILIAN_OSS_AK/SK unset; skip manifest.json maintenance\n");
    return { updated: false, latest: null };
  }
  const { creds, cfg } = ctx;
  const key = `${cfg.prefix}/manifest.json`;

  if (dryRun) {
    process.stdout.write(
      `[dry-run] manifest: GET oss://${cfg.bucket}/${key} → rewrite when ${tag} > latest (assets: ${assetNames.length})\n`,
    );
    return { updated: false, latest: null };
  }

  const current = await getObjectJson(key, creds, cfg);
  const currentLatest = typeof current?.latest === "string" ? current.latest : null;
  const newer = currentLatest == null || compareVersions(tag, currentLatest) > 0;
  if (!newer) {
    process.stdout.write(`manifest unchanged: latest=${currentLatest} is not older than ${tag}\n`);
    return { updated: false, latest: currentLatest };
  }

  const manifest = buildManifest(tag, toBeijing(), assetNames, cfg);
  await putObject({
    creds,
    cfg,
    key,
    body: Buffer.from(JSON.stringify(manifest, null, 2)),
    contentType: "application/json",
  });
  process.stdout.write(`manifest.json → latest=${tag} (was ${currentLatest ?? "none"})\n`);
  return { updated: true, latest: tag };
}
