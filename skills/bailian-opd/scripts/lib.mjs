// Shared utilities for the bailian-opd skill scripts.
// Bare Node (>=18.17), no dependencies: shells out to the installed `bl` CLI
// and parses its JSON contract. Attribution follows the bailian-protocol
// `script` template (caller type/name only; skill variables are omitted for
// script invocations per protocol).

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const EXIT = { ok: 0, blocked: 1, usage: 2, auth: 3, timeout: 5, network: 6 };

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

export function skillVersion() {
  try {
    const text = readFileSync(join(SCRIPT_DIR, "..", "SKILL.md"), "utf8");
    const match = text.match(/version:\s*"([^"]+)"/);
    return match ? match[1] : "unknown";
  } catch {
    return "unknown";
  }
}

export function usageError(message) {
  process.stderr.write(`${JSON.stringify({ error: { code: EXIT.usage, message } })}\n`);
  // Exit code 2 is the machine contract: usage errors must terminate the
  // standalone script before any network call.
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(EXIT.usage);
}

// Minimal flag parser: value flags consume the next token, switches are boolean,
// `repeatable` flags collect an array. Unknown flags are usage errors.
export function parseFlags(argv, spec) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) usageError(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    const rule = spec[name];
    if (!rule) usageError(`Unknown flag: --${name}`);
    if (rule.switch) {
      flags[name] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) usageError(`--${name} requires a value`);
    index += 1;
    if (rule.repeatable) {
      (flags[name] ??= []).push(value);
    } else {
      flags[name] = value;
    }
  }
  for (const [name, rule] of Object.entries(spec)) {
    if (rule.required && flags[name] === undefined) usageError(`--${name} is required`);
  }
  return flags;
}

// Resolve how to spawn bl. On Windows, Node >=18.20/20.12 refuses to spawn
// .cmd shims without a shell; resolve the real JS entry and spawn it with the
// current node executable instead (never shell:true with user-provided paths).
function resolveBlCommand() {
  const override = process.env.BAILIAN_BL_ENTRY;
  if (override) return { command: process.execPath, prefix: [override] };
  if (process.platform !== "win32") return { command: "bl", prefix: [] };
  const where = spawnSync("where", ["bl"], { encoding: "utf8" });
  const candidates = (where.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const candidate of candidates) {
    const entry = join(dirname(candidate), "node_modules", "bailian-cli", "dist", "bailian.mjs");
    if (existsSync(entry)) return { command: process.execPath, prefix: [entry] };
  }
  usageError(
    "Cannot resolve the bl JS entry on Windows. Set BAILIAN_BL_ENTRY to <npm-prefix>/node_modules/bailian-cli/dist/bailian.mjs and retry.",
  );
}

