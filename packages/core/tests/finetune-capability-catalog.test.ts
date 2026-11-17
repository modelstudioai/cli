import { afterEach, expect, test, vi } from "vite-plus/test";
import { httpTransport } from "../src/client/transport.ts";
import {
  FINETUNE_CATALOG_SUPPORTS,
  fetchModelCapability,
  fetchModelList,
  fetchModelListAll,
  findModelByName,
  listSupportedTrainingTypes,
  modelSupportsTrainingType,
  type ConsoleCall,
  type ModelCapability,
  type Settings,
} from "../src/index.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

/** A recording ConsoleCall that returns a fixed catalog envelope (no HTTP). */
function recordingCall(response: { total: number; list: unknown[] }): {
  call: ConsoleCall;
  inputs: Record<string, unknown>[];
} {
  const inputs: Record<string, unknown>[] = [];
  const call: ConsoleCall = async (_api, data) => {
    inputs.push(data.input as Record<string, unknown>);
    return { data: response };
  };
  return { call, inputs };
}

test("FINETUNE_CATALOG_SUPPORTS scopes the catalog to trainable models", () => {
  expect(FINETUNE_CATALOG_SUPPORTS).toEqual({ fineTune: true });
});

test("fetchModelList omits supports by default (inference catalog, backward compatible)", async () => {
  const { call, inputs } = recordingCall({ total: 0, list: [] });
  await fetchModelList(call);
  expect(inputs[0]).not.toHaveProperty("supports");
  expect(inputs[0]?.group).toBe(true);
});

test("fetchModelList forwards an explicit supports scope into the gateway input", async () => {
  const { call, inputs } = recordingCall({ total: 0, list: [] });
  await fetchModelList(call, { supports: { fineTune: true } });
  expect(inputs[0]?.supports).toEqual({ fineTune: true });
});

test("findModelByName forwards supports and still requires an exact model match", async () => {
  const { call, inputs } = recordingCall({
    total: 2,
    list: [{ model: "qwen3-8b-v2" }, { model: "qwen3-8b" }],
  });
  const match = await findModelByName(call, "qwen3-8b", { fineTune: true });
  expect(match?.model).toBe("qwen3-8b");
  expect(inputs[0]?.name).toBe("qwen3-8b");
  expect(inputs[0]?.supports).toEqual({ fineTune: true });
});

test("findModelByName without supports keeps the default inference scope", async () => {
  const { call, inputs } = recordingCall({ total: 1, list: [{ model: "qwen-plus" }] });
  await findModelByName(call, "qwen-plus");
  expect(inputs[0]).not.toHaveProperty("supports");
});

test("fetchModelListAll carries the supports scope across every page", async () => {
  const inputs: Record<string, unknown>[] = [];
  const call: ConsoleCall = async (_api, data) => {
    const input = data.input as Record<string, unknown>;
    inputs.push(input);
    const list = input.pageNo === 1 ? [{ model: "a" }, { model: "b" }] : [{ model: "c" }];
    return { data: { total: 3, list } };
  };
  const all = await fetchModelListAll(call, { supports: { fineTune: true }, pageSize: 2 });
  expect(all.map((model) => model.model)).toEqual(["a", "b", "c"]);
  expect(inputs).toHaveLength(2);
  for (const input of inputs) expect(input.supports).toEqual({ fineTune: true });
});

test("fetchModelCapability queries the trainable catalog and resolves training types", async () => {
  let capturedInput: Record<string, unknown> | undefined;
  vi.spyOn(httpTransport, "fetch").mockImplementation(async (_input, init) => {
    const params = new URLSearchParams(init?.body as string).get("params");
    capturedInput = (JSON.parse(params ?? "{}") as { Data: { input: Record<string, unknown> } })
      .Data.input;
    return new Response(
      JSON.stringify({
        data: {
          total: 1,
          list: [
            {
              model: "qwen3-8b",
              supports: { sft: true, fineTune: true, inference: false },
              trainingTypes: { sft: ["full", "lora"] },
            },
          ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });

  const capability = await fetchModelCapability({ timeout: 30 } as Settings, "qwen3-8b");
  expect(capturedInput?.supports).toEqual({ fineTune: true });
  expect(capability?.model).toBe("qwen3-8b");
  expect(listSupportedTrainingTypes(capability)).toEqual(["sft", "sft-lora"]);
});

test("sft stays full-parameter only; lora-only models resolve to sft-lora (semantics preserved)", () => {
  const loraOnly: ModelCapability = {
    model: "qwen-image-2.0",
    supports: { sft: true, fineTune: true },
    trainingTypes: { sft: ["lora"] },
  };
  expect(modelSupportsTrainingType(loraOnly, "sft")).toBe(false);
  expect(modelSupportsTrainingType(loraOnly, "sft-lora")).toBe(true);
  expect(listSupportedTrainingTypes(loraOnly)).toEqual(["sft-lora"]);

  const full: ModelCapability = {
    model: "qwen3-8b",
    supports: { sft: true, fineTune: true },
    trainingTypes: { sft: ["full", "lora"] },
  };
  expect(modelSupportsTrainingType(full, "sft")).toBe(true);
  expect(listSupportedTrainingTypes(full)).toEqual(["sft", "sft-lora"]);
});
