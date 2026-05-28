import { PipelineError } from "./errors.ts";
import { getByJsonPointer } from "./schema.ts";
import type {
  StepArtifact,
  StepResult,
  StructuredStepErrorShape,
  PipelineBinding,
  PipelineConditionExpression,
  PipelineDefinition,
  PipelineInputExpression,
  PipelineStep,
  ResolvedExpression,
} from "./types.ts";
import { isRecord } from "./utils.ts";

const REDACTED = "[redacted]";

function stringifyConcatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value) ?? "";
  return String(value as string | number | boolean | bigint | symbol);
}

export function resolveStepInput(
  step: PipelineStep,
  pipeline: PipelineDefinition,
  runtimeInput: Record<string, unknown>,
  outputs: Map<string, StepResult>,
): {
  value: Record<string, unknown>;
  redacted: Record<string, unknown>;
  sensitiveKeys: string[];
  sensitive: boolean;
} {
  const value: Record<string, unknown> = {};
  const redacted: Record<string, unknown> = {};
  const sensitiveKeys: string[] = [];
  let sensitive = false;
  for (const [key, expression] of Object.entries(step.input)) {
    const resolved = resolveExpression(expression, pipeline, runtimeInput, outputs);
    value[key] = resolved.value;
    redacted[key] = resolved.redacted;
    if (resolved.sensitive) {
      sensitive = true;
      sensitiveKeys.push(key);
    }
  }
  return { value, redacted, sensitiveKeys, sensitive };
}

export function resolvePlannedStepInput(
  step: PipelineStep,
  pipeline: PipelineDefinition,
  runtimeInput: Record<string, unknown>,
): { redacted: Record<string, unknown>; sensitiveKeys: string[] } {
  const redacted: Record<string, unknown> = {};
  const sensitiveKeys: string[] = [];
  for (const [key, expression] of Object.entries(step.input)) {
    const resolved = resolvePlannedExpression(expression, pipeline, runtimeInput);
    redacted[key] = resolved.redacted;
    if (resolved.sensitive) sensitiveKeys.push(key);
  }
  return { redacted, sensitiveKeys };
}

export function evaluateCondition(
  expression: PipelineConditionExpression,
  pipeline: PipelineDefinition,
  runtimeInput: Record<string, unknown>,
  outputs: Map<string, StepResult>,
): boolean {
  return evaluateConditionWithResolver(expression, (inputExpression) =>
    resolveExpression(inputExpression, pipeline, runtimeInput, outputs),
  );
}

export function evaluateResolvedCondition(expression: PipelineConditionExpression): boolean {
  return evaluateConditionWithResolver(expression, (inputExpression) =>
    combineResolved(inputExpression, inputExpression, false, inputExpression !== undefined),
  );
}

export function redactSensitiveOutput(output: StepResult): StepResult {
  return {
    ...(output.data !== undefined ? { data: REDACTED } : {}),
    ...(output.artifacts ? { artifacts: output.artifacts.map(redactArtifact) } : {}),
    ...(output.warnings
      ? {
          warnings: output.warnings.map((warning) => ({
            code: warning.code,
            message: warning.message,
          })),
        }
      : {}),
    metadata: {
      ...(output.metadata?.step ? { step: output.metadata.step } : {}),
      redacted: true,
    },
  };
}

export function redactStructuredError(error: StructuredStepErrorShape): StructuredStepErrorShape {
  return {
    code: error.code,
    message: REDACTED,
    ...(error.step ? { step: error.step } : {}),
    details: { redacted: true },
  };
}

