/**
 * RL / OPD config assembly: merge CLI params + optional YAML into one SDK spec,
 * then serialize a task-local YAML with all filesystem paths rewritten.
 *
 * Merge priority:
 *   accepted defaults < YAML < explicit CLI params.
 * `--set` is applied last as a top-level shallow override (SDK `init(**kwargs)`).
 */

import { basename, join } from "node:path";
import { parse, stringify } from "yaml";
import { UsageError } from "../../errors/base.ts";
import {
  parseAssignment,
  parseDottedAssignment,
  parseJsonValue,
  parseNumericValue,
  parseTypedValue,
} from "./params.ts";
import type {
  IResolvedTrainingSpec,
  RlDataset,
  RlFunction,
  RlJobSpec,
  RlRunParams,
  RlTaskPaths,
} from "./types.ts";

const DEFAULT_ROLLOUT_NAME = "rollout-1";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Recursive plain-object merge; arrays and scalars are replaced, not joined. */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const [key, sourceValue] of Object.entries(source)) {
    const targetValue = result[key];
    result[key] =
      isPlainObject(targetValue) && isPlainObject(sourceValue)
        ? deepMerge(targetValue, sourceValue)
        : sourceValue;
  }
  return result;
}

/** Parse the optional `--config` YAML document into a spec (empty when absent). */
export function parseJobYaml(yamlText: string): RlJobSpec {
  let parsed: unknown;
  try {
    parsed = parse(yamlText);
  } catch (error) {
    throw new UsageError(
      "Invalid --config YAML.",
      error instanceof Error ? error.message : undefined,
    );
  }
  if (parsed === null || parsed === undefined) return {};
  if (!isPlainObject(parsed)) {
    throw new UsageError("Invalid --config YAML.", "Expected a mapping at the document root.");
  }
  return parsed as RlJobSpec;
}

function functionList(spec: RlJobSpec): RlFunction[] {
  spec.functions ??= [];
  return spec.functions;
}

/** Find a function by name, or create it with the given type. */
function upsertFunction(spec: RlJobSpec, name: string, type: string): RlFunction {
  const functions = functionList(spec);
  let found = functions.find((existing) => existing.name === name);
  if (!found) {
    found = { type, name };
    functions.push(found);
  }
  return found;
}

/** Find an existing function by name; modifiers require it to be defined. */
function requireFunction(spec: RlJobSpec, name: string, flag: string): RlFunction {
  const found = functionList(spec).find((existing) => existing.name === name);
  if (!found) {
    throw new UsageError(
      `Unknown function name "${name}" in ${flag}.`,
      "Define the function first via --rollout / --reward or in --config.",
    );
  }
  return found;
}

/** Replace one dataset sublist (training/validation) independently. */
function replaceDatasets(spec: RlJobSpec, type: string, entries: RlDataset[]): void {
  const kept = (spec.datasets ?? []).filter((dataset) => dataset.type !== type);
  spec.datasets = [...kept, ...entries];
}

function buildDatasetEntries(
  type: string,
  files: string[] | undefined,
  fileIds: string[] | undefined,
): RlDataset[] {
  const entries: RlDataset[] = [];
  for (const file of files ?? []) {
    entries.push({ type, data_source_type: "file_id", file_name: file });
  }
  for (const fileId of fileIds ?? []) {
    entries.push({ type, data_source_type: "file_id", file_id: fileId });
  }
  return entries;
}

/**
 * Merge CLI params over an optional YAML document into a single SDK spec.
 * Enforces model presence and the RL/OPD type constraints.
 */
