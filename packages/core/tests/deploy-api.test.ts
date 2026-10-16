import { describe, expect, expectTypeOf, test, vi } from "vite-plus/test";
import {
  deploymentCapacityInstancesPath,
  deploymentCapacityInstancePath,
  deploymentCapacityOperationPath,
  listCapacityInstances,
  getCapacityInstance,
  getCapacityOperation,
  listDeployments,
  getDeployment,
  type Client,
  type ReservationCapacity,
  type PrePaidInfo,
  type CapacityInstance,
  type CapacityOperation,
  type Deployment,
  type CreateDeploymentRequest,
  type PtuCapacity,
  type ListCapacityInstancesParams,
  type ListCapacityInstancesResponse,
  type GetCapacityInstanceResponse,
  type GetCapacityOperationResponse,
  type ListDeploymentsParams,
  type ListDeploymentsResponse,
  type GetDeploymentResponse,
} from "../src/index.ts";

function mockClient(response: unknown = {}) {
  const requestJson = vi.fn<Client["requestJson"]>().mockResolvedValue(response);
  return { client: { requestJson } as unknown as Client, requestJson };
}

const code = "model /?#%&+";
const identifier = "000900719925474099312345/实例 ?#%&+";
const encodedDeployment = "/api/v1/deployments/model%20%2F%3F%23%25%26%2B";
const encodedIdentifier = "000900719925474099312345%2F%E5%AE%9E%E4%BE%8B%20%3F%23%25%26%2B";

const capacity: ReservationCapacity = { input_tpm: 0, output_tpm: 0, future_quota: 0 };
const prepaid: PrePaidInfo = {
  duration: 30,
  auto_renewal: false,
  auto_renewal_duration: 0,
  auto_renewal_cycle: "FUTURE_CYCLE",
  future_flag: false,
};
const instance: CapacityInstance = {
  model_service_id: code,
  instance_id: identifier,
  charge_type: "FUTURE_CHARGE_TYPE",
  status: "FUTURE_INSTANCE_STATE",
  deleted: false,
  effective_capacity: capacity,
  configured_capacity: capacity,
  target_capacity: null,
  pre_paid_info: prepaid,
  gmt_expired: "2026-10-01T00:00:00Z",
  can_scale: false,
  can_renew: false,
  can_delete: false,
  fail_reason: "original failure reason",
  gmt_created: "2026-09-01T00:00:00Z",
  gmt_modified: "2026-09-02T00:00:00Z",
  gmt_deleted: "",
  future_instance_field: { enabled: false, quota: 0 },
};

const queries = [
  {
    name: "listCapacityInstances",
    path: `${encodedDeployment}/capacity-instances`,
    run: (client: Client, signal?: AbortSignal) => listCapacityInstances(client, code, { signal }),
  },
  {
    name: "getCapacityInstance",
    path: `${encodedDeployment}/capacity-instances/${encodedIdentifier}`,
    run: (client: Client, signal?: AbortSignal) =>
      getCapacityInstance(client, code, identifier, signal),
  },
  {
    name: "getCapacityOperation",
    path: `${encodedDeployment}/capacity-operations/${encodedIdentifier}`,
    run: (client: Client, signal?: AbortSignal) =>
      getCapacityOperation(client, code, identifier, signal),
  },
];

describe("deployment capacity path builders", () => {
  test("encodes each dynamic segment without converting opaque identifiers", () => {
    expect(deploymentCapacityInstancesPath(code)).toBe(`${encodedDeployment}/capacity-instances`);
    expect(deploymentCapacityInstancePath(code, identifier)).toBe(
      `${encodedDeployment}/capacity-instances/${encodedIdentifier}`,
    );
    expect(deploymentCapacityOperationPath(code, identifier)).toBe(
      `${encodedDeployment}/capacity-operations/${encodedIdentifier}`,
    );
  });
});

describe.each(queries)("$name read-only request", ({ path, run }) => {
  test.each([false, true])("uses GET without a body; signal supplied: %s", async (withSignal) => {
    const { client, requestJson } = mockClient();
    const signal = withSignal ? new AbortController().signal : undefined;
    await run(client, signal);
    expect(requestJson).toHaveBeenCalledExactlyOnceWith({ path, method: "GET", signal });
    expect(requestJson.mock.calls[0][0]).not.toHaveProperty("body");
    expect(requestJson.mock.calls[0][0].signal).toBe(signal);
  });

  test("passes an aborted signal through and preserves the client's rejection", async () => {
    const { client, requestJson } = mockClient();
    const controller = new AbortController();
    const error = new Error("client request aborted");
    controller.abort(error);
    requestJson.mockRejectedValueOnce(error);
    await expect(run(client, controller.signal)).rejects.toBe(error);
    expect(requestJson).toHaveBeenCalledExactlyOnceWith({
      path,
      method: "GET",
      signal: controller.signal,
    });
  });
});

