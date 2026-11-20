#!/usr/bin/env node
// bailian-opd preflight: read-only gate battery for an OPD distillation job.
// Aggregates ALL findings in one pass (does not abort on the first block) and
// emits a single JSON report. Nothing here mutates cloud state: the authorize
// call is a probe (never --authorize), params/dry-run are read-only, dataset
// validation is local. Uploads and creation happen only in opd-submit.mjs
// after explicit operator consent.
//
// Exit: 0 = all stages pass (warnings allowed) / 1 = any stage blocked / 2 = usage.

import { existsSync } from "node:fs";
import {
  EXIT,
  computeBatchFit,
  computeCapacity,
  emitJson,
  miniBatchLimit,
  parseFlags,
  parseHpOverrides,
  parseJsonObjectFile,
  runBl,
} from "./lib.mjs";

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
  "workspace-id": {},
  "caller-name": {},
  "skip-authorize": { switch: true },
});

const callerName = flags["caller-name"] ?? "unknown";
const stages = [];
const warnings = [];
const recommendations = [];

function addStage(name, status, detail, remediation) {
  stages.push({ name, status, detail, ...(remediation ? { remediation } : {}) });
}

// Assembly flags shared by the dry-run stage (mirrors bl finetune opd run).
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
if (flags["workspace-id"]) runArgs.push("--workspace-id", flags["workspace-id"]);

// Stage 1: local inputs.
const hyperParameters = flags["hyper-parameters-file"]
  ? parseJsonObjectFile(flags["hyper-parameters-file"], "--hyper-parameters-file")
  : {};
Object.assign(hyperParameters, parseHpOverrides(flags.hp));
const resourceConfig = flags["resource-config-file"]
  ? parseJsonObjectFile(flags["resource-config-file"], "--resource-config-file")
  : {};
if (flags["mtu-count"] !== undefined) resourceConfig.mtu_capacity = Number(flags["mtu-count"]);
if (flags["mtu-spec"] !== undefined) resourceConfig.mtu_spec_code = flags["mtu-spec"];
addStage("inputs", "pass", "Local files and overrides parsed.");

// Stage 2: dataset validation (local, no auth).
const datasetEntries = [
  ...flags.datasets.split(",").map((entry) => ({ field: "datasets", value: entry.trim() })),
  ...(flags.validations ?? "")
    .split(",")
    .filter(Boolean)
    .map((entry) => ({ field: "validations", value: entry.trim() })),
];
let datasetBlocked = false;
const datasetDetails = [];
let trainingRecordCount = 0;
let trainingCountKnown = true;
for (const { field, value } of datasetEntries) {
  if (!existsSync(value)) {
    if (field === "datasets") trainingCountKnown = false;
    datasetDetails.push(
      `${field}: ${value} treated as a file id (not a local path); skipped local validation`,
    );
    continue;
  }
  const result = runBl(
    [
      "dataset",
      "validate",
      "--file",
      value,
      "--schema",
      "chatml",
      "--full-validate",
      "--output",
      "json",
    ],
    { callerName },
  );
  const report = result.json;
  if (result.exitCode === EXIT.ok && report?.valid) {
    datasetDetails.push(`${field}: ${value} valid (${report.stats?.totalRecords ?? "?"} records)`);
    if (field === "datasets") {
      if (typeof report.stats?.totalRecords === "number") {
        trainingRecordCount += report.stats.totalRecords;
      } else {
        trainingCountKnown = false;
      }
    }
    for (const issue of report.warnings ?? []) {
      warnings.push({
        code: issue.code ?? "DATASET_WARNING",
        message: issue.message,
        source: "dataset-validate",
      });
    }
  } else {
    datasetBlocked = true;
    const issues = (report?.errors ?? [])
      .map((issue) => `line ${issue.line ?? "?"}: ${issue.message}`)
      .join("; ");
    datasetDetails.push(`${field}: ${value} INVALID${issues ? ` — ${issues}` : ""}`);
  }
}
addStage(
  "dataset-validate",
  datasetBlocked ? "blocked" : "pass",
  datasetDetails.join(" | "),
  datasetBlocked
    ? "Fix the dataset errors (chatml: messages[] with system/user content; rollout_extra passes through) and re-run preflight."
    : undefined,
);

