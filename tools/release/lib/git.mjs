import { runCapture, tryRun, run } from "./proc.mjs";

export function headSha7() {
  return runCapture("git", ["rev-parse", "--short=7", "HEAD"]);
}

export function currentBranch() {
  // GitHub Actions checks out a detached HEAD; `git rev-parse --abbrev-ref HEAD`
  // returns "HEAD" there, so prefer GITHUB_REF_NAME when running in CI.
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  return runCapture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
}

export function isWorkingTreeClean() {
  return runCapture("git", ["status", "--porcelain"]) === "";
}

export function tagExists(tag, { remote = "origin" } = {}) {
  // local
  if (tryRun("git", ["rev-parse", "--verify", `refs/tags/${tag}`]).status === 0) return true;
  // remote — actions/checkout fetch-depth:0 usually fetches tags, but ls-remote
  // is the only authoritative source.
  const r = tryRun("git", ["ls-remote", "--tags", remote, `refs/tags/${tag}`]);
  return r.status === 0 && r.stdout !== "";
}

export function createTag(tag) {
  // Lightweight tag: just a ref pointing at HEAD. No tagger identity needed,
  // so the workflow doesn't need `git config user.name/email`.
  run("git", ["tag", tag]);
}

export function pushTag(tag, remote = "origin") {
  run("git", ["push", remote, tag]);
}

/** UTC stamp for channel beta versions: `YYYYMMDDHHMM` (minute resolution). */
export function utcDateStamp() {
  return runCapture("date", ["-u", "+%Y%m%d%H%M"]);
}