describe("listCapacityInstances", () => {
  test("omits all unprovided query fields, including when params are omitted", async () => {
    const { client, requestJson } = mockClient();
    await listCapacityInstances(client, code);
    await listCapacityInstances(client, code, {
      pageNo: undefined,
      pageSize: undefined,
      includeDeleted: undefined,
      statuses: undefined,
      chargeTypes: undefined,
    });
    expect(requestJson).toHaveBeenCalledTimes(2);
    for (const [request] of requestJson.mock.calls) {
      expect(request).toStrictEqual({
        path: `${encodedDeployment}/capacity-instances`,
        method: "GET",
        signal: undefined,
      });
    }
  });

  test.each([false, true])(
    "encodes filters and sends includeDeleted=%s",
    async (includeDeleted) => {
      const { client, requestJson } = mockClient();
      const signal = new AbortController().signal;
      const params: ListCapacityInstancesParams = {
        pageNo: 2,
        pageSize: 20,
        includeDeleted,
        statuses: ["RUNNING", "STOPPED", "FUTURE /?&+="],
        chargeTypes: ["pre_paid", "post_paid"],
        signal,
      };
      await listCapacityInstances(client, code, params);
      expect(requestJson).toHaveBeenCalledExactlyOnceWith({
        path:
          `${encodedDeployment}/capacity-instances?page_no=2&page_size=20` +
          `&include_deleted=${includeDeleted}` +
          "&statuses=RUNNING%2CSTOPPED%2CFUTURE+%2F%3F%26%2B%3D&charge_types=pre_paid%2Cpost_paid",
        method: "GET",
        signal,
      });
    },
  );

  test("forwards explicitly provided zero pagination and empty filters without defaults", async () => {
    const { client, requestJson } = mockClient();
    await listCapacityInstances(client, code, {
      pageNo: 0,
      pageSize: 0,
      statuses: [],
      chargeTypes: [],
    });
    expect(requestJson).toHaveBeenCalledExactlyOnceWith({
      path: `${encodedDeployment}/capacity-instances?page_no=0&page_size=0&statuses=&charge_types=`,
      method: "GET",
      signal: undefined,
    });
  });

  test.each(["output", "data"] as const)(
    "preserves %s records and pagination verbatim",
    async (envelope) => {
      const page = {
        records: [instance],
        items: 27,
        page: 2,
        itemsPerPage: 20,
        pageCount: 2,
        future_page_flag: false,
      };
      const response: ListCapacityInstancesResponse = {
        request_id: "query-request",
        [envelope]: page,
        future_response_field: 0,
      };
      const { client } = mockClient(response);
      const result = await listCapacityInstances(client, code);
      expect(result).toBe(response);
      expect(result[envelope]).toStrictEqual(page);
      expect(result[envelope]?.records?.[0].effective_capacity?.input_tpm).toBe(0);
      expect(result[envelope]?.records?.[0].deleted).toBe(false);
      expect(result.future_response_field).toBe(0);
    },
  );

  test("preserves empty pages and zero totals", async () => {
    const response: ListCapacityInstancesResponse = {
      output: { records: [], items: 0, page: 1, itemsPerPage: 20, pageCount: 0 },
    };
    const { client } = mockClient(response);
    expect(await listCapacityInstances(client, code)).toBe(response);
  });
});

