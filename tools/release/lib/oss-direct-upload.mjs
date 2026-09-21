/**
 * Publish binary release assets to OSS through the FC release channel:
 * the runner no longer holds any OSS credentials. Flow:
 *
 *   release-prepare  → FC verifies the GitHub OIDC token, whitelist-checks the
 *                      keys and returns presigned OSS PUT URLs (30 min expiry)
 *   direct PUT       → the runner uploads each artifact straight to OSS
 *                      (the runner→OSS path proven stable by the old design)
 *   release-finalize → FC HEAD-reconciles every object against the local byte
 *                      size and, for stable releases, maintains
 *                      `<prefix>/manifest.json` + `<prefix>/latest.json`
 *                      behind the same newer-version guard as before
 *
 * The FC side lives in the bailian-docs-llm-wiki-crawl function
 * (release-prepare / release-finalize actions); OSS access there uses the
 * function role's STS credentials, so no AK/SK exists in this repo or in
 * GitHub Secrets anymore.
 *
 * Gating / failure model:
 *   - FC_TRIGGER_URL unset → warn + no-op (npm/GitHub publish still succeed).
 *     The URL is the shared repo variable also used by publish-skills (same
 *     FC function; actions are routed by URL path), so the channel is ON
 *     whenever the FC function is reachable — deploy the FC release flows
 *     before merging release tooling changes.
 *   - Enabled but no OIDC token available → THROW (misconfigured CI must fail
 *     loudly instead of silently skipping the OSS mirror).
 *   - Any prepare/upload/finalize failure THROWS and fails the release step —
 *     re-running the workflow is idempotent (uploads overwrite).
 *
 * Environment variables:
 *   FC_TRIGGER_URL       —— FC HTTP trigger base URL (repo Settings → Variables)
 *   FC_RELEASE_AUDIENCE  —— OIDC audience requested from GitHub and verified
 *                           by FC (must match FC-side RELEASE_OIDC_AUD)
 *   ACTIONS_ID_TOKEN_REQUEST_TOKEN / ACTIONS_ID_TOKEN_REQUEST_URL
 *                          —— injected by GitHub Actions when the job has
 *                             `permissions: id-token: write`
 */
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";

/**
 * Resolve the FC release channel context; null when the channel is disabled.
 * Reuses the shared FC_TRIGGER_URL (the same function already serves
 * publish-skills; actions are routed by URL path).
 */
function fcContext() {
  const triggerUrl = process.env.FC_TRIGGER_URL?.trim();
  if (!triggerUrl) return null;
  return {
    triggerUrl: triggerUrl.replace(/\/+$/, ""),
    audience: process.env.FC_RELEASE_AUDIENCE?.trim() || "",
  };
}