function resolveExpression(
  expression: PipelineInputExpression,
  pipeline: PipelineDefinition,
  runtimeInput: Record<string, unknown>,
  outputs: Map<string, StepResult>,
): ResolvedExpression {
  if (Array.isArray(expression)) {
    const items = expression.map((item) =>
      resolveExpression(item, pipeline, runtimeInput, outputs),
    );
    return combineResolved(
      items.map((item) => item.value),
      items.map((item) => item.redacted),
      items.some((item) => item.sensitive),
    );
  }
  if (!isExpressionObject(expression)) {
    if (!isRecord(expression))
      return combineResolved(expression, expression, false, expression !== undefined);
    const value: Record<string, unknown> = {};
    const redacted: Record<string, unknown> = {};
    let sensitive = false;
    for (const [key, child] of Object.entries(expression)) {
      const resolved = resolveExpression(child, pipeline, runtimeInput, outputs);
      value[key] = resolved.value;
      redacted[key] = resolved.redacted;
      sensitive = sensitive || resolved.sensitive;
    }
    return combineResolved(value, redacted, sensitive);
  }
  if ("$input" in expression) {
    const value = getByJsonPointer(runtimeInput, expression.$input as string);
    return combineResolved(value, value, false, value !== undefined);
  }
  if ("$from" in expression) {
    const from = expression.$from as string;
    const output = outputs.get(from);
    if (!output)
      throw new PipelineError("pipeline_reference_error", `Step output not found: ${from}`);
    const pointer = typeof expression.path === "string" ? expression.path : "";
    const value = getByJsonPointer(output, pointer);
    if (value === undefined)
      throw new PipelineError(
        "pipeline_reference_error",
        `Step output path not found: ${from}${pointer}`,
      );
    return combineResolved(value, value, false, true);
  }
  if ("$env" in expression) {
    const value = resolveBinding(pipeline.env, expression.$env as string, false);
    return combineResolved(value, value, false, value !== undefined);
  }
  if ("$secret" in expression) {
    const value = resolveBinding(pipeline.secrets, expression.$secret as string, true);
    return combineResolved(value, REDACTED, true, value !== undefined);
  }
  if ("$concat" in expression) {
    const items = (expression.$concat as PipelineInputExpression[]).map((item) =>
      resolveExpression(item, pipeline, runtimeInput, outputs),
    );
    const value = items.map((item) => stringifyConcatValue(item.value)).join("");
    const sensitive = items.some((item) => item.sensitive);
    const redacted = items
      .map((item) => (item.sensitive ? REDACTED : stringifyConcatValue(item.value)))
      .join("");
    return combineResolved(value, redacted, sensitive);
  }
  if ("$coalesce" in expression) {
    const candidates = expression.$coalesce as PipelineInputExpression[];
    let lastError: unknown;
    for (const candidate of candidates) {
      try {
        const resolved = resolveExpression(candidate, pipeline, runtimeInput, outputs);
        if (resolved.exists && resolved.value !== undefined && resolved.value !== null) {
          return resolved;
        }
      } catch (err) {
        lastError = err;
        continue;
      }
    }
    if (lastError) throw lastError;
    return combineResolved(undefined, undefined, false, false);
  }
  if ("$js" in expression) {
    const code = expression.$js as string;
    const argsExpressions = (expression.args ?? {}) as Record<string, PipelineInputExpression>;
    const resolvedArgs: Record<string, unknown> = {};
    const redactedArgs: Record<string, unknown> = {};
    let sensitive = false;
    for (const [key, argExpr] of Object.entries(argsExpressions)) {
      const resolved = resolveExpression(argExpr, pipeline, runtimeInput, outputs);
      resolvedArgs[key] = resolved.value;
      redactedArgs[key] = resolved.redacted;
      sensitive = sensitive || resolved.sensitive;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn = new Function("args", `return (${code})`);
      const value = fn(resolvedArgs);
      return combineResolved(value, sensitive ? REDACTED : value, sensitive);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new PipelineError("pipeline_js_error", `$js expression failed: ${message}`);
    }
  }
  return combineResolved(expression, expression, false);
}