// Stage 3: OPD authorize probe (Console auth; read-only, never enables).
if (flags["skip-authorize"]) {
  addStage(
    "authorize-probe",
    "skipped",
    "--skip-authorize was passed; OPD enablement was not verified.",
  );
  warnings.push({
    code: "AUTHORIZE_SKIPPED",
    message: "OPD enablement not verified; creation may be rejected by the account feature gate.",
    source: "preflight",
  });
} else {
  const result = runBl(["finetune", "opd", "authorize", "--yes", "--output", "json"], {
    callerName,
  });
  const report = result.json;
  if (result.exitCode === EXIT.auth) {
    addStage(
      "authorize-probe",
      "blocked",
      "Console login required for the OPD feature probe.",
      "Run: bl auth login --console",
    );
  } else if (!report || typeof report.ok !== "boolean") {
    addStage(
      "authorize-probe",
      "blocked",
      result.error?.message ?? result.stderr.trim() ?? "No authorize report returned.",
    );
  } else if (report.ok) {
    addStage(
      "authorize-probe",
      "pass",
      "All required OPD checks READY (whitelist, service role, business enablement).",
    );
  } else {
    const problems = (report.checks ?? [])
      .filter((check) => check.required && check.status !== "READY")
      .map((check) => `${check.name}: ${check.status}${check.detail ? ` (${check.detail})` : ""}`);
    const advisory = (report.checks ?? [])
      .filter((check) => !check.required && check.status === "REQUIRES_USER_ACTION")
      .map((check) => `${check.name}: ${check.detail ?? check.status}`);
    addStage(
      "authorize-probe",
      "blocked",
      problems.join("; ") || "OPD checks not ready.",
      "Complete the manual actions reported by bl finetune opd authorize (service roles are never auto-created).",
    );
    for (const line of advisory) {
      warnings.push({ code: "AUTHORIZE_ADVISORY", message: line, source: "authorize" });
    }
    const business = (report.checks ?? []).find((check) => check.name === "business-enabled");
    if (business?.status === "MISSING") {
      recommendations.push(
        "After explicit user confirmation, enable OPD inline: bl finetune opd authorize --authorize --yes (the preflight script never enables it).",
      );
    }
  }
}

// Stage 4: parameter schema probe (also surfaces workspace mismatch early).
const paramsBase = [
  "finetune",
  "opd",
  "params",
  "--base-model",
  flags["base-model"],
  "--output",
  "json",
];
if (flags["workspace-id"]) paramsBase.push("--workspace-id", flags["workspace-id"]);
// The resource schema query requires an MTU spec (empty array without one).
const effectiveMtuSpec = flags["mtu-spec"] ?? resourceConfig.mtu_spec_code;
let paramsBlocked = false;
const paramsDetails = [];
for (const paramType of ["hyper", "resource"]) {
  const args = [...paramsBase, "--param-type", paramType];
  if (paramType === "resource" && effectiveMtuSpec !== undefined)
    args.push("--mtu-spec-code", String(effectiveMtuSpec));
  const result = runBl(args, { callerName });
  const rows = result.json?.output?.hyper_params;
  if (result.exitCode !== EXIT.ok) {
    paramsBlocked = true;
    paramsDetails.push(
      `${paramType}: query failed — ${result.error?.message ?? result.stderr.trim()}`,
    );
  } else if (!Array.isArray(rows) || rows.length === 0) {
    paramsBlocked = true;
    paramsDetails.push(
      paramType === "resource" && effectiveMtuSpec === undefined
        ? "resource: empty schema — no MTU spec available (set --mtu-spec or resource_config.mtu_spec_code)"
        : `${paramType}: empty schema — student "${flags["base-model"]}" is not registered for pg_opd`,
    );
  } else {
    paramsDetails.push(`${paramType}: ${rows.length} parameter rows`);
  }
}
addStage(
  "params-probe",
  paramsBlocked ? "blocked" : "pass",
  paramsDetails.join(" | "),
  paramsBlocked
    ? "Verify the student model supports pg_opd and the workspace matches the API key (400/403 = mismatch). Never copy recommend_value into requests — it is not the teacher's effective default."
    : undefined,
);

