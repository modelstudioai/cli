import { describe, expect, test, vi } from "vite-plus/test";
import {
  cancelFineTune,
  createFineTune,
  deleteFineTune,
  exportCheckpoint,
  getFineTune,
  getFineTuneLogs,
  getProfile,
  isTrainingTypeCli,
  listCheckpoints,
  listFineTunes,
  type Client,
  type CreateFineTuneRequest,
} from "../src/index.ts";

function mockClient(response: unknown = {}) {
  const requestJson = vi.fn<Client["requestJson"]>().mockResolvedValue(response);
  return { client: { requestJson } as unknown as Client, requestJson };
}

const OPD_BODY: CreateFineTuneRequest = {
  model: "qwen3.5-9b",
  training_type: "pg_opd",
  teacher_model: "qwen3.8-flash",
  training_datasets: [{ type: "training", data_source_type: "file_id", file_id: "file-train" }],
  validation_datasets: [{ type: "validation", data_source_type: "file_id", file_id: "file-val" }],
  hyper_parameters: { n_epochs: 1, learning_rate: "1e-6" },
  resource_config: { charge_type: "mtu_postpaid", mtu_spec_code: "MTU4", mtu_capacity: 16 },
};

describe("fine-tune OPD API shapes", () => {
  test("createFineTune forwards the OPD body verbatim (descriptors, teacher, resource_config)", async () => {
    const { client, requestJson } = mockClient();
    await createFineTune(client, OPD_BODY);
    expect(requestJson).toHaveBeenCalledWith({
      path: "/api/v1/fine-tunes",
      method: "POST",
      body: OPD_BODY,
      headers: undefined,
      signal: undefined,
    });
  });

  test("createFineTune sends the workspace header only when provided", async () => {
    const withWorkspace = mockClient();
    await createFineTune(withWorkspace.client, OPD_BODY, undefined, "ws-123");
    expect(withWorkspace.requestJson.mock.calls[0]?.[0].headers).toEqual({
      "X-DashScope-WorkSpace": "ws-123",
    });

    const withoutWorkspace = mockClient();
    await createFineTune(withoutWorkspace.client, OPD_BODY);
    expect(withoutWorkspace.requestJson.mock.calls[0]?.[0].headers).toBeUndefined();
  });

  test("job read/action wrappers send the workspace header only when provided", async () => {
    const calls: Array<{
      invoke: (client: Client, workspaceId?: string) => Promise<unknown>;
      path: string;
      method: string;
    }> = [
      {
        invoke: (client, workspaceId) => getFineTune(client, "ft-xxx", undefined, workspaceId),
        path: "/api/v1/fine-tunes/ft-xxx",
        method: "GET",
      },
      {
        invoke: (client, workspaceId) => cancelFineTune(client, "ft-xxx", undefined, workspaceId),
        path: "/api/v1/fine-tunes/ft-xxx/cancel",
        method: "POST",
      },
      {
        invoke: (client, workspaceId) => deleteFineTune(client, "ft-xxx", undefined, workspaceId),
        path: "/api/v1/fine-tunes/ft-xxx",
        method: "DELETE",
      },
      {
        invoke: (client, workspaceId) => listCheckpoints(client, "ft-xxx", undefined, workspaceId),
        path: "/api/v1/fine-tunes/ft-xxx/checkpoints",
        method: "GET",
      },
      {
        invoke: (client, workspaceId) =>
          exportCheckpoint(client, "ft-xxx", "ckpt-1", "my-model", undefined, workspaceId),
        path: "/api/v1/fine-tunes/ft-xxx/export/ckpt-1?model_name=my-model",
        method: "GET",
      },
    ];
    for (const { invoke, path, method } of calls) {
      const withWorkspace = mockClient();
      await invoke(withWorkspace.client, "ws-123");
      expect(withWorkspace.requestJson.mock.calls[0]?.[0]).toMatchObject({
        path,
        method,
        headers: { "X-DashScope-WorkSpace": "ws-123" },
      });

      const withoutWorkspace = mockClient();
      await invoke(withoutWorkspace.client);
      expect(withoutWorkspace.requestJson.mock.calls[0]?.[0].headers).toBeUndefined();
    }
  });

  test("listFineTunes / getFineTuneLogs forward pagination and workspace", async () => {
    const list = mockClient();
    await listFineTunes(list.client, { pageNo: 2, pageSize: 20, workspaceId: "ws-123" });
    expect(list.requestJson.mock.calls[0]?.[0]).toMatchObject({
      path: "/api/v1/fine-tunes?page_no=2&page_size=20",
      method: "GET",
      headers: { "X-DashScope-WorkSpace": "ws-123" },
    });

    const logs = mockClient();
    await getFineTuneLogs(logs.client, "ft-xxx", { pageNo: 1, pageSize: 100 });
    expect(logs.requestJson.mock.calls[0]?.[0]).toMatchObject({
      path: "/api/v1/fine-tunes/ft-xxx/logs?page_no=1&page_size=100",
      method: "GET",
      headers: undefined,
    });
  });
});

describe("pg-opd profile", () => {
  test("resolves with server type pg_opd and chatml validation", () => {
    const profile = getProfile("pg-opd");
    expect(profile.serverTrainingType).toBe("pg_opd");
    expect(profile.acceptedExtensions).toEqual([".jsonl"]);
  });

  test("fills no hyper-parameter defaults and skips sft-only gates", () => {
    const profile = getProfile("pg-opd");
    expect(profile.resolveHyperParameters("text", { nEpochs: 4, batchSize: 64 })).toEqual({});
    expect(profile.shouldSkipGate("batch_size", "text")).toBe(true);
    expect(profile.shouldSkipCapabilityCheck("text")).toBe(true);
  });

  test("stays unreachable from the text-create training-type whitelist", () => {
    expect(isTrainingTypeCli("pg-opd")).toBe(false);
    expect(isTrainingTypeCli("pg_opd")).toBe(false);
  });
});