function resolvePlannedExpression(
  expression: PipelineInputExpression,
  pipeline: PipelineDefinition,
  runtimeInput: Record<string, unknown>,
): ResolvedExpression {
  if (Array.isArray(expression)) {
    const items = expression.map((item) => resolvePlannedExpression(item, pipeline, runtimeInput));
    return combineResolved(
      items.map((item) => item.value),
      items.map((item) => item.redacted),
      items.some((item) => item.sensitive),
    );
  }
  if (!isExpressionObject(expression)) {
    if (!isRecord(expression))
      return combineResolved(expression, expression, false, expression !== undefined);
    const redacted: Record<string, unknown> = {};
    let sensitive = false;
    for (const [key, child] of Object.entries(expression)) {
      const resolved = resolvePlannedExpression(child, pipeline, runtimeInput);
      redacted[key] = resolved.redacted;
      sensitive = sensitive || resolved.sensitive;
    }
    return combineResolved(redacted, redacted, sensitive);
  }
  if ("$input" in expression) {
    const value = getByJsonPointer(runtimeInput, expression.$input as string);
    return combineResolved(value, value, false, value !== undefined);
  }
  if ("$from" in expression) return combineResolved({ ...expression }, { ...expression }, false);
  if ("$env" in expression) {
    const value = resolveBinding(pipeline.env, expression.$env as string, false);
    return combineResolved(value, value, false, value !== undefined);
  }
  if ("$secret" in expression) {
    resolveBinding(pipeline.secrets, expression.$secret as string, true);
    return combineResolved(REDACTED, REDACTED, true, true);
  }
  if ("$concat" in expression) {
    const items = (expression.$concat as PipelineInputExpression[]).map((item) =>
      resolvePlannedExpression(item, pipeline, runtimeInput),
    );
    const hasFrom = items.some((_, i) => {
      const raw = (expression.$concat as PipelineInputExpression[])[i];
      return isRecord(raw) && "$from" in raw;
    });
    if (hasFrom)
      return combineResolved(
        { ...expression },
        { ...expression },
        items.some((item) => item.sensitive),
      );
    const value = items.map((item) => stringifyConcatValue(item.value)).join("");
    const sensitive = items.some((item) => item.sensitive);
    const redacted = items
      .map((item) => (item.sensitive ? REDACTED : stringifyConcatValue(item.value)))
      .join("");
    return combineResolved(value, redacted, sensitive);
  }
  if ("$coalesce" in expression) {
    const candidates = expression.$coalesce as PipelineInputExpression[];
    const hasFrom = candidates.some((c) => isRecord(c) && "$from" in c);
    if (hasFrom) return combineResolved({ ...expression }, { ...expression }, false);
    for (const candidate of candidates) {
      const resolved = resolvePlannedExpression(candidate, pipeline, runtimeInput);
      if (resolved.exists && resolved.value !== undefined && resolved.value !== null) {
        return resolved;
      }
    }
    return combineResolved(undefined, undefined, false, false);
  }
  if ("$js" in expression) {
    const argsExpressions = (expression.args ?? {}) as Record<string, PipelineInputExpression>;
    const hasFrom = Object.values(argsExpressions).some((v) => isRecord(v) && "$from" in v);
    if (hasFrom) return combineResolved({ ...expression }, { ...expression }, false);
    const code = expression.$js as string;
    const resolvedArgs: Record<string, unknown> = {};
    let sensitive = false;
    for (const [key, argExpr] of Object.entries(argsExpressions)) {
      const resolved = resolvePlannedExpression(argExpr, pipeline, runtimeInput);
      resolvedArgs[key] = resolved.value;
      sensitive = sensitive || resolved.sensitive;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn = new Function("args", `return (${code})`);
      const value = fn(resolvedArgs);
      return combineResolved(value, sensitive ? REDACTED : value, sensitive);
    } catch {
      return combineResolved({ ...expression }, { ...expression }, false);
    }
  }
  return combineResolved(expression, expression, false);
}

function resolveBinding(
  bindings: Record<string, string | PipelineBinding> | undefined,
  name: string,
  secret: boolean,
): unknown {
  if (!hasBinding(bindings, name)) {
    throw new PipelineError(
      secret ? "pipeline_secret_error" : "pipeline_env_error",
      `${secret ? "Secret" : "Environment"} binding is not declared: ${name}`,
    );
  }
  const binding = bindings![name]!;
  const spec =
    typeof binding === "string" ? { from: "env" as const, name: binding, required: true } : binding;
  const value = spec.from === "env" || spec.from === undefined ? process.env[spec.name] : undefined;
  if (value !== undefined && value !== "") return value;
  if (spec.default !== undefined) return spec.default;
  if (spec.required !== false) {
    throw new PipelineError(
      secret ? "pipeline_secret_error" : "pipeline_env_error",
      `${secret ? "Secret" : "Environment"} binding not found: ${name}`,
    );
  }
  return undefined;
}

function hasBinding(
  bindings: Record<string, string | PipelineBinding> | undefined,
  name: string,
): boolean {
  return !!bindings && Object.prototype.hasOwnProperty.call(bindings, name);
}

function combineResolved(
  value: unknown,
  redacted: unknown,
  sensitive: boolean,
  exists = true,
): ResolvedExpression {
  return { value, redacted, sensitive, exists };
}