// Stage 5: capacity advice (local, advisory only — teacher mode has no public API).
const capacity = computeCapacity(hyperParameters);
const declaredCapacity = Number(resourceConfig.mtu_capacity);
const capacityDetail = {
  ...capacity,
  declared: Number.isFinite(declaredCapacity) ? declaredCapacity : null,
};
if (!Number.isFinite(declaredCapacity)) {
  addStage("capacity-advice", "warn", "mtu_capacity not set; the CLI requires it before creation.");
} else if (capacity.complete) {
  const matches = [];
  if (capacity.totalExternal === declaredCapacity)
    matches.push(
      `external-teacher formula (${capacity.studentExternal} student + ${capacity.teacherGpus} teacher)`,
    );
  if (capacity.totalInternal === declaredCapacity)
    matches.push(
      `internal-teacher formula (${capacity.studentInternal} student + ${capacity.teacherGpus} teacher)`,
    );
  if (matches.length === 0) {
    addStage(
      "capacity-advice",
      "warn",
      `mtu_capacity=${declaredCapacity} matches neither layout interpretation: external needs ${capacity.totalExternal}, internal needs ${capacity.totalInternal}. The server checks capacity AFTER job creation — a mismatch wastes a billed job.`,
    );
    recommendations.push(
      `Set --mtu-count to ${capacity.totalExternal} (external teacher) or ${capacity.totalInternal} (internal teacher), or adjust the GPU layout, then re-run preflight and re-confirm.`,
    );
  } else {
    addStage(
      "capacity-advice",
      "pass",
      `mtu_capacity=${declaredCapacity} matches the ${matches.join(" / ")}.`,
    );
  }
} else {
  addStage(
    "capacity-advice",
    "warn",
    "Student layout and/or teacher resource fields are omitted; the server applies defaults. Published docs recommend MTU4 x 24 for the default layout (observed qwen3.5-9b default = 16 student GPUs; Flash teacher = 8, Max = 64). Verify mtu_capacity covers student + teacher GPUs.",
  );
}