describe("capacity query responses", () => {
  test.each(["output", "data"] as const)(
    "preserves instance %s, zero capacity, false flags and unknown fields",
    async (envelope) => {
      const response: GetCapacityInstanceResponse = {
        request_id: "instance-query",
        [envelope]: instance,
        future_response_flag: false,
      };
      const { client } = mockClient(response);
      const result = await getCapacityInstance(client, code, identifier);
      expect(result).toBe(response);
      expect(result[envelope]).toStrictEqual(instance);
      expect(result[envelope]?.instance_id).toBe(identifier);
      expect(result[envelope]?.effective_capacity).toStrictEqual(capacity);
      expect(result[envelope]?.pre_paid_info).toStrictEqual(prepaid);
      expect(result[envelope]?.target_capacity).toBeNull();
      expect(result[envelope]?.can_scale).toBe(false);
      expect(result[envelope]?.can_renew).toBe(false);
      expect(result[envelope]?.can_delete).toBe(false);
      expect(result.future_response_flag).toBe(false);
    },
  );

  test.each(["output", "data"] as const)(
    "preserves operation %s and distinct query/original request IDs",
    async (envelope) => {
      const operation: CapacityOperation = {
        operation_id: "000900719925474099312345",
        request_id: "original-request",
        operation_type: "FUTURE_OPERATION",
        operation_status: "FUTURE_OPERATION_STATE",
        model_service_id: code,
        instance_id: identifier,
        from_status: "FUTURE_FROM_STATE",
        current_status: "FUTURE_CURRENT_STATE",
        error_code: "original.error.code",
        error_message: "Original service error message",
        gmt_created: "2026-09-01T00:00:00Z",
        gmt_finished: "2026-09-02T00:00:00Z",
        future_operation_flag: false,
      };
      const response: GetCapacityOperationResponse = {
        request_id: "poll-request",
        [envelope]: operation,
        future_response_field: 0,
      };
      const { client } = mockClient(response);
      const result = await getCapacityOperation(client, code, operation.operation_id!);
      expect(result).toBe(response);
      expect(result[envelope]).toStrictEqual(operation);
      expect(result.request_id).toBe("poll-request");
      expect(result[envelope]?.request_id).toBe("original-request");
      expect(result[envelope]?.operation_id).toBe("000900719925474099312345");
      expect(result.future_response_field).toBe(0);
    },
  );

  test("returns FAILED operations without translating service errors", async () => {
    const response: GetCapacityOperationResponse = {
      output: {
        operation_status: "FAILED",
        error_code: "ORIGINAL_CODE",
        error_message: "Original message",
      },
    };
    const { client } = mockClient(response);
    expect(await getCapacityOperation(client, code, identifier)).toBe(response);
  });
});

describe("existing deployment queries", () => {
  test("sends plan and existing pagination, but never sends the removed status filter", async () => {
    const response: ListDeploymentsResponse = { output: { deployments: [], total: 0 } };
    const { client, requestJson } = mockClient(response);
    const signal = new AbortController().signal;
    // Extra properties from an older caller must not leak into the request.
    const params = { pageNo: 2, pageSize: 10, plan: "ptu", status: "RUNNING", signal };
    expect(await listDeployments(client, params)).toBe(response);
    expect(requestJson).toHaveBeenCalledExactlyOnceWith({
      path: "/api/v1/deployments?page_no=2&page_size=10&plan=ptu",
      method: "GET",
      signal,
    });
    expectTypeOf<ListDeploymentsParams>().not.toHaveProperty("status");
  });

  test("omits absent plan/pagination and URL-encodes provided plan", async () => {
    const { client, requestJson } = mockClient();
    await listDeployments(client);
    await listDeployments(client, { plan: "future /?&+=" });
    expect(requestJson).toHaveBeenNthCalledWith(1, {
      path: "/api/v1/deployments",
      method: "GET",
      signal: undefined,
    });
    expect(requestJson).toHaveBeenNthCalledWith(2, {
      path: "/api/v1/deployments?plan=future+%2F%3F%26%2B%3D",
      method: "GET",
      signal: undefined,
    });
  });

  test.each(["output", "data"] as const)(
    "preserves deployment throughput fields in %s without changing legacy PTU input",
    async (envelope) => {
      const deployment: Deployment = {
        deployed_model: code,
        ptu_capacity: capacity,
        ptu_service_tier: "FUTURE_TIER",
        pre_paid_info: prepaid,
        pre_paid_instance_id: identifier,
        pre_paid_gmt_expired: "2026-10-01T00:00:00Z",
        overflow_strategy: "FUTURE_STRATEGY",
        fail_reason: "original failure",
        operation_id: "000900719925474099312345",
        instance_id: identifier,
        future_deployment_flag: false,
      };
      const response: GetDeploymentResponse = {
        request_id: "deployment-query",
        [envelope]: deployment,
      };
      const { client, requestJson } = mockClient(response);
      const signal = new AbortController().signal;
      expect(await getDeployment(client, code, signal)).toBe(response);
      expect(requestJson).toHaveBeenCalledExactlyOnceWith({
        path: encodedDeployment,
        method: "GET",
        signal,
      });
      expectTypeOf<Deployment["ptu_capacity"]>().toEqualTypeOf<ReservationCapacity | undefined>();
      expectTypeOf<CreateDeploymentRequest["ptu_capacity"]>().toEqualTypeOf<
        PtuCapacity | undefined
      >();
      expectTypeOf<PtuCapacity["thinking_output_tpm"]>().toEqualTypeOf<number | undefined>();
    },
  );
});
