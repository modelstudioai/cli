import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { buildSettings, Client, httpTransport, type LocalizedText } from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import * as commands from "../../src/index.ts";

const identity = { binName: "bl", version: "test", clientName: "test", npmPackage: "test" };

// Training-only base model: absent from the inference catalog, present when scoped.
const trainingOnly = {
  model: "qwen3-8b",
  name: "Qwen3 8B",
  supports: { sft: true, fineTune: true, inference: false },
  trainingTypes: { sft: ["full", "lora"] },
};
// LoRA-only image model: trainable, but not full-parameter SFT.
const loraOnly = {
  model: "qwen-image-2.0",
  name: "Qwen Image 2.0",
  supports: { sft: true, fineTune: true, inference: true },
  trainingTypes: { sft: ["lora"] },
};
// Inference flagship: not trainable, only in the default inference catalog.
const inferenceOnly = {
  model: "qwen3.8-max",
  name: "Qwen3.8 Max",
  supports: { inference: true, fineTune: false },
};
const trainableCatalog = [trainingOnly, loraOnly];
const inferenceCatalog = [loraOnly, inferenceOnly];

let inputs: Record<string, unknown>[];
beforeEach(() => {
  inputs = [];
  vi.stubEnv("NO_COLOR", "1");
  vi.spyOn(httpTransport, "fetch").mockImplementation(async (_input, init) => {
    const raw = typeof init?.body === "string" ? init.body : "";
    const encoded = new URLSearchParams(raw).get("params");
    const params = JSON.parse(encoded ?? "{}") as {
      Api: string;
      Data: { input: Record<string, unknown> };
    };
    const input = params.Data.input;
    inputs.push(input);
    // Simulate the server-side capability scope: fineTune returns the trainable
    // universe; the default (unscoped) query returns the inference catalog.
    const supports = input.supports as Record<string, boolean> | undefined;
    const list = supports?.fineTune ? trainableCatalog : inferenceCatalog;
    return Response.json({ data: { total: list.length, list } });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function invoke(flags: Record<string, unknown>) {
  let stdout = "",
    stderr = "",
    strayOut = "",
    strayErr = "";
  const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    strayOut += String(chunk);
    return true;
  });
  const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    strayErr += String(chunk);
    return true;
  });
  const settings = buildSettings({
    flags: { output: "json", quiet: true },
    file: { language: "en-US" },
    env: {},
    configPath: "/tmp/finetune-capability-no-config/config.json",
  });
  const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
  const reporter = createOutputReporter({
    settings,
    localize,
    stdout: { write: (chunk) => (stdout += chunk) },
    stderr: { write: (chunk) => (stderr += chunk) },
  });
  const client = new Client({
    identity,
    settings,
    baseUrl: "https://fixture.invalid",
    apiCred: { token: "fixture-api-token", source: "flag", baseUrl: "https://fixture.invalid" },
  });
  let exitCode = 0;
  try {
    try {
      await commands.finetuneCapability.run({
        identity,
        flags,
        settings,
        client,
        localize,
        output: reporter.output,
      } as never);
    } catch (error) {
      exitCode = reporter.error(error);
    }
    return { stdout, stderr, strayOut, strayErr, exitCode };
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
}

test("--training-type sft queries the trainable catalog and keeps full-parameter semantics", async () => {
  const result = await invoke({ trainingType: "sft" });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.strayOut + result.strayErr).toBe("");
  // The fix: capability queries scope the catalog by fineTune.
  expect(inputs.length).toBeGreaterThan(0);
  for (const input of inputs) expect(input.supports).toEqual({ fineTune: true });
  const data = JSON.parse(result.stdout) as {
    training_type: string;
    count: number;
    models: { model: string }[];
  };
  expect(data.training_type).toBe("sft");
  // qwen3-8b (training-only) now appears; qwen-image-2.0 stays excluded (lora-only).
  expect(data.models.map((model) => model.model)).toEqual(["qwen3-8b"]);
  expect(data.count).toBe(1);
});

test("--training-type sft-lora includes lora-only models", async () => {
  const result = await invoke({ trainingType: "sft-lora" });
  expect(result.exitCode, result.stderr).toBe(0);
  for (const input of inputs) expect(input.supports).toEqual({ fineTune: true });
  const data = JSON.parse(result.stdout) as { models: { model: string }[] };
  expect(data.models.map((model) => model.model)).toEqual(["qwen-image-2.0", "qwen3-8b"]);
});

test("--base-model finds a training-only base model in the trainable catalog", async () => {
  const result = await invoke({ baseModel: "qwen3-8b" });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(inputs[0]?.supports).toEqual({ fineTune: true });
  expect(inputs[0]?.name).toBe("qwen3-8b");
  const data = JSON.parse(result.stdout) as { model: string; supported: string[] };
  expect(data.model).toBe("qwen3-8b");
  expect(data.supported).toEqual(["sft", "sft-lora"]);
});

test("--base-model reports not-found for a non-trainable inference model", async () => {
  const result = await invoke({ baseModel: "qwen3.8-max" });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(inputs[0]?.supports).toEqual({ fineTune: true });
  const data = JSON.parse(result.stdout) as { model: string; error?: string };
  expect(data.model).toBe("qwen3.8-max");
  expect(data.error).toContain("No foundation model found");
});
