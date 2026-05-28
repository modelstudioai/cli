import { PipelineError } from "../errors.ts";
import { registerStep } from "../dispatcher.ts";
import { isRecord } from "../utils.ts";
import type { StepDispatcher } from "../dispatcher.ts";
import type { StepOutputSchema, StepResult, PipelineConditionExpression } from "../types.ts";
import { evaluateResolvedCondition } from "../expressions.ts";

const SWITCH_OUTPUT_SCHEMA: StepOutputSchema = {
  description: "Conditional branch selection from a list of cases",
  paths: [
    { path: "/data/selected", description: "Key of the matched case" },
    { path: "/data/value", description: "Value of the matched case" },
    { path: "/data/matched", description: "Whether a case was matched (boolean)" },
  ],
};

const SELECT_OUTPUT_SCHEMA: StepOutputSchema = {
  description: "Select first available value from candidates",
  paths: [
    { path: "/data/source", description: "Source identifier of the selected candidate" },
    { path: "/data/value", description: "Value of the selected candidate" },
    { path: "/data/matched", description: "Whether a candidate was matched (boolean)" },
  ],
};

const ASSERT_OUTPUT_SCHEMA: StepOutputSchema = {
  description: "Assert a condition is true",
  paths: [
    { path: "/data/ok", description: "Whether the assertion passed (boolean)" },
    { path: "/data/message", description: "Assertion message" },
  ],
};

export function registerLogicSteps(dispatcher?: StepDispatcher): void {
  registerStep(
    "logic/switch",
    (_input) => {
      const cases = asSwitchCases(_input.cases);
      for (const entry of cases) {
        if (evaluateResolvedCondition(entry.condition)) {
          return { data: { selected: entry.key, value: entry.value, matched: true } };
        }
      }
      if ("defaultValue" in _input) {
        return {
          data: {
            selected: typeof _input.defaultKey === "string" ? _input.defaultKey : "default",
            value: _input.defaultValue,
            matched: false,
          },
        };
      }
      throw new PipelineError("logic_no_match", "logic/switch did not match any case", {
        step: "logic/switch",
        details: { caseCount: cases.length },
      });
    },
    dispatcher,
    SWITCH_OUTPUT_SCHEMA,
  );

  registerStep(
    "logic/select",
    (_input) => {
      const candidates = asSelectCandidates(_input.candidates);
      for (const candidate of candidates) {
        if (candidate.available !== undefined && !evaluateResolvedCondition(candidate.available))
          continue;
        if (candidate.value !== undefined && candidate.value !== null) {
          return { data: { source: candidate.source, value: candidate.value, matched: true } };
        }
      }
      if ("defaultValue" in _input) {
        return {
          data: {
            source: typeof _input.defaultSource === "string" ? _input.defaultSource : "default",
            value: _input.defaultValue,
            matched: false,
          },
        };
      }
      throw new PipelineError(
        "logic_no_candidate",
        "logic/select did not receive an available candidate",
        { step: "logic/select", details: { candidateCount: candidates.length } },
      );
    },
    dispatcher,
    SELECT_OUTPUT_SCHEMA,
  );

  registerStep(
    "logic/assert",
    (_input): StepResult => {
      const message =
        typeof _input.message === "string" ? _input.message : "Logic assertion failed";
      const metadata = isRecord(_input.metadata) ? _input.metadata : undefined;
      if (!evaluateResolvedCondition(asCondition(_input.condition))) {
        if (_input.soft === true) {
          return {
            data: { ok: false, message, ...(metadata ? { metadata } : {}) },
          };
        }
        throw new PipelineError("logic_assertion_failed", message, {
          step: "logic/assert",
          details: metadata ?? {},
        });
      }
      return {
        data: {
          ok: true,
          ...(_input.message !== undefined ? { message } : {}),
          ...(metadata ? { metadata } : {}),
        },
      };
    },
    dispatcher,
    ASSERT_OUTPUT_SCHEMA,
  );
}

interface LogicSwitchCase {
  key: string;
  condition: PipelineConditionExpression;
  value: unknown;
}

interface LogicSelectCandidate {
  source: string;
  value: unknown;
  available?: PipelineConditionExpression;
}

function asSwitchCases(value: unknown): LogicSwitchCase[] {
  if (!Array.isArray(value))
    throw new PipelineError("logic_input_error", "cases must be an array", {
      step: "logic/switch",
    });
  return value as LogicSwitchCase[];
}

function asSelectCandidates(value: unknown): LogicSelectCandidate[] {
  if (!Array.isArray(value))
    throw new PipelineError("logic_input_error", "candidates must be an array", {
      step: "logic/select",
    });
  return value as LogicSelectCandidate[];
}

function asCondition(value: unknown): PipelineConditionExpression {
  if (value === undefined)
    throw new PipelineError("logic_input_error", "condition is required", {
      step: "logic/assert",
    });
  return value as PipelineConditionExpression;
}
