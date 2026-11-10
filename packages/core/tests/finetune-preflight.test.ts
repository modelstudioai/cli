import { describe, expect, test } from "vite-plus/test";
import {
  getFineTuneHyperParameterDefaultNumber,
  INSUFFICIENT_SAMPLES_CODE,
  preflightBatchSizeGate,
  validateFineTuneHyperParameterOverrides,
  type FineTuneParamHyperParam,
} from "../src/index.ts";

describe("preflightBatchSizeGate", () => {
  test("passes when recordCount exceeds batch_size", () => {
    const r = preflightBatchSizeGate({ recordCount: 9, batchSize: 8 });
    expect(r.ok).toBe(true);
    expect(r.issue).toBeUndefined();
    expect(r.hint).toBeUndefined();
  });

  test("passes at the boundary just above batch_size (9 > 8)", () => {
    expect(preflightBatchSizeGate({ recordCount: 9, batchSize: 8 }).ok).toBe(true);
    // A comfortably-large dataset is fine too.
    expect(preflightBatchSizeGate({ recordCount: 1000, batchSize: 16 }).ok).toBe(true);
  });

  test("fails when recordCount equals batch_size (must be *greater than*)", () => {
    const r = preflightBatchSizeGate({ recordCount: 8, batchSize: 8 });
    expect(r.ok).toBe(false);
    expect(r.issue).toBeDefined();
    expect(r.issue!.severity).toBe("error");
    expect(r.issue!.code).toBe(INSUFFICIENT_SAMPLES_CODE);
    expect(r.issue!.message).toMatch(/not greater than batch_size \(8\)/);
    expect(r.hint).toMatch(/add more data/);
  });

  test("fails when recordCount is below batch_size (the 3-sample / batch-8 case)", () => {
    const r = preflightBatchSizeGate({ recordCount: 3, batchSize: 8 });
    expect(r.ok).toBe(false);
    expect(r.issue!.message).toMatch(/3 sample\(s\)/);
    expect(r.issue!.message).toMatch(/batch_size \(8\)/);
    expect(r.hint).toMatch(/lower --batch-size/);
  });

  test("hint references the 0.9 train split so users leave margin", () => {
    const r = preflightBatchSizeGate({ recordCount: 5, batchSize: 8 });
    expect(r.hint).toMatch(/0\.9 train split/);
  });

  test("honors the effective model-specific batch size", () => {
    const result = preflightBatchSizeGate({ recordCount: 31, batchSize: 32 });
    expect(result.ok).toBe(false);
    expect(result.issue!.message).toMatch(/batch_size \(32\)/);
    expect(result.hint).toMatch(/range published for this model/);
  });
});

const schema: FineTuneParamHyperParam[] = [
  {
    name: "batch_size",
    type: "number",
    data_range: ["32", "8192"],
    left_range: "include",
    right_range: "include",
    step: 8,
    editable: true,
    defaultValue: "32",
  },
  {
    name: "lora_dropout",
    type: "floatInputNumber",
    data_range: ["0", "0.2"],
    left_range: "exclude",
    right_range: "exclude",
    editable: true,
  },
  {
    name: "lora_rank",
    type: "select",
    support_values: ["8", "16", "32", "64"],
    editable: true,
  },
  {
    name: "eval_steps",
    type: "intInputNumber",
    data_range: ["1", "2147483647"],
    left_range: "include",
    right_range: "include",
    editable: true,
  },
  { name: "fixed", type: "number", editable: false },
  { name: "fallback_default", type: "number", recommend_value: "7" },
];

describe("validateFineTuneHyperParameterOverrides", () => {
  test("accepts values that satisfy enum, range, type, and step constraints", () => {
    expect(
      validateFineTuneHyperParameterOverrides(schema, {
        batch_size: 40,
        lora_dropout: 0.1,
        lora_rank: 16,
        eval_steps: 50,
      }),
    ).toEqual([]);
  });

  test.each([
    [{ unknown: 1 }, "unsupported"],
    [{ fixed: 1 }, "not_editable"],
    [{ eval_steps: 1.5 }, "invalid_type"],
    [{ lora_rank: 4 }, "not_supported"],
    [{ batch_size: 16 }, "out_of_range"],
    [{ batch_size: 34 }, "invalid_step"],
    [{ lora_dropout: 0 }, "out_of_range"],
    [{ lora_dropout: 0.2 }, "out_of_range"],
  ] as const)("rejects %j as %s", (overrides, code) => {
    expect(validateFineTuneHyperParameterOverrides(schema, overrides)).toEqual([
      expect.objectContaining({ code }),
    ]);
  });

  test("uses defaultValue before recommend_value for numeric service defaults", () => {
    expect(getFineTuneHyperParameterDefaultNumber(schema, "batch_size")).toBe(32);
    expect(getFineTuneHyperParameterDefaultNumber(schema, "fallback_default")).toBe(7);
    expect(getFineTuneHyperParameterDefaultNumber(schema, "missing")).toBeUndefined();
  });
});
