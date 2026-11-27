import type { ConsoleCall } from "../console/gateway.ts";
import { unwrapResponse } from "../console/models.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

/**
 * Console (zelda) API listing the dynamic train options configured per model.
 * Requires a Console login session — anonymous calls are rejected. Models
 * without dynamic train options are simply absent from the response.
 */
export const MODEL_TRAIN_OPTIONS_API =
  "zeldaHttp.dashscopeFinetune./zelda/api/v1/finetune/model-train-options";

export interface TrainOptionDefinition {
  name?: string;
  supportValues?: string[];
  required?: boolean;
  editable?: boolean;
  recommendValue?: string;
  [key: string]: unknown;
}

export interface ModelTrainOptions {
  enabled?: boolean;
  optionKeys?: string[];
  optionDefinitions?: TrainOptionDefinition[];
  defaults?: Record<string, string>;
  supportedCombinations?: Array<Record<string, string>>;
  [key: string]: unknown;
}

/**
 * Fetch the dynamic train options for one model + server-side training type.
 * Returns null when the model has no dynamic options (absent from the list or
 * `enabled !== true`), so callers never need a hardcoded model allowlist.
 */
export async function fetchModelTrainOptions(
  call: ConsoleCall,
  model: string,
  serverTrainingType: string,
): Promise<ModelTrainOptions | null> {
  const result = await call(MODEL_TRAIN_OPTIONS_API, {
    input: { models: [model], trainingType: serverTrainingType },
  });
  const unwrapped = unwrapResponse(result as Record<string, unknown>);
  // unwrapResponse returns the inner `data`, which is the per-model entries
  // array for this API (its `data` explicitly null when nothing is configured);
  // tolerate an object wrapper as well. Any other shape is reported rather than
  // read as "no dynamic options".
  const unexpectedShape = () =>
    new BailianError(
      `Console API ${MODEL_TRAIN_OPTIONS_API} returned an unexpected response shape.`,
      ExitCode.GENERAL,
      undefined,
      { rawResponse: JSON.stringify(result).slice(0, 500) },
    );
  let entries: Array<Record<string, unknown>>;
  if (Array.isArray(unwrapped)) {
    entries = unwrapped as Array<Record<string, unknown>>;
  } else if (
    unwrapped &&
    typeof unwrapped === "object" &&
    "data" in unwrapped &&
    (unwrapped.data === null || Array.isArray(unwrapped.data))
  ) {
    entries = (unwrapped.data ?? []) as Array<Record<string, unknown>>;
  } else {
    throw unexpectedShape();
  }
  const match = entries.find((entry) => entry.model === model);
  const options = match?.trainingOptions as ModelTrainOptions | undefined;
  return options?.enabled === true ? options : null;
}

export type TrainOptionsIssueCode = "not_configured" | "unsupported_value" | "invalid_combination";

export interface TrainOptionsIssue {
  code: TrainOptionsIssueCode;
  key?: string;
  value?: string;
  expected?: string[];
  combinations?: Array<Record<string, string>>;
}

/**
 * Validate user-supplied train options against the console configuration and
 * complete omitted options from `defaults`. Pure: callers format the issues.
 *
 * Combination authority is `supportedCombinations` only — the `editable` flag
 * disagrees between this API and the fine-tunes-params schema, so it is never
 * consulted here.
 */
export function resolveTrainOptions(
  options: ModelTrainOptions | null,
  userOptions: Record<string, string>,
): { context: Record<string, string>; issues: TrainOptionsIssue[] } {
  const issues: TrainOptionsIssue[] = [];
  if (!options) {
    if (Object.keys(userOptions).length > 0) issues.push({ code: "not_configured" });
    return { context: {}, issues };
  }

  const definitions = new Map(
    (options.optionDefinitions ?? []).map((definition) => [definition.name, definition]),
  );
  const merged: Record<string, string> = { ...options.defaults, ...userOptions };
  for (const [key, value] of Object.entries(userOptions)) {
    const definition = definitions.get(key);
    const supportValues = definition?.supportValues;
    if (!definition || (supportValues && !supportValues.includes(value))) {
      issues.push({
        code: "unsupported_value",
        key,
        value,
        expected: supportValues ?? options.optionKeys ?? [],
      });
    }
  }

  const combinations = options.supportedCombinations ?? [];
  if (issues.length === 0 && combinations.length > 0) {
    const matched = combinations.some((combination) =>
      Object.entries(merged).every(([key, value]) => combination[key] === value),
    );
    if (!matched) issues.push({ code: "invalid_combination", combinations });
  }

  return { context: issues.length === 0 ? merged : {}, issues };
}
