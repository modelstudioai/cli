import { describe, expect, test, vi } from "vite-plus/test";
import {
  createCustomModelImport,
  deleteCustomModelImport,
  findSupportImportModel,
  getCustomModelImport,
  listCustomModelImports,
  listSupportImportModels,
  LIST_SUPPORT_IMPORT_MODELS_API,
  requiredTrainTypeForWeightType,
  type Client,
} from "../src/index.ts";

function mockClient(response: unknown = {}) {
  const requestJson = vi.fn<Client["requestJson"]>().mockResolvedValue(response);
  return { client: { requestJson } as unknown as Client, requestJson };
}

describe("custom model import API", () => {
  test("maps create, get, list, and delete endpoints", async () => {
    const { client, requestJson } = mockClient();
    await createCustomModelImport(client, {
      model_name: "qwen3-32b",
      source: "oss",
      weight_type: "lora",
      storage_info: { bucket_name: "my-model-bucket", object_key: "models/qwen3-32b-lora/" },
    });
    await getCustomModelImport(client, "job /?#");
    await listCustomModelImports(client, {
      pageNo: 2,
      pageSize: 20,
      status: "RUNNING",
      modelName: "qwen3-32b-offline-20240101-abc1",
    });
    await deleteCustomModelImport(client, "job /?#");

    expect(requestJson.mock.calls.map(([options]) => [options.method, options.path])).toEqual([
      ["POST", "https://dashscope.aliyuncs.com/api/v1/custom_models/import"],
      ["GET", "https://dashscope.aliyuncs.com/api/v1/custom_models/import/job%20%2F%3F%23"],
      [
        "GET",
        "https://dashscope.aliyuncs.com/api/v1/custom_models/import?page_no=2&page_size=20&status=RUNNING&model_name=qwen3-32b-offline-20240101-abc1",
      ],
      ["DELETE", "https://dashscope.aliyuncs.com/api/v1/custom_models/import/job%20%2F%3F%23"],
    ]);
    expect(requestJson.mock.calls[0]?.[0].body).toEqual({
      model_name: "qwen3-32b",
      source: "oss",
      weight_type: "lora",
      storage_info: { bucket_name: "my-model-bucket", object_key: "models/qwen3-32b-lora/" },
    });
  });

  test("keeps list query empty when no filters are provided", async () => {
    const { client, requestJson } = mockClient();
    await listCustomModelImports(client);
    expect(requestJson).toHaveBeenCalledWith({
      path: "https://dashscope.aliyuncs.com/api/v1/custom_models/import",
      method: "GET",
      signal: undefined,
    });
  });
});

describe("console-supported import model catalog", () => {
  test("calls listSupportImportModels with an empty business payload and unwraps DataV2", async () => {
    const consoleCall = vi
      .fn<Client["console"]>()
      .mockResolvedValue(gatewayResponse([{ model: "qwen3-32b", supportTrainTypes: ["sft"] }]));
    const client = { console: consoleCall } as unknown as Client;

    const result = await listSupportImportModels(client);

    expect(consoleCall).toHaveBeenCalledWith(LIST_SUPPORT_IMPORT_MODELS_API, {});
    expect(result.total).toBe(1);
    expect(result.list).toEqual([{ model: "qwen3-32b", supportTrainTypes: ["sft"] }]);
  });

  test("matches the catalog model ID case-insensitively", () => {
    const models = [{ model: "qwen3-32b" }, { model: "deepseek-v4-flash-0731" }];
    expect(findSupportImportModel(models, "Qwen3-32B")?.model).toBe("qwen3-32b");
    expect(findSupportImportModel(models, "qwen3-8b")).toBeUndefined();
  });

  test("maps import weight types onto console train types", () => {
    expect(requiredTrainTypeForWeightType("lora")).toBe("efficient_sft");
    expect(requiredTrainTypeForWeightType("full")).toBe("sft");
  });
});

/** Mirrors the real console gateway envelope (DataV2 double wrap). */
function gatewayResponse(list: unknown[]) {
  return {
    code: "200",
    data: {
      DataV2: {
        ret: ["SUCCESS::接口调用成功"],
        data: {
          code: "200",
          data: { total: list.length, pageNo: 1, pageSize: list.length, list },
          success: true,
          appName: "broadscope",
        },
      },
      success: true,
    },
  };
}
