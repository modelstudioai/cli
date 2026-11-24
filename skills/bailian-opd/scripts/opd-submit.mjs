#!/usr/bin/env node
// bailian-opd submit: create an OPD job ONLY after explicit operator consent
// (--confirmed). Never retries a failed/timed-out create — a timeout does not
// mean the server rejected the job (it may have persisted it and returned 500),
// so on failure it runs a duplicate-creation guard against the shared job list
// and reports possibly-created jobs instead of resubmitting.
//
// Exit: 0 created (or SUCCEEDED with --wait) / 1 failed or unknown / 2 usage or
//       missing consent (checked before any network call).

import { EXIT, emitJson, parseFlags, runBl, usageError } from "./lib.mjs";
import { waitForJob } from "./opd-wait.mjs";

const flags = parseFlags(process.argv.slice(2), {
  "base-model": { required: true },
  "teacher-model": { required: true },
  datasets: { required: true },
  validations: {},
  "hyper-parameters-file": {},
  "resource-config-file": {},
  hp: { repeatable: true },
  "mtu-spec": {},
  "mtu-count": {},
  "charge-type": {},
  "job-name": {},
  "workspace-id": {},
  "caller-name": {},
  confirmed: { switch: true },
  wait: { switch: true },
  "poll-timeout": {},
});

// Consent gate: before any spawn. The calling agent must have presented the
// preflight body_preview, all warnings, and the billing scope, and obtained
// explicit user confirmation. Never pass --confirmed automatically.
if (!flags.confirmed) {
  usageError(
    "Operator consent required: run opd-preflight.mjs, present the report (body, warnings, billing scope) to the user, and re-run with --confirmed only after explicit confirmation.",
  );
}

const callerName = flags["caller-name"] ?? "unknown";
const runArgs = [
  "finetune",
  "opd",
  "run",
  "--base-model",
  flags["base-model"],
  "--teacher-model",
  flags["teacher-model"],
  "--datasets",
  flags.datasets,
];
if (flags.validations) runArgs.push("--validations", flags.validations);
if (flags["hyper-parameters-file"])
  runArgs.push("--hyper-parameters-file", flags["hyper-parameters-file"]);
if (flags["resource-config-file"])
  runArgs.push("--resource-config-file", flags["resource-config-file"]);
for (const entry of flags.hp ?? []) runArgs.push("--hp", entry);
if (flags["mtu-spec"]) runArgs.push("--mtu-spec", flags["mtu-spec"]);
if (flags["mtu-count"]) runArgs.push("--mtu-count", flags["mtu-count"]);
if (flags["charge-type"]) runArgs.push("--charge-type", flags["charge-type"]);
if (flags["job-name"]) runArgs.push("--job-name", flags["job-name"]);
if (flags["workspace-id"]) runArgs.push("--workspace-id", flags["workspace-id"]);

// Uploads of local paths happen inside this confirmed run. No --watch here:
// monitoring is delegated to waitForJob so stdout stays a single JSON document.
const created = runBl([...runArgs, "--yes", "--output", "json"], {
  callerName,
  timeoutMs: 300_000,
});
const jobId = created.json?.output?.job_id ?? created.json?.data?.job_id;

if (created.exitCode === EXIT.ok && jobId) {
  const result = {
    ok: true,
    job_id: jobId,
    status: created.json?.output?.status ?? created.json?.data?.status ?? "PENDING",
  };
  if (flags.wait) {
    const pollTimeoutSec =
      flags["poll-timeout"] !== undefined ? Number(flags["poll-timeout"]) : 3600;
    const waited = waitForJob({
      jobId,
      workspaceId: flags["workspace-id"],
      callerName,
      pollTimeoutSec: Number.isFinite(pollTimeoutSec) ? pollTimeoutSec : 3600,
    });
    emitJson({ ...result, monitor: waited });
    process.exit(
      waited.exitCode === EXIT.timeout ? EXIT.timeout : waited.ok ? EXIT.ok : EXIT.blocked,
    );
  }
  result.next = `node scripts/opd-wait.mjs --job-id ${jobId}${flags["workspace-id"] ? ` --workspace-id ${flags["workspace-id"]}` : ""}`;
  emitJson(result);
  process.exit(EXIT.ok);
}

// Create failed or timed out. NEVER retry the create. Check whether the server
// persisted a job anyway (500-after-persist / timeout). The shared list is
// newest-first; match pg_opd records for this student, then compare teachers.
const failureMessage =
  created.error?.message ??
  (created.timedOut ? "Create request timed out." : created.stderr.trim() || "Create failed.");
const duplicateCheck = { performed: false, candidates: [], conclusion: "unknown" };
const list = runBl(["finetune", "list", "--page-size", "20", "--output", "json"], { callerName });
if (list.exitCode === EXIT.ok && Array.isArray(list.json?.items)) {
  duplicateCheck.performed = true;
  const recent = list.json.items.filter(
    (item) => item.training_type === "pg_opd" && item.base_model === flags["base-model"],
  );
  for (const item of recent) {
    const detail = runBl(
      [
        "finetune",
        "opd",
        "get",
        "--job-id",
        item.job_id,
        "--output",
        "json",
        ...(flags["workspace-id"] ? ["--workspace-id", flags["workspace-id"]] : []),
      ],
      { callerName },
    );
    const teacher = detail.json?.output?.teacher_model ?? detail.json?.data?.teacher_model;
    if (teacher === flags["teacher-model"]) {
      duplicateCheck.candidates.push({
        job_id: item.job_id,
        status: item.status,
        created_at: item.created_at,
        teacher_model: teacher,
      });
    }
  }
  duplicateCheck.conclusion =
    duplicateCheck.candidates.length > 0 ? "possibly_created" : "not_found";
}

const result = {
  ok: false,
  error: failureMessage,
  duplicate_check: duplicateCheck,
  next:
    duplicateCheck.conclusion === "possibly_created"
      ? `A matching job may already exist — attach to it instead of resubmitting: node scripts/opd-wait.mjs --job-id ${duplicateCheck.candidates[0].job_id}`
      : duplicateCheck.conclusion === "not_found"
        ? "No matching job found in the recent list. Fix the reported error, re-run preflight, re-confirm with the user, then submit again."
        : "Could not verify whether a job was created (list query failed). STOP and report the uncertainty to the user; check bl finetune list manually before any resubmission.",
};
emitJson(result);
process.exit(EXIT.blocked);