function contentTypeFor(name) {
  if (name.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (name.endsWith(".tar.gz") || name.endsWith(".tgz")) return "application/gzip";
  if (name.endsWith(".zip")) return "application/zip";
  if (name.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

/**
 * Fetch a GitHub Actions OIDC token for this job. Requires
 * `permissions: id-token: write` on the calling job; throws when the channel
 * is enabled but no token can be obtained (CI misconfiguration).
 */
async function fetchOidcToken(audience) {
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  if (!requestToken || !requestUrl) {
    throw new Error(
      "FC release channel enabled but no OIDC token available; " +
        "ensure the workflow job declares `permissions: id-token: write`",
    );
  }
  const separator = requestUrl.includes("?") ? "&" : "?";
  const url = audience
    ? `${requestUrl}${separator}audience=${encodeURIComponent(audience)}`
    : requestUrl;
  const res = await fetch(url, { headers: { Authorization: `bearer ${requestToken}` } });
  if (!res.ok) {
    throw new Error(`GitHub OIDC token request failed: HTTP ${res.status}`);
  }
  const body = await res.json();
  if (typeof body?.value !== "string" || !body.value) {
    throw new Error("GitHub OIDC token request returned no token value");
  }
  return body.value;
}

/**
 * Call an FC release action with the OIDC token. Retries transient network
 * failures; throws on HTTP errors and on `success: false` responses
 * (FC returns structured errors, e.g. OIDC verification failures).
 */
async function fcCall(ctx, action, payload, token, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${ctx.triggerUrl}/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120_000),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        const reason = body?.error || `HTTP ${res.status}`;
        throw new Error(
          `FC ${action} failed: ${reason}${body?.status ? ` (status ${body.status})` : ""}`,
        );
      }
      return body;
    } catch (error) {
      // Structured FC errors (auth/whitelist/reconcile) are final; only retry
      // raw network failures, which surface as TypeError "fetch failed".
      const isNetworkError =
        error instanceof TypeError || /fetch failed|timeout/i.test(error.message);
      if (attempt >= attempts || !isNetworkError) throw error;
      const delay = 1000 * 2 ** (attempt - 1);
      process.stdout.write(
        `  [fc] retry ${attempt}/${attempts - 1} for ${action} in ${delay}ms (${error.message})\n`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Run async task factories with a bounded concurrency pool.
 * Returns results in the same order as the input tasks array.
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

/** PUT a local file to a presigned URL with exponential-backoff retries. */
async function putWithRetry({ putUrl, contentType, body }, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      // Only Content-Type was signed by FC; sending extra canonical headers
      // (e.g. Content-MD5) would break the OSS signature.
      const res = await fetch(putUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body,
        signal: AbortSignal.timeout(600_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
      }
      return;
    } catch (error) {
      if (attempt >= attempts) throw error;
      const delay = 1000 * 2 ** (attempt - 1);
      process.stdout.write(
        `  [oss] retry ${attempt}/${attempts - 1} in ${delay}ms (${error.message})\n`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Shared upload pipeline for release assets and static files:
 * prepare (presign) → direct PUT → finalize (FC-side HEAD reconcile).
 *
 * @param {{
 *   ctx: { triggerUrl: string, audience: string },
 *   prefix: "release" | "static",
 *   jobs: Array<{ path: string, tag: string, name: string }>,
 *   label: string,
 * }} params
 */
async function uploadViaFc({ ctx, prefix, jobs, label }) {
  const token = await fetchOidcToken(ctx.audience);
  const prepare = await fcCall(
    ctx,
    "release-prepare",
    {
      files: jobs.map((job) => ({
        prefix,
        tag: job.tag,
        name: job.name,
        contentType: contentTypeFor(job.name),
      })),
    },
    token,
  );
  const uploads = prepare.uploads ?? [];
  if (uploads.length !== jobs.length) {
    throw new Error(
      `FC release-prepare returned ${uploads.length} URL(s) for ${jobs.length} file(s)`,
    );
  }

  const results = await runWithConcurrency(
    jobs.map((job, index) => async () => {
      const startedAt = Date.now();
      try {
        const body = readFileSync(job.path);
        await putWithRetry({
          putUrl: uploads[index].putUrl,
          contentType: uploads[index].contentType,
          body,
        });
        process.stdout.write(
          `  [oss] ok ${uploads[index].key} (${(body.length / 1024 / 1024).toFixed(1)}MB, ${Date.now() - startedAt}ms)\n`,
        );
        return { ok: true, key: uploads[index].key };
      } catch (error) {
        process.stdout.write(`  [oss] FAIL ${uploads[index].key}: ${error.message}\n`);
        return { ok: false, key: uploads[index].key, error: error.message };
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

  // HEAD byte-size reconciliation now happens FC-side (it holds the only OSS
  // credentials); the runner reports local sizes as ground truth.
  await fcCall(
    ctx,
    "release-finalize",
    {
      files: jobs.map((job, index) => ({ key: uploads[index].key, size: statSync(job.path).size })),
    },
    token,
  );
  process.stdout.write(
    `${label} reconcile ok: ${jobs.length}/${jobs.length} object(s) verified by FC\n`,
  );
}

/**
 * Upload release assets to OSS under `<release-prefix>/<tag>/<basename>` via
 * the FC channel. Throws on any prepare/upload/finalize failure.
 *
 * @param {{
 *   plans: Array<{ tag: string, paths: string[] }>,
 *   dryRun?: boolean,
 * }} options `paths` may be bare basenames in dry-run planning mode.
 * @returns {Promise<{ uploaded: number, skipped: boolean }>}
 */
export async function mirrorReleaseAssetsToOss({ plans, dryRun = false }) {
  const ctx = fcContext();
  if (!ctx) {
    process.stdout.write("\n[warn] FC_TRIGGER_URL unset; skip the OSS release channel entirely\n");
    return { uploaded: 0, skipped: true };
  }

  // An empty tag means the object lives at the prefix root (rolling manifests).
  const jobs = plans.flatMap(({ tag, paths }) =>
    paths.map((path) => ({ path, tag, name: basename(path) })),
  );
  if (jobs.length === 0) return { uploaded: 0, skipped: true };

  process.stdout.write(`\n==> OSS upload via FC: ${jobs.length} object(s) → ${ctx.triggerUrl}\n`);

  if (dryRun) {
    for (const job of jobs) {
      process.stdout.write(
        `[dry-run] presign+PUT <release>/${[job.tag, job.name].filter(Boolean).join("/")}\n`,
      );
    }
    process.stdout.write(`[dry-run] finalize (FC HEAD size reconcile) ${jobs.length} object(s)\n`);
    return { uploaded: 0, skipped: false };
  }

  await uploadViaFc({ ctx, prefix: "release", jobs, label: "release" });
  return { uploaded: jobs.length, skipped: false };
}

/**
 * Maintain the STABLE pointers at the prefix root: FC rewrites
 * `manifest.json` and the rolling `latest.json` when `tag` is a newer version
 * than the current manifest (newer-version guard lives FC-side now).
 *
 * @param {{
 *   tag: string,
 *   channelJsonPath?: string | null,
 *   dryRun?: boolean,
 * }} options `channelJsonPath` is required outside dry-run.
 * @returns {Promise<{ updated: boolean, latest: string | null }>}
 */
export async function maintainReleaseManifest({ tag, channelJsonPath = null, dryRun = false }) {
  const ctx = fcContext();
  if (!ctx) {
    process.stdout.write("[info] FC_TRIGGER_URL unset; skip manifest.json maintenance\n");
    return { updated: false, latest: null };
  }

  if (dryRun) {
    process.stdout.write(
      `[dry-run] manifest: FC release-finalize rewrites manifest.json + latest.json from ${channelJsonPath ?? "<rolling manifest>"} when ${tag} > latest\n`,
    );
    return { updated: false, latest: null };
  }
  if (!channelJsonPath) {
    throw new Error("maintainReleaseManifest requires channelJsonPath outside dry-run");
  }

  const body = JSON.parse(readFileSync(channelJsonPath, "utf-8"));
  const token = await fetchOidcToken(ctx.audience);
  const result = await fcCall(
    ctx,
    "release-finalize",
    { files: [], manifest: { tag, body } },
    token,
  );
  if (result.manifestUpdated) {
    process.stdout.write(`manifest.json → latest=${result.latest ?? tag}\n`);
    process.stdout.write(`latest.json → ${result.latest ?? tag}\n`);
  } else {
    process.stdout.write(`manifest unchanged: latest=${result.latest} is not older than ${tag}\n`);
  }
  return { updated: Boolean(result.manifestUpdated), latest: result.latest ?? null };
}

/**
 * Sync a list of local files to OSS under `<static-prefix>/<basename>` via
 * the FC channel. Generic utility for any repo files that need to be mirrored
 * to the static prefix (changelogs today; docs, banners, etc. in the future).
 *
 * Gating: FC_TRIGGER_URL unset → warn + no-op.
 *
 * @param {{
 *   filePaths: string[],
 *   dryRun?: boolean,
 * }} options
 * @returns {Promise<{ uploaded: number, skipped: boolean }>}
 */
export async function syncStaticFilesToOss({ filePaths, dryRun = false }) {
  const ctx = fcContext();
  if (!ctx) {
    process.stdout.write("\n[warn] FC_TRIGGER_URL unset; skip static-files sync to OSS\n");
    return { uploaded: 0, skipped: true };
  }

  const jobs = filePaths.map((path) => ({ path, tag: "", name: basename(path) }));
  if (jobs.length === 0) return { uploaded: 0, skipped: true };

  process.stdout.write(
    `\n==> OSS static-files sync via FC: ${jobs.length} file(s) → ${ctx.triggerUrl}\n`,
  );

  if (dryRun) {
    for (const job of jobs) {
      process.stdout.write(`[dry-run] presign+PUT <static>/${job.name}\n`);
    }
    return { uploaded: 0, skipped: false };
  }

  await uploadViaFc({ ctx, prefix: "static", jobs, label: "static-files" });
  return { uploaded: jobs.length, skipped: false };
}