function evaluateConditionWithResolver(
  expression: PipelineConditionExpression,
  resolveInput: (expression: PipelineInputExpression) => ResolvedExpression,
): boolean {
  if (typeof expression === "boolean") return expression;
  if (isRecord(expression) && "$exists" in expression) {
    try {
      return resolveInput(expression.$exists as PipelineInputExpression).exists;
    } catch (err) {
      if (err instanceof PipelineError && err.code === "pipeline_reference_error") return false;
      throw err;
    }
  }
  if (isRecord(expression) && "$and" in expression) {
    if (!Array.isArray(expression.$and) || expression.$and.length === 0)
      throw conditionError("$and must be a non-empty array");
    return (expression.$and as PipelineConditionExpression[]).every((condition) =>
      evaluateConditionWithResolver(condition, resolveInput),
    );
  }
  if (isRecord(expression) && "$or" in expression) {
    if (!Array.isArray(expression.$or) || expression.$or.length === 0)
      throw conditionError("$or must be a non-empty array");
    return (expression.$or as PipelineConditionExpression[]).some((condition) =>
      evaluateConditionWithResolver(condition, resolveInput),
    );
  }
  if (isRecord(expression) && "$not" in expression) {
    return !evaluateConditionWithResolver(
      expression.$not as PipelineConditionExpression,
      resolveInput,
    );
  }

  const binary = binaryCondition(expression);
  if (binary) {
    const [leftExpression, rightExpression] = binary.operands;
    const left = resolveInput(leftExpression).value;
    const right = resolveInput(rightExpression).value;
    switch (binary.operator) {
      case "$eq":
        return jsonEqual(left, right);
      case "$ne":
        return !jsonEqual(left, right);
      case "$gt":
        return compareOrdered(left, right, binary.operator) > 0;
      case "$gte":
        return compareOrdered(left, right, binary.operator) >= 0;
      case "$lt":
        return compareOrdered(left, right, binary.operator) < 0;
      case "$lte":
        return compareOrdered(left, right, binary.operator) <= 0;
      case "$in":
        if (!Array.isArray(right)) throw conditionError("$in right operand must be an array");
        return right.some((item) => jsonEqual(item, left));
      case "$contains":
        if (Array.isArray(left)) return left.some((item) => jsonEqual(item, right));
        if (typeof left === "string" && typeof right === "string") return left.includes(right);
        throw conditionError("$contains left operand must be an array or string");
    }
  }

  return Boolean(resolveInput(expression as PipelineInputExpression).value);
}

type BinaryConditionOperator =
  | "$eq"
  | "$ne"
  | "$gt"
  | "$gte"
  | "$lt"
  | "$lte"
  | "$in"
  | "$contains";

function binaryCondition(expression: PipelineConditionExpression):
  | {
      operator: BinaryConditionOperator;
      operands: [PipelineInputExpression, PipelineInputExpression];
    }
  | undefined {
  if (!isRecord(expression)) return undefined;
  for (const operator of [
    "$eq",
    "$ne",
    "$gt",
    "$gte",
    "$lt",
    "$lte",
    "$in",
    "$contains",
  ] as const) {
    if (operator in expression) {
      if (!Array.isArray(expression[operator]) || expression[operator].length !== 2) {
        throw conditionError(`${operator} must be a two-item array`);
      }
      return {
        operator,
        operands: expression[operator] as [PipelineInputExpression, PipelineInputExpression],
      };
    }
  }
  return undefined;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function compareOrdered(left: unknown, right: unknown, operator: string): number {
  if (
    typeof left === "number" &&
    Number.isFinite(left) &&
    typeof right === "number" &&
    Number.isFinite(right)
  ) {
    return left - right;
  }
  if (typeof left === "string" && typeof right === "string") return left.localeCompare(right);
  throw conditionError(`${operator} operands must both be finite numbers or both be strings`);
}

function conditionError(message: string): PipelineError {
  return new PipelineError("pipeline_condition_error", message);
}

function redactArtifact(artifact: StepArtifact): StepArtifact {
  return {
    id: artifact.id,
    kind: artifact.kind,
    mediaType: artifact.mediaType,
    metadata: artifact.metadata ? { redacted: true } : undefined,
  };
}

function isExpressionObject(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    ("$input" in value ||
      "$from" in value ||
      "$env" in value ||
      "$secret" in value ||
      "$concat" in value ||
      "$coalesce" in value ||
      "$js" in value)
  );
}
