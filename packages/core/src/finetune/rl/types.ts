/**
 * RL / OPD training spec types.
 *
 * Mirrors the DashScope SDK `job.yaml` shape (snake_case preserved verbatim —
 * the SDK owns these field names). CLI-only metadata lives under the `bailian`
 * namespace and is stripped before the spec is handed to the SDK.
 */

/** FC runtime sizing + env for a single function component. */
export interface RlFunctionRuntime {
  cpu?: number;
  memory_size?: number;
  disk_size?: number;
  concurrency?: number;
  capacity?: number;
  min_capacity?: number;
  max_capacity?: number;
  memory_scale_threshold?: number;
  concurrency_scale_threshold?: number;
  env?: Record<string, string>;
  [key: string]: unknown;
}

/** Upload package descriptor for a function component. */
export interface RlFcModel {
  /** Source root uploaded as the function package; rewritten to deploy-copy. */
  zipdir?: string;
  /** Python entry class, relative to zipdir; never rewritten. */
  classpath?: string;
  /** Requirements path relative to the package root; kept as-is. */
  requirements_path?: string;
  [key: string]: unknown;
}

/** A rollout / reward function component. */
export interface RlFunction {
  type?: string;
  name?: string;
  timeout?: number;
  weight?: number;
  reward_metric_weight?: Record<string, number>;
  fcmodel?: RlFcModel;
  runtime?: RlFunctionRuntime;
  [key: string]: unknown;
}

/** A training / validation dataset entry. */
export interface RlDataset {
  type?: string;
  data_source_type?: string;
  /** Local file path; rewritten into the task data dir before submission. */
  file_name?: string;
  /** Reuse an already-uploaded file; mutually exclusive with a local upload. */
  file_id?: string;
  [key: string]: unknown;
}

export interface RlModel {
  name?: string;
  [key: string]: unknown;
}

export interface RlResources {
  charge_type?: string;
  mtu_spec_code?: string;
  mtu_capacity?: number;
  instance_id?: string;
  [key: string]: unknown;
}

export interface RlTraining {
  type?: string;
  hyper_parameters?: Record<string, unknown>;
  resources?: RlResources;
  [key: string]: unknown;
}

/** CLI-only metadata; stripped before handing the spec to the SDK. */
export interface RlBailianMeta {
  schema_version?: number;
  profile?: string;
  code_dir?: string;
  requirements?: string;
  package?: { include?: string[]; exclude?: string[] };
  execution?: { watch?: boolean; timeout?: number };
  /** Secret references only (env var names); never plaintext credentials. */
  function_secret_env?: Record<string, string>;
  [key: string]: unknown;
}

/** The full job.yaml document (SDK fields + bailian namespace). */
export interface RlJobSpec {
  name?: string;
  model?: RlModel;
  /** OPD teacher model; forbidden for plain RL. */
  teacher_model?: string;
  functions?: RlFunction[];
  datasets?: RlDataset[];
  training?: RlTraining;
  observability?: Record<string, unknown>;
  bailian?: RlBailianMeta;
  [key: string]: unknown;
}

/**
 * Parsed CLI business params fed into {@link resolveTrainingSpec}.
 *
 * The command layer maps raw flags into this shape; core stays free of any
 * runtime flag-parsing dependency. Repeatable flags arrive as string arrays
 * in the original `KEY=VALUE` / `name.field=value` syntax.
 */
export interface RlRunParams {
  name?: string;
  model?: string;
  teacherModel?: string;
  trainFiles?: string[];
  trainFileIds?: string[];
  validationFiles?: string[];
  validationFileIds?: string[];
  codeDir?: string;
  requirements?: string;
  include?: string[];
  exclude?: string[];
  /** Single rollout classpath. */
  rollout?: string;
  /** Repeatable `name=classpath`. */
  rewards?: string[];
  clearFunctions?: boolean;
  /** Repeatable `name=sec`. */
  functionTimeouts?: string[];
  /** Repeatable `name.field=value`. */
  functionRuntime?: string[];
  /** Repeatable `name=num`. */
  rewardWeights?: string[];
  /** Repeatable `name.metric=num`. */
  rewardMetrics?: string[];
  /** Repeatable `name.KEY=value`. */
  functionEnv?: string[];
  /** Repeatable `key=value`, parsed by type. */
  hp?: string[];
  chargeType?: string;
  mtuSpec?: string;
  mtuCount?: number;
  instanceId?: string;
  /** Repeatable `key=value`, top-level shallow override (SDK init(**kwargs)). */
  set?: string[];
  /** Force OPD mode: training.type=pg_opd + teacher_model required. */
  opd?: boolean;
}

/** Task-directory paths needed to rewrite filesystem references in the YAML. */
export interface RlTaskPaths {
  /** Writable source copy the SDK packages (zipdir target). */
  deployCopyDir: string;
  /** Staged training/validation data (file_name target). */
  dataDir: string;
}

/** Result of {@link resolveTrainingSpec}: merged spec + assembly diagnostics. */
export interface IResolvedTrainingSpec {
  spec: RlJobSpec;
  /** Whether any function component (rollout/reward) is present. */
  hasFunctions: boolean;
  /** Whether this is an OPD job (pg_opd + teacher_model). */
  isOpd: boolean;
}