// Stage 6: batch-fit (local; mirrors the CLI zero-step gate). batch_size is the
// published samples-per-step; 0 steps fails at execution time after billing.
const batchFit = computeBatchFit(
  hyperParameters,
  trainingCountKnown ? trainingRecordCount : undefined,
);
const miniBatch = miniBatchLimit(hyperParameters);
const batchFindings = [];
let batchStatus = "pass";
let batchRemediation;
if (miniBatch && miniBatch.miniBatchSize > miniBatch.limit) {
  batchStatus = "blocked";
  batchFindings.push(
    `ppo_mini_batch_size (${miniBatch.miniBatchSize}) exceeds batch_size × n_rollouts (${miniBatch.limit}).`,
  );
  batchRemediation =
    "Lower ppo_mini_batch_size to at most batch_size × n_rollouts, then re-run preflight.";
}
if (batchFit.requiredSamples === undefined) {
  batchFindings.push(
    "batch_size / n_epochs not both explicit; per-step sample count is resolved by the server.",
  );
} else if (batchFit.recordCount === undefined) {
  if (batchStatus !== "blocked") batchStatus = "warn";
  batchFindings.push(
    `Sample count unknown (file-id datasets); with batch_size=${batchFit.batchSize} and n_epochs=${batchFit.nEpochs}, training needs at least ${batchFit.requiredSamples} effective samples for one step.`,
  );
  warnings.push({
    code: "OPD_BATCH_FIT_UNKNOWN",
    message: `Dataset sample count is unknown; verify at least ${batchFit.requiredSamples} effective samples (batch_size=${batchFit.batchSize}, n_epochs=${batchFit.nEpochs}).`,
    source: "preflight",
  });
} else if (batchFit.steps === 0) {
  batchStatus = "blocked";
  batchFindings.push(
    `${batchFit.recordCount} samples with n_epochs=${batchFit.nEpochs} and batch_size=${batchFit.batchSize} (samples per step) yield 0 training steps; the job would fail at execution time (lr_decay_steps > 0) after billing starts.`,
  );
  batchRemediation = `Provide at least ${batchFit.requiredSamples} samples (preprocessing may filter some, so leave headroom), or lower batch_size / raise n_epochs, then re-run preflight and re-confirm.`;
} else {
  batchFindings.push(
    `${batchFit.recordCount} samples → ${batchFit.steps} training step(s) (batch_size=${batchFit.batchSize}, n_epochs=${batchFit.nEpochs}).`,
  );
  const warmupSteps = Number(hyperParameters.lr_warmup_steps);
  if (
    hyperParameters.lr_warmup_steps !== undefined &&
    Number.isFinite(warmupSteps) &&
    warmupSteps >= 0 &&
    warmupSteps > batchFit.steps
  ) {
    if (batchStatus !== "blocked") batchStatus = "warn";
    warnings.push({
      code: "OPD_WARMUP_EXCEEDS_STEPS",
      message: `lr_warmup_steps (${warmupSteps}) exceeds the estimated total training steps (${batchFit.steps}); the docs recommend 0 for small-data smoke runs.`,
      source: "preflight",
    });
  }
  const intervalKeys = ["eval_steps", "save_steps"].filter((key) => {
    if (key === "save_steps" && hyperParameters.save_strategy === "epoch") return false;
    const value = Number(hyperParameters[key]);
    return hyperParameters[key] !== undefined && Number.isFinite(value) && value > batchFit.steps;
  });
  if (intervalKeys.length > 0) {
    if (batchStatus !== "blocked") batchStatus = "warn";
    warnings.push({
      code: "OPD_INTERVAL_EXCEEDS_STEPS",
      message: `${intervalKeys.join(" / ")} exceeds the estimated total training steps (${batchFit.steps}); evaluation / checkpoint saving would never trigger. Docs suggest eval_steps ≈ total steps / 10~20, save_steps ≈ eval_steps × 2~3.`,
      source: "preflight",
    });
  }
}
addStage("batch-fit", batchStatus, batchFindings.join(" "), batchRemediation);

// Stage 7: integrated dry-run (zero network) — the consent artifact.
let bodyPreview;
let pendingUploads;
const dryRun = runBl([...runArgs, "--dry-run", "--output", "json"], { callerName });
for (const warning of dryRun.warnings) {
  warnings.push({ ...warning, source: "cli" });
}
if (dryRun.exitCode === EXIT.ok && dryRun.json?.body) {
  bodyPreview = dryRun.json.body;
  pendingUploads = dryRun.json.pending_uploads;
  addStage("run-dry-run", "pass", "Request body assembled; CLI local guards passed.");
} else {
  addStage(
    "run-dry-run",
    "blocked",
    dryRun.error?.message ?? dryRun.stderr.trim() ?? "Dry-run failed.",
    "Fix the reported usage/guard error and re-run preflight.",
  );
}

const ok = !stages.some((stage) => stage.status === "blocked");
emitJson({
  ok,
  stages,
  warnings,
  capacity: capacityDetail,
  batch_fit: batchFit,
  ...(bodyPreview ? { body_preview: bodyPreview } : {}),
  ...(pendingUploads ? { pending_uploads: pendingUploads } : {}),
  recommendations,
});
process.exit(ok ? EXIT.ok : EXIT.blocked);
