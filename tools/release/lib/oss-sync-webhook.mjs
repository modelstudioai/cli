/**
 * Optional hook for an external FC that mirrors GitHub Releases → OSS.
 * Set BAILIAN_OSS_SYNC_WEBHOOK to an HTTP endpoint; unset → no-op.
 * Failure is warn-only — Release publish already succeeded.
 */
import { tryRun } from "./proc.mjs";
import { GITHUB_REPOSITORY } from "./gh-release.mjs";

/**
 * @param {{
 *   version: string,
 *   mode: "stable" | "channel",
 *   channel: string | null,
 *   dryRun?: boolean,
 *   repo?: string,
 * }} options
 */
export function notifyOssSyncWebhook({
  version,
  mode,
  channel,
  dryRun = false,
  repo = GITHUB_REPOSITORY,
}) {
  const webhook = process.env.BAILIAN_OSS_SYNC_WEBHOOK?.trim();
  if (!webhook) {
    process.stdout.write(
      "\n[info] BAILIAN_OSS_SYNC_WEBHOOK unset; skip notifying external OSS sync FC\n",
    );
    return;
  }
  const tag = `v${version}`;
  const body = {
    repo,
    mode,
    channel,
    version,
    tag,
    rollingChannelTag: mode === "channel" ? `channel-${channel}` : null,
  };
  if (dryRun) {
    process.stdout.write(`[dry-run] POST ${webhook}\n${JSON.stringify(body, null, 2)}\n`);
    return;
  }
  process.stdout.write(`\n==> notify OSS sync FC: ${webhook}\n`);
  const result = tryRun("curl", [
    "-fsS",
    "-X",
    "POST",
    "-H",
    "Content-Type: application/json",
    "-d",
    JSON.stringify(body),
    webhook,
  ]);
  if (result.status !== 0) {
    process.stdout.write(
      `[warn] OSS sync webhook failed (release already published): ${result.stderr || result.stdout}\n`,
    );
    return;
  }
  if (result.stdout) process.stdout.write(`${result.stdout}\n`);
}
