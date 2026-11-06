import { describe, expect, test, vi } from "vite-plus/test";
import { getFineTuneParams, listBasicMetrics, type Client } from "../src/index.ts";

function mockClient(response: unknown = {}) {
  const requestJson = vi.fn<Client["requestJson"]>().mockResolvedValue(response);
  return { client: { requestJson } as unknown as Client, requestJson };
}

describe("fine-tune params / basic metrics API", () => {
  test("getFineTuneParams serializes train options as one hyper_parameters query param", async () => {
    const { client, requestJson } = mockClient();
    await getFineTuneParams(client, {
      inputModel: "qwen3.5-27b",
      trainingType: "sft",
      paramType: "hyper",
      trainOptions: { modality: "text", reasoning_mode: "thinking" },
      lang: "zh",
    });
    expect(requestJson).toHaveBeenCalledWith({
      path: "/api/v1/fine-tunes/fine-tunes-params?input_model=qwen3.5-27b&training_type=sft&param_type=hyper&hyper_parameters=%7B%22modality%22%3A%22text%22%2C%22reasoning_mode%22%3A%22thinking%22%7D&lang=zh",
      method: "GET",
      headers: undefined,
      signal: undefined,
    });
  });

  test("getFineTuneParams omits optional query params and sends mtu_spec_code", async () => {
    const { client, requestJson } = mockClient();
    await getFineTuneParams(client, {
      inputModel: "qwen3-8b",
      trainingType: "efficient_sft",
      mtuSpecCode: "MTU2",
    });
    expect(requestJson.mock.calls[0]?.[0].path).toBe(
      "/api/v1/fine-tunes/fine-tunes-params?input_model=qwen3-8b&training_type=efficient_sft&mtu_spec_code=MTU2",
    );
  });

  test("getFineTuneParams sends the workspace header only when provided", async () => {
    const withWorkspace = mockClient();
    await getFineTuneParams(withWorkspace.client, {
      inputModel: "qwen3-8b",
      trainingType: "sft",
      workspaceId: "ws-123",
    });
    expect(withWorkspace.requestJson.mock.calls[0]?.[0].headers).toEqual({
      "X-DashScope-WorkSpace": "ws-123",
    });

    const withoutWorkspace = mockClient();
    await getFineTuneParams(withoutWorkspace.client, {
      inputModel: "qwen3-8b",
      trainingType: "sft",
    });
    expect(withoutWorkspace.requestJson.mock.calls[0]?.[0].headers).toBeUndefined();
  });

  test("listBasicMetrics encodes the job id and serializes pagination query", async () => {
    const { client, requestJson } = mockClient();
    await listBasicMetrics(client, "ft /?#job", {
      pageNo: 2,
      pageSize: 100,
    });
    expect(requestJson).toHaveBeenCalledWith({
      path: "/api/v1/fine-tunes/ft%20%2F%3F%23job/basic_metrics?page_no=2&page_size=100",
      method: "GET",
      headers: undefined,
      signal: undefined,
    });
  });

  test("listBasicMetrics sends a bare path when no params are set", async () => {
    const { client, requestJson } = mockClient();
    await listBasicMetrics(client, "ft-xxx");
    expect(requestJson.mock.calls[0]?.[0].path).toBe("/api/v1/fine-tunes/ft-xxx/basic_metrics");
    expect(requestJson.mock.calls[0]?.[0].headers).toBeUndefined();
  });

  test("listBasicMetrics sends the workspace header when provided", async () => {
    const { client, requestJson } = mockClient();
    await listBasicMetrics(client, "ft-xxx", { workspaceId: "ws-123" });
    expect(requestJson.mock.calls[0]?.[0].headers).toEqual({
      "X-DashScope-WorkSpace": "ws-123",
    });
  });
});
