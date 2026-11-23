import { describe, expect, test, vi } from "vite-plus/test";
import type { Client } from "../src/client/client.ts";
import {
  createDeployment,
  deleteDeployment,
  listModelRoutingVersions,
  modelRoutingVersionsPath,
  updateDeployment,
  type CreateModelRouterRequest,
  type ListModelRoutingVersionsResponse,
  type ModelRoutingConfig,
  type UpdateModelRouterRequest,
} from "../src/deploy/index.ts";

function mockClient(response: unknown = {}) {
  const requestJson = vi.fn<Client["requestJson"]>().mockResolvedValue(response);
  return { client: { requestJson } as unknown as Client, requestJson };
}

const routingConfig: ModelRoutingConfig = {
  route_model_version: "router-v1",
  strategy: "EFFECT_FIRST",
  candidate_model_ids: ["qwen-plus", "qwen-max"],
  offline_model_ids: ["qwen-offline"],
  future_config: { enabled: false },
};

const createBody: CreateModelRouterRequest = {
  name: "production-router",
  plan: "mr",
  charge_type: "post_paid",
  routing_config: routingConfig,
};

const updateBody: UpdateModelRouterRequest = {
  routing_config: {
    ...routingConfig,
    strategy: "COST_FIRST",
  },
};

const deployedModel = "router /?#%&+";
const encodedDeployment = "/api/v1/deployments/router%20%2F%3F%23%25%26%2B";

describe("model-routing versions", () => {
  test("uses the fixed endpoint with no query when params are omitted", async () => {
    const { client, requestJson } = mockClient();
    await listModelRoutingVersions(client);
    expect(modelRoutingVersionsPath()).toBe("/api/v1/deployments/model-routing/versions");
    expect(requestJson).toHaveBeenCalledExactlyOnceWith({
      path: "/api/v1/deployments/model-routing/versions",
      method: "GET",
      signal: undefined,
    });
  });

  test("maps explicit pagination and forwards the signal", async () => {
    const { client, requestJson } = mockClient();
    const signal = new AbortController().signal;
    await listModelRoutingVersions(client, { pageNo: 2, pageSize: 50, signal });
    expect(requestJson).toHaveBeenCalledExactlyOnceWith({
      path: "/api/v1/deployments/model-routing/versions?page_no=2&page_size=50",
      method: "GET",
      signal,
    });
  });

  test("preserves pagination records and unknown fields verbatim", async () => {
    const response: ListModelRoutingVersionsResponse = {
      request_id: "request-1",
      output: {
        route_model_versions: [
          {
            route_model_version: "router-v1",
            supported_strategies: ["EFFECT_FIRST", "COST_FIRST"],
            supported_candidate_model_ids: ["qwen-plus", "qwen-max"],
            offline_model_ids: [],
            future_version_field: { enabled: false },
          },
        ],
        total: 1,
        total_page: 1,
        page_no: 1,
        page_size: 20,
        future_page_field: 0,
      },
      future_response_field: false,
    };
    const { client } = mockClient(response);
    const result = await listModelRoutingVersions(client);
    expect(result).toBe(response);
    expect(result).toStrictEqual(response);
  });
});

describe("model-router deployment writes", () => {
  test("creates with the exact POST body", async () => {
    const response = { output: { deployed_model: deployedModel, routing_config: routingConfig } };
    const { client, requestJson } = mockClient(response);
    const signal = new AbortController().signal;
    expect(await createDeployment(client, createBody, signal)).toBe(response);
    expect(requestJson).toHaveBeenCalledExactlyOnceWith({
      path: "/api/v1/deployments",
      method: "POST",
      body: createBody,
      signal,
    });
    expect(requestJson.mock.calls[0][0].body).toBe(createBody);
  });

  test("updates an encoded deployment ID with the complete PUT body", async () => {
    const response = {
      output: { deployed_model: deployedModel, routing_config: updateBody.routing_config },
    };
    const { client, requestJson } = mockClient(response);
    const signal = new AbortController().signal;
    expect(await updateDeployment(client, deployedModel, updateBody, signal)).toBe(response);
    expect(requestJson).toHaveBeenCalledExactlyOnceWith({
      path: `${encodedDeployment}/update`,
      method: "PUT",
      body: updateBody,
      signal,
    });
    expect(requestJson.mock.calls[0][0].body).toBe(updateBody);
  });

  test("deletes an encoded deployment ID without a body", async () => {
    const response = { output: { deployed_model: deployedModel, deleted: true } };
    const { client, requestJson } = mockClient(response);
    expect(await deleteDeployment(client, deployedModel)).toBe(response);
    expect(requestJson).toHaveBeenCalledExactlyOnceWith({
      path: encodedDeployment,
      method: "DELETE",
      signal: undefined,
    });
    expect(requestJson.mock.calls[0][0]).not.toHaveProperty("body");
  });

  test.each([
    ["versions", (client: Client) => listModelRoutingVersions(client)],
    ["create", (client: Client) => createDeployment(client, createBody)],
    ["update", (client: Client) => updateDeployment(client, deployedModel, updateBody)],
    ["delete", (client: Client) => deleteDeployment(client, deployedModel)],
  ])("does not retry the same %s failure", async (_name, run) => {
    const error = new Error("original client failure");
    const { client, requestJson } = mockClient();
    requestJson.mockRejectedValue(error);
    await expect(run(client)).rejects.toBe(error);
    expect(requestJson).toHaveBeenCalledOnce();
  });
});
