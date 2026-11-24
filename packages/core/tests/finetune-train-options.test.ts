import { describe, expect, test } from "vite-plus/test";
import {
  fetchModelTrainOptions,
  MODEL_TRAIN_OPTIONS_API,
  resolveTrainOptions,
  type ModelTrainOptions,
} from "../src/index.ts";

const DYNAMIC_MODEL = "qwen3.6-plus-base-2026-04-02";

function trainOptions(overrides: Partial<ModelTrainOptions> = {}): ModelTrainOptions {
  return {
    enabled: true,
    optionKeys: ["modality", "reasoning_mode"],
    optionDefinitions: [
      // editable=false mirrors the console contract; combination authority is
      // supportedCombinations, so passing a supported value must still pass.
      { name: "modality", supportValues: ["vision"], required: true, editable: false },
      {
        name: "reasoning_mode",
        supportValues: ["instruct", "thinking"],
        required: true,
        editable: true,
      },
    ],
    defaults: { modality: "vision", reasoning_mode: "instruct" },
    supportedCombinations: [{ modality: "vision", reasoning_mode: "instruct" }],
    ...overrides,
  };
}

function gatewayEnvelope(entries: unknown[]): unknown {
  return {
    code: "200",
    successResponse: true,
    data: {
      success: true,
      DataV2: {
        ret: ["SUCCESS::ok"],
        data: { code: "200", data: entries, success: true },
      },
    },
  };
}

describe("fetchModelTrainOptions", () => {
  test("requests the console API with the model and server training type", async () => {
    const calls: Array<{ api: string; data: Record<string, unknown> }> = [];
    const options = await fetchModelTrainOptions(
      async (api, data) => {
        calls.push({ api, data });
        return gatewayEnvelope([{ model: DYNAMIC_MODEL, trainingOptions: trainOptions() }]);
      },
      DYNAMIC_MODEL,
      "cpt",
    );
    expect(calls).toEqual([
      {
        api: MODEL_TRAIN_OPTIONS_API,
        data: { input: { models: [DYNAMIC_MODEL], trainingType: "cpt" } },
      },
    ]);
    expect(options?.defaults).toEqual({ modality: "vision", reasoning_mode: "instruct" });
  });

  test("returns null when the model is absent (no dynamic options)", async () => {
    const options = await fetchModelTrainOptions(
      async () => gatewayEnvelope([]),
      "qwen3-8b",
      "sft",
    );
    expect(options).toBeNull();
  });

  test("returns null when trainingOptions.enabled is not true", async () => {
    const options = await fetchModelTrainOptions(
      async () =>
        gatewayEnvelope([
          { model: DYNAMIC_MODEL, trainingOptions: trainOptions({ enabled: false }) },
        ]),
      DYNAMIC_MODEL,
      "cpt",
    );
    expect(options).toBeNull();
  });

  test("tolerates an object wrapper around the entries array", async () => {
    const options = await fetchModelTrainOptions(
      async () => ({
        data: {
          DataV2: {
            data: { data: { data: [{ model: DYNAMIC_MODEL, trainingOptions: trainOptions() }] } },
          },
        },
      }),
      DYNAMIC_MODEL,
      "cpt",
    );
    expect(options?.enabled).toBe(true);
  });
});

describe("resolveTrainOptions", () => {
  test("no options and no user flags yields an empty context", () => {
    expect(resolveTrainOptions(null, {})).toEqual({ context: {}, issues: [] });
  });

  test("user flags on a model without dynamic options are not_configured", () => {
    const { context, issues } = resolveTrainOptions(null, { modality: "vision" });
    expect(context).toEqual({});
    expect(issues).toEqual([{ code: "not_configured" }]);
  });

  test("omitted options are completed from the model defaults", () => {
    const { context, issues } = resolveTrainOptions(trainOptions(), {});
    expect(issues).toEqual([]);
    expect(context).toEqual({ modality: "vision", reasoning_mode: "instruct" });
  });

  test("a partial user selection merges with defaults", () => {
    const options = trainOptions({
      supportedCombinations: [
        { modality: "vision", reasoning_mode: "instruct" },
        { modality: "vision", reasoning_mode: "thinking" },
      ],
    });
    const { context, issues } = resolveTrainOptions(options, { reasoning_mode: "thinking" });
    expect(issues).toEqual([]);
    expect(context).toEqual({ modality: "vision", reasoning_mode: "thinking" });
  });

  test("a value outside supportValues is unsupported_value", () => {
    const { issues } = resolveTrainOptions(trainOptions(), { modality: "text" });
    expect(issues).toEqual([
      { code: "unsupported_value", key: "modality", value: "text", expected: ["vision"] },
    ]);
  });

  test("an unknown option key is unsupported_value", () => {
    const { issues } = resolveTrainOptions(trainOptions(), { audio: "x" });
    expect(issues[0]?.code).toBe("unsupported_value");
    expect(issues[0]?.key).toBe("audio");
  });

  test("a supported value outside supportedCombinations is invalid_combination", () => {
    const options = trainOptions({
      optionDefinitions: [
        { name: "modality", supportValues: ["vision"] },
        { name: "reasoning_mode", supportValues: ["instruct", "thinking"] },
      ],
    });
    const { context, issues } = resolveTrainOptions(options, { reasoning_mode: "thinking" });
    expect(context).toEqual({});
    expect(issues).toEqual([
      {
        code: "invalid_combination",
        combinations: [{ modality: "vision", reasoning_mode: "instruct" }],
      },
    ]);
  });

  test("editable=false does not block a supported value (combinations are authoritative)", () => {
    const { context, issues } = resolveTrainOptions(trainOptions(), { modality: "vision" });
    expect(issues).toEqual([]);
    expect(context.modality).toBe("vision");
  });
});