// Parse one JSON object document; undefined for empty / non-object / invalid.
function tryParseJson(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

// Run bl and parse its JSON contract: results on stdout (whole document first,
// else last JSON line), warnings/errors as JSON documents on stderr.
export function runBl(args, { callerName = "unknown", timeoutMs = 120_000 } = {}) {
  const { command, prefix } = resolveBlCommand();
  const result = spawnSync(command, [...prefix, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
    env: {
      ...process.env,
      NO_COLOR: "1",
      BAILIAN_CALLER_TYPE: "script",
      BAILIAN_CALLER_NAME: callerName,
    },
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  // bl --output json may emit one pretty-printed document (multi-line) or
  // JSON lines; try the whole stream first, then the last JSON line.
  let json = tryParseJson(stdout);
  if (json === undefined) {
    for (const line of stdout.split(/\r?\n/)) {
      const parsed = tryParseJson(line);
      if (parsed !== undefined) json = parsed;
    }
  }
  const warnings = [];
  let error;
  const stderrDocuments = [];
  const wholeStderr = tryParseJson(stderr);
  if (wholeStderr !== undefined) {
    stderrDocuments.push(wholeStderr);
  } else {
    for (const line of stderr.split(/\r?\n/)) {
      const parsed = tryParseJson(line);
      if (parsed !== undefined) stderrDocuments.push(parsed);
    }
  }
  for (const doc of stderrDocuments) {
    if (doc.warning) warnings.push(doc.warning);
    if (doc.error) error = doc.error;
  }
  const timedOut = result.error?.code === "ETIMEDOUT";
  return {
    exitCode: timedOut ? EXIT.timeout : (result.status ?? EXIT.network),
    timedOut,
    spawnError: result.error?.message,
    stdout,
    stderr,
    json,
    warnings,
    error,
  };
}

export function parseJsonObjectFile(filePath, label) {
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error) {
    usageError(`Cannot read ${label} file: ${filePath} (${error.code ?? error.message})`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    usageError(`${label} file is not valid JSON: ${filePath}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    usageError(`${label} file must contain a JSON object: ${filePath}`);
  }
  return parsed;
}

// Parse --hp key=value overrides with scalar type inference (numbers stay
// numbers; everything else stays a string — same convention as bl --hp).
export function parseHpOverrides(entries) {
  const overrides = {};
  for (const entry of entries ?? []) {
    const eq = entry.indexOf("=");
    if (eq <= 0) usageError(`--hp expects key=value, got: ${entry}`);
    const key = entry.slice(0, eq);
    const raw = entry.slice(eq + 1);
    const numeric = Number(raw);
    overrides[key] = raw !== "" && Number.isFinite(numeric) ? numeric : raw;
  }
  return overrides;
}

function numericField(source, key) {
  const value = Number(source[key]);
  return source[key] !== undefined && Number.isFinite(value) ? value : undefined;
}

// Dual capacity formulas (research-verified, mode-dependent):
//   external teacher Worker: student = (nnodes_training + nnodes_rollout) * n_gpus_training
//   internal teacher:        student = nnodes_training * n_gpus_training + nnodes_rollout * n_gpus_rollout
//   teacher GPUs = opd_teacher_nnodes * opd_teacher_num_replicas * opd_teacher_n_gpus_per_node
// Teacher mode has no public query API, so results are advisory only.
export function computeCapacity(hyperParameters) {
  const nnodesTraining = numericField(hyperParameters, "nnodes_training");
  const nnodesRollout = numericField(hyperParameters, "nnodes_rollout");
  const gpusTraining = numericField(hyperParameters, "n_gpus_training");
  const gpusRollout = numericField(hyperParameters, "n_gpus_rollout");
  const teacherNnodes = numericField(hyperParameters, "opd_teacher_nnodes");
  const teacherReplicas = numericField(hyperParameters, "opd_teacher_num_replicas");
  const teacherGpusPerNode = numericField(hyperParameters, "opd_teacher_n_gpus_per_node");
  const studentComplete =
    nnodesTraining !== undefined &&
    nnodesRollout !== undefined &&
    gpusTraining !== undefined &&
    gpusRollout !== undefined;
  const teacherComplete =
    teacherNnodes !== undefined &&
    teacherReplicas !== undefined &&
    teacherGpusPerNode !== undefined;
  const studentExternal = studentComplete
    ? (nnodesTraining + nnodesRollout) * gpusTraining
    : undefined;
  const studentInternal = studentComplete
    ? nnodesTraining * gpusTraining + nnodesRollout * gpusRollout
    : undefined;
  const teacherGpus = teacherComplete
    ? teacherNnodes * teacherReplicas * teacherGpusPerNode
    : undefined;
  return {
    complete: studentComplete && teacherComplete,
    studentComplete,
    teacherComplete,
    studentExternal,
    studentInternal,
    teacherGpus,
    totalExternal:
      studentExternal !== undefined && teacherGpus !== undefined
        ? studentExternal + teacherGpus
        : undefined,
    totalInternal:
      studentInternal !== undefined && teacherGpus !== undefined
        ? studentInternal + teacherGpus
        : undefined,
  };
}

// Batch-fit (mirrors the CLI gate): batch_size is the published samples-per-step;
// floor(samples × n_epochs / batch_size) = 0 trips the DLC assertion
// lr_decay_steps > 0 after the job is created and billed. The raw local count
// upper-bounds the post-preprocessing count, so a local shortfall is a sound
// hard reject; a surplus is not a guarantee (preprocessing filters).
export function computeBatchFit(hyperParameters, recordCount) {
  const batchSize = numericField(hyperParameters, "batch_size");
  const nEpochs = numericField(hyperParameters, "n_epochs");
  const fit = { batchSize, nEpochs, recordCount };
  if (batchSize !== undefined && batchSize > 0 && nEpochs !== undefined && nEpochs >= 1) {
    fit.requiredSamples = Math.ceil(batchSize / nEpochs);
    if (recordCount !== undefined) {
      fit.steps = Math.floor((recordCount * nEpochs) / batchSize);
    }
  }
  return fit;
}

// Published constraint: ppo_mini_batch_size ≤ batch_size × n_rollouts.
export function miniBatchLimit(hyperParameters) {
  const miniBatchSize = numericField(hyperParameters, "ppo_mini_batch_size");
  const batchSize = numericField(hyperParameters, "batch_size");
  const nRollouts = numericField(hyperParameters, "n_rollouts");
  if (miniBatchSize === undefined || batchSize === undefined || nRollouts === undefined) {
    return undefined;
  }
  return { miniBatchSize, limit: batchSize * nRollouts };
}

// Synchronous cross-platform sleep (no busy loop, no child process).
export function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function emitJson(document) {
  process.stdout.write(`${JSON.stringify(document)}\n`);
}

export function logLine(message) {
  process.stderr.write(`${message}\n`);
}
