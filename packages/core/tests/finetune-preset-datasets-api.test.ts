import { describe, expect, test, vi } from "vite-plus/test";
import { listPresetDatasets, type Client } from "../src/index.ts";

function mockClient(response: unknown = {}) {
  const requestJson = vi.fn<Client["requestJson"]>().mockResolvedValue(response);
  return { client: { requestJson } as unknown as Client, requestJson };
}

describe("fine-tune preset datasets API", () => {
  test("listPresetDatasets serializes optional params in a fixed order and sends the workspace header", async () => {
    const { client, requestJson } = mockClient({ request_id: "req-preset", output: [] });
    const response = await listPresetDatasets(client, {
      inputModel: "qwen3-8b",
      trainingType: "efficient_sft",
      version: "v1",
      trainOptions: { modality: "text", reasoning_mode: "thinking" },
      workspaceId: "ws-123",
    });
    expect(response).toEqual({ request_id: "req-preset", output: [] });
    expect(requestJson).toHaveBeenCalledWith({
      path: "/api/v1/fine-tunes/preset-datasets?input_model=qwen3-8b&training_type=efficient_sft&version=v1&hyper_parameters=%7B%22modality%22%3A%22text%22%2C%22reasoning_mode%22%3A%22thinking%22%7D",
      method: "GET",
      headers: { "X-DashScope-WorkSpace": "ws-123" },
      signal: undefined,
    });
  });

  test("listPresetDatasets sends a bare path when no optional params are set", async () => {
    const { client, requestJson } = mockClient();
    await listPresetDatasets(client, { inputModel: "qwen3-8b", trainingType: "dpo_full" });
    expect(requestJson).toHaveBeenCalledWith({
      path: "/api/v1/fine-tunes/preset-datasets?input_model=qwen3-8b&training_type=dpo_full",
      method: "GET",
      headers: undefined,
      signal: undefined,
    });
  });

  test("listPresetDatasets omits hyper_parameters for an empty train-options object", async () => {
    const { client, requestJson } = mockClient();
    await listPresetDatasets(client, {
      inputModel: "qwen3-8b",
      trainingType: "efficient_sft",
      trainOptions: {},
    });
    expect(requestJson.mock.calls[0]?.[0].path).toBe(
      "/api/v1/fine-tunes/preset-datasets?input_model=qwen3-8b&training_type=efficient_sft",
    );
  });
});