export function resolveTrainingSpec(params: RlRunParams, yamlText?: string): IResolvedTrainingSpec {
  const spec: RlJobSpec = yamlText ? parseJobYaml(yamlText) : {};

  // --- functions: clear, then create rollout/rewards, then apply modifiers ---
  if (params.clearFunctions) spec.functions = [];

  if (params.rollout) {
    const functions = functionList(spec);
    const rollout =
      functions.find((existing) => existing.type === "rollout") ??
      upsertFunction(spec, DEFAULT_ROLLOUT_NAME, "rollout");
    rollout.type = "rollout";
    rollout.fcmodel = { ...rollout.fcmodel, classpath: params.rollout };
  }

  for (const entry of params.rewards ?? []) {
    const { key, value } = parseAssignment(entry, "--reward", "--reward <name=classpath>");
    const reward = upsertFunction(spec, key, "reward");
    reward.type = "reward";
    reward.fcmodel = { ...reward.fcmodel, classpath: value };
  }

  // code-dir / requirements apply to every function package.
  if (params.codeDir !== undefined || params.requirements !== undefined) {
    for (const fn of functionList(spec)) {
      fn.fcmodel ??= {};
      if (params.codeDir !== undefined) fn.fcmodel.zipdir = params.codeDir;
      if (params.requirements !== undefined) fn.fcmodel.requirements_path = params.requirements;
    }
  }

  for (const entry of params.functionTimeouts ?? []) {
    const { key, value } = parseAssignment(
      entry,
      "--function-timeout",
      "--function-timeout <name=sec>",
    );
    requireFunction(spec, key, "--function-timeout").timeout = parseNumericValue(
      value,
      "--function-timeout",
    );
  }

  for (const entry of params.rewardWeights ?? []) {
    const { key, value } = parseAssignment(entry, "--reward-weight", "--reward-weight <name=num>");
    requireFunction(spec, key, "--reward-weight").weight = parseNumericValue(
      value,
      "--reward-weight",
    );
  }

  for (const entry of params.rewardMetrics ?? []) {
    const { name, field, value } = parseDottedAssignment(
      entry,
      "--reward-metric",
      "--reward-metric <name.metric=num>",
    );
    const fn = requireFunction(spec, name, "--reward-metric");
    fn.reward_metric_weight ??= {};
    fn.reward_metric_weight[field] = parseNumericValue(value, "--reward-metric");
  }

  for (const entry of params.functionRuntime ?? []) {
    const { name, field, value } = parseDottedAssignment(
      entry,
      "--function-runtime",
      "--function-runtime <name.field=value>",
    );
    const fn = requireFunction(spec, name, "--function-runtime");
    fn.runtime = deepMerge(fn.runtime ?? {}, { [field]: parseTypedValue(value) });
  }

  for (const entry of params.functionEnv ?? []) {
    const { name, field, value } = parseDottedAssignment(
      entry,
      "--function-env",
      "--function-env <name.KEY=value>",
    );
    const fn = requireFunction(spec, name, "--function-env");
    fn.runtime ??= {};
    fn.runtime.env ??= {};
    fn.runtime.env[field] = value;
  }

  // --- datasets: training and validation replaced independently ---
  const trainingEntries = buildDatasetEntries("training", params.trainFiles, params.trainFileIds);
  if (trainingEntries.length > 0) replaceDatasets(spec, "training", trainingEntries);
  const validationEntries = buildDatasetEntries(
    "validation",
    params.validationFiles,
    params.validationFileIds,
  );
  if (validationEntries.length > 0) replaceDatasets(spec, "validation", validationEntries);

  // --- scalar fields ---
  if (params.model !== undefined) spec.model = { ...spec.model, name: params.model };
  if (params.name !== undefined) spec.name = params.name;
  if (params.teacherModel !== undefined) spec.teacher_model = params.teacherModel;

  // --- training.hyper_parameters: deep merge, never whole-block replace ---
  if (params.hp && params.hp.length > 0) {
    const hyperParameters: Record<string, unknown> = {};
    for (const entry of params.hp) {
      const { key, value } = parseAssignment(entry, "--hp", "--hp <key=value>");
      hyperParameters[key] = parseTypedValue(value);
    }
    spec.training ??= {};
    spec.training.hyper_parameters = deepMerge(
      spec.training.hyper_parameters ?? {},
      hyperParameters,
    );
  }

  // --- training.resources ---
  if (
    params.chargeType !== undefined ||
    params.mtuSpec !== undefined ||
    params.mtuCount !== undefined ||
    params.instanceId !== undefined
  ) {
    spec.training ??= {};
    const resources = { ...spec.training.resources };
    if (params.chargeType !== undefined) resources.charge_type = params.chargeType;
    if (params.mtuSpec !== undefined) resources.mtu_spec_code = params.mtuSpec;
    if (params.mtuCount !== undefined) resources.mtu_capacity = params.mtuCount;
    if (params.instanceId !== undefined) resources.instance_id = params.instanceId;
    spec.training.resources = resources;
  }

  // --- bailian metadata: packaging rules consumed by the snapshot layer ---
  if (
    params.codeDir !== undefined ||
    params.requirements !== undefined ||
    params.include !== undefined ||
    params.exclude !== undefined
  ) {
    const bailian = spec.bailian ?? {};
    if (params.codeDir !== undefined) bailian.code_dir = params.codeDir;
    if (params.requirements !== undefined) bailian.requirements = params.requirements;
    if (params.include !== undefined || params.exclude !== undefined) {
      bailian.package = {
        ...bailian.package,
        ...(params.include !== undefined ? { include: params.include } : {}),
        ...(params.exclude !== undefined ? { exclude: params.exclude } : {}),
      };
    }
    spec.bailian = bailian;
  }

  // --- --set: top-level shallow override, applied last (highest priority) ---
  for (const entry of params.set ?? []) {
    const { key, value } = parseAssignment(entry, "--set", "--set <key=value>");
    spec[key] = parseJsonValue(value);
  }

  // --- type constraints + required fields ---
  const isOpd = params.opd === true;
  spec.training ??= {};
  if (isOpd) {
    spec.training.type = "pg_opd";
    if (!spec.teacher_model) {
      throw new UsageError("OPD requires a teacher model.", "Pass --teacher-model <id>.");
    }
  } else {
    if (spec.teacher_model) {
      throw new UsageError(
        "teacher_model is only valid for OPD jobs.",
        "Remove --teacher-model, or use the OPD run command.",
      );
    }
    if (!spec.training.type) spec.training.type = "reinforcement";
  }

  if (!spec.model?.name) {
    throw new UsageError(
      "A base model is required.",
      "Pass --model <id> or set model.name in --config.",
    );
  }

  return {
    spec,
    hasFunctions: (spec.functions?.length ?? 0) > 0,
    isOpd,
  };
}

/**
 * Serialize the task-local YAML handed to the SDK: strip the `bailian` namespace
 * and rewrite every filesystem reference into the task directory. `classpath`
 * and `requirements_path` stay relative to the package root and are untouched.
 */
export function buildTaskYaml(spec: RlJobSpec, paths: RlTaskPaths): string {
  const clone = structuredClone(spec);
  delete clone.bailian;

  for (const fn of clone.functions ?? []) {
    if (fn.fcmodel) fn.fcmodel.zipdir = paths.deployCopyDir;
  }
  for (const dataset of clone.datasets ?? []) {
    if (dataset.file_name) dataset.file_name = join(paths.dataDir, basename(dataset.file_name));
  }

  return stringify(clone);
}
