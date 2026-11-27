#!/usr/bin/env node
// bailian-opd wait: poll an OPD job to a terminal state with single probes
// (bl finetune opd watch, no --follow — stdout stays one final JSON document;
// status changes go to stderr). On SUCCEEDED it lists checkpoints; on
// FAILED/CANCELED it extracts the server failure message and a triage hint.
//
// Exit: 0 SUCCEEDED / 1 FAILED or CANCELED / 5 poll timeout (job NOT canceled)
//       / 3 auth / 6 network (read-only polling is safe to re-run).

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { EXIT, emitJson, logLine, parseFlags, runBl, sleepSync } from "./lib.mjs";

const TERMINAL = ["SUCCEEDED", "FAILED", "CANCELED"];
const CAPACITY_PATTERN =
  /requires\s+(\d+)\s+student GPUs\s*\+\s*(\d+)\s+teacher GPUs.*?capacity is\s+(\d+)/i;

export function waitForJob({
  jobId,
  workspaceId,
  callerName = "unknown",
  intervalSec = 30,
  pollTimeoutSec = 3600,
}) {
  const workspaceArgs = workspaceId ? ["--workspace-id", workspaceId] : [];
  const deadline = Date.now() + pollTimeoutSec * 1000;
  let lastStatus;
  for (;;) {
    const probe = runBl(
      ["finetune", "opd", "watch", "--job-id", jobId, "--output", "json", ...workspaceArgs],
      { callerName },
    );
    if (probe.exitCode === EXIT.auth || probe.exitCode === EXIT.network) {
      return {
        ok: false,
        exitCode: probe.exitCode,
        job_id: jobId,
        error: probe.error?.message ?? probe.stderr.trim(),
      };
    }
    const status = probe.json?.status;
    if (!status) {
      return {
        ok: false,
        exitCode: EXIT.blocked,
        job_id: jobId,
        error: probe.error?.message ?? "No job status returned.",
      };
    }
    if (status !== lastStatus) {
      logLine(`[opd-wait] ${jobId}: ${status}`);
      lastStatus = status;
    }
    if (probe.json?.terminal === true || TERMINAL.includes(status)) {
      if (status === "SUCCEEDED") {
        const checkpoints = runBl(
          ["finetune", "checkpoints", "--job-id", jobId, "--output", "json"],
          { callerName },
        );
        return {
          ok: true,
          exitCode: EXIT.ok,
          job_id: jobId,
          status,
          artifacts: checkpoints.json ?? null,
        };
      }
      const detail = runBl(
        ["finetune", "opd", "get", "--job-id", jobId, "--output", "json", ...workspaceArgs],
        { callerName },
      );
      const failureMessage = detail.json?.output?.message ?? detail.json?.data?.message ?? null;
      let triageHint;
      const capacityMatch =
        typeof failureMessage === "string" ? failureMessage.match(CAPACITY_PATTERN) : null;
      if (capacityMatch) {
        const needed = Number(capacityMatch[1]) + Number(capacityMatch[2]);
        triageHint = `Capacity mismatch: the server needs ${capacityMatch[1]} student + ${capacityMatch[2]} teacher = ${needed} GPUs, but mtu_capacity was ${capacityMatch[3]}. Adjust --mtu-count or the GPU layout, re-run preflight, re-confirm with the user, and submit as a NEW job (never blind-retry).`;
      }
      return {
        ok: false,
        exitCode: EXIT.blocked,
        job_id: jobId,
        status,
        failure_message: failureMessage,
        ...(triageHint ? { triage_hint: triageHint } : {}),
      };
    }
    if (Date.now() >= deadline) {
      return {
        ok: false,
        exitCode: EXIT.timeout,
        job_id: jobId,
        status,
        note: "Poll timeout — the cloud job was NOT canceled and may still succeed.",
        resume_command: `node scripts/opd-wait.mjs --job-id ${jobId}${workspaceId ? ` --workspace-id ${workspaceId}` : ""}`,
      };
    }
    sleepSync(intervalSec * 1000);
  }
}

// CLI entry (skipped when imported by opd-submit.mjs). argv[1] is normalized
// with realpathSync: skill installs are symlinks, and Node's ESM loader resolves
// import.meta.url to the real path — comparing the raw argv path would silently
// skip the entry under a symlinked invocation.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const flags = parseFlags(process.argv.slice(2), {
    "job-id": { required: true },
    interval: {},
    "poll-timeout": {},
    "workspace-id": {},
    "caller-name": {},
  });
  const intervalSec = flags.interval !== undefined ? Number(flags.interval) : 30;
  const pollTimeoutSec = flags["poll-timeout"] !== undefined ? Number(flags["poll-timeout"]) : 3600;
  if (!Number.isFinite(intervalSec) || intervalSec < 1) {
    emitJson({ ok: false, error: "--interval must be a number >= 1 second" });
    process.exit(EXIT.usage);
  }
  const result = waitForJob({
    jobId: flags["job-id"],
    workspaceId: flags["workspace-id"],
    callerName: flags["caller-name"] ?? "unknown",
    intervalSec,
    pollTimeoutSec: Number.isFinite(pollTimeoutSec) ? pollTimeoutSec : 3600,
  });
  emitJson(result);
  process.exit(result.exitCode);
}
