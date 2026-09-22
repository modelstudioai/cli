import { afterEach, beforeEach, describe, expect, expectTypeOf, test, vi } from "vite-plus/test";
import { Client } from "../src/client/client.ts";
import {
  buildPrepaidInfo,
  buildReservationCapacity,
  createCapacityInstance,
  createDeployment,
  deleteCapacityInstance,
  deleteDeployment,
  deploymentCapacityInstanceRenewPath,
  deploymentCapacityInstanceScalePath,
  deploymentOverflowPath,
  hasPrepaidFlags,
  pickPlanStrategy,
  renewCapacityInstance,
  scaleCapacityInstance,
  scaleDeployment,
  updateDeploymentOverflow,
  validatePrepaidFlags,
  validateReservationCapacity,
  type CapacityOperationResponse,
  type CapacityWriteOptions,
  type CreateCapacityInstanceRequest,
  type CreateDeploymentRequest,
  type CreatePlanFlags,
  type DeleteDeploymentResponse,
  type GetCapacityOperationResponse,
  type PlanContext,
  type PrePaidInfo,
  type RenewCapacityInstanceRequest,
  type ReservationCapacity,
  type ReservationFlags,
  type ScaleCapacityInstanceRequest,
  type ScaleDeploymentRequest,
} from "../src/deploy/index.ts";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected network request")));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockClient(response: unknown = {}) {
  const requestJson = vi.fn<Client["requestJson"]>().mockResolvedValue(response);
  return { client: { requestJson } as unknown as Client, requestJson };
}

function offlineClient(): Client {
  const baseUrl = "https://offline.invalid";
  return new Client({
    identity: {
      binName: "test-cli",
      version: "0.0.0-test",
      npmPackage: "test-cli",
      clientName: "test-client",
    },
    settings: {
      output: "json",
      outputExplicit: true,
      timeout: 5,
      watermark: true,
      verbose: false,
      quiet: true,
      dryRun: false,
      telemetry: false,
    },
    baseUrl,
    apiCred: { token: "offline-test-only", baseUrl, source: "flag" },
  });
}

const code = "model /?#%&+";
const instanceId = "000900719925474099312345/实例 ?#%&+";
const encodedDeployment = "/api/v1/deployments/model%20%2F%3F%23%25%26%2B";
const encodedInstance =
  `${encodedDeployment}/capacity-instances/` +
  "000900719925474099312345%2F%E5%AE%9E%E4%BE%8B%20%3F%23%25%26%2B";
const capacity: ReservationCapacity = { input_tpm: 0, output_tpm: 0 };
const prepaid: PrePaidInfo = { duration: 30, auto_renewal: false };
const createBody: CreateCapacityInstanceRequest = {
  billing_method: "PRE_PAY",
  ptu_capacity: capacity,
  pre_paid_info: prepaid,
};
const scaleBody: ScaleCapacityInstanceRequest = {
  ptu_capacity: capacity,
  pre_paid_info: prepaid,
  order_type: "DOWNGRADE",
};
const renewBody: RenewCapacityInstanceRequest = {
  pre_paid_info: prepaid,
  is_change: false,
};
const writes = [
  {
    name: "createCapacityInstance",
    path: `${encodedDeployment}/capacity-instances`,
    method: "POST",
    body: createBody,
    run: (client: Client, options?: CapacityWriteOptions) =>
      createCapacityInstance(client, code, createBody, options),
  },
  {
    name: "scaleCapacityInstance",
    path: `${encodedInstance}/scale`,
    method: "PUT",
    body: scaleBody,
    run: (client: Client, options?: CapacityWriteOptions) =>
      scaleCapacityInstance(client, code, instanceId, scaleBody, options),
  },
  {
    name: "renewCapacityInstance",
    path: `${encodedInstance}/renew`,
    method: "PUT",
    body: renewBody,
    run: (client: Client, options?: CapacityWriteOptions) =>
      renewCapacityInstance(client, code, instanceId, renewBody, options),
  },
  {
    name: "deleteCapacityInstance",
    path: encodedInstance,
    method: "DELETE",
    body: undefined,
    run: (client: Client, options?: CapacityWriteOptions) =>
      deleteCapacityInstance(client, code, instanceId, options),
  },
];

function idHeaders(requestId: string) {
  return { "x-acs-req-uuid": requestId, "X-DashScope-RequestId": requestId };
}

function expectBilingual(error: string | undefined, flag?: string) {
  expect(error).toMatch(/[A-Za-z]/);
  expect(error).toMatch(/[\u4e00-\u9fff]/);
  if (flag) expect(error).toContain(flag);
}

describe("reservation write paths", () => {
  test("encodes opaque path segments and appends exact action suffixes", () => {
    expect(deploymentCapacityInstanceScalePath(code, instanceId)).toBe(`${encodedInstance}/scale`);
    expect(deploymentCapacityInstanceRenewPath(code, instanceId)).toBe(`${encodedInstance}/renew`);
    expect(deploymentOverflowPath(code)).toBe(`${encodedDeployment}/update-overflowstrategy`);
  });
});

describe.each(writes)("$name", ({ path, method, body, run }) => {
  test.each([undefined, "", "caller-owned-request"])(
    "uses exact request shape and does not invent request IDs: %s",
    async (requestId) => {
      const { client, requestJson } = mockClient();
      const signal = new AbortController().signal;
      const options = Object.freeze({ requestId, signal });
      await run(client, options);
      expect(requestJson).toHaveBeenCalledExactlyOnceWith({
        path,
        method,
        ...(body === undefined ? {} : { body }),
        headers: requestId ? idHeaders(requestId) : undefined,
        signal,
      });
      const request = requestJson.mock.calls[0][0];
      expect(request.signal).toBe(signal);
      if (body === undefined) expect(request).not.toHaveProperty("body");
      else expect(request.body).toBe(body);
    },
  );

  test("accepts omitted options without adding an idempotency header", async () => {
    const { client, requestJson } = mockClient();
    await run(client);
    expect(requestJson).toHaveBeenCalledOnce();
    expect(requestJson.mock.calls[0][0].headers).toBeUndefined();
    expect(requestJson.mock.calls[0][0].signal).toBeUndefined();
  });

  test.each(["PROCESSING", "SUCCEEDED", "FAILED"])(
    "returns %s operations verbatim in either response envelope",
    async (operationStatus) => {
      for (const envelope of ["output", "data"] as const) {
        const response: CapacityOperationResponse = {
          request_id: "http-request",
          [envelope]: {
            operation_id: "000900719925474099312345",
            request_id: "original-operation-request",
            operation_status: operationStatus,
            error_code: "ORIGINAL_CODE",
            error_message: "原始错误 / original service message",
            future_field: false,
          },
        };
        const { client, requestJson } = mockClient(response);
        expect(await run(client)).toBe(response);
        expect(requestJson).toHaveBeenCalledOnce();
      }
    },
  );

  test("passes cancellation and client errors through without retry", async () => {
    const { client, requestJson } = mockClient();
    const controller = new AbortController();
    const error = new Error("client aborted");
    controller.abort(error);
    requestJson.mockRejectedValue(error);
    await expect(run(client, { signal: controller.signal, requestId: "same-id" })).rejects.toBe(
      error,
    );
    expect(requestJson).toHaveBeenCalledOnce();
    expect(requestJson.mock.calls[0][0].signal).toBe(controller.signal);
  });

  test.each([undefined, "wire-request-id"])(
    "serializes zero/false and both request headers through Client with mocked fetch: %s",
    async (requestId) => {
      const response: CapacityOperationResponse = {
        output: {
          operation_status: "FAILED",
          error_code: "SERVICE_FAILURE",
          error_message: "Original error",
        },
      };
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
      vi.stubGlobal("fetch", fetchMock);
      expect(await run(offlineClient(), { requestId })).toEqual(response);
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(`https://offline.invalid${path}`);
      expect(options?.method).toBe(method);
      expect(options?.body).toBe(body === undefined ? undefined : JSON.stringify(body));
      const headers = new Headers(options?.headers);
      expect(headers.get("x-acs-req-uuid")).toBe(requestId ?? null);
      expect(headers.get("X-DashScope-RequestId")).toBe(requestId ?? null);
      expect(headers.get("Content-Type")).toBe("application/json");
    },
  );

  test.each([409, 503])("does not retry HTTP %s service errors", async (status) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ code: "ORIGINAL_CODE", message: "原始服务端错误" }, { status }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(run(offlineClient(), { requestId: "fixed-id" })).rejects.toMatchObject({
      message: "原始服务端错误",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("specific write bodies and legacy compatibility", () => {
  test("postpaid instance creation omits prepaid information", async () => {
    const { client, requestJson } = mockClient();
    const body: CreateCapacityInstanceRequest = {
      billing_method: "POST_PAY",
      ptu_capacity: capacity,
    };
    await createCapacityInstance(client, code, body);
    expect(requestJson.mock.calls[0][0].body).toStrictEqual(body);
    expect(body).not.toHaveProperty("pre_paid_info");
  });

  test("renew with changed capacity has no order_type or body instance_id", async () => {
    const { client, requestJson } = mockClient();
    const body: RenewCapacityInstanceRequest = {
      pre_paid_info: prepaid,
      is_change: true,
      ptu_capacity: capacity,
    };
    await renewCapacityInstance(client, code, instanceId, body);
    expect(requestJson.mock.calls[0][0].body).toStrictEqual(body);
    expectTypeOf<RenewCapacityInstanceRequest>().not.toHaveProperty("order_type");
    expectTypeOf<RenewCapacityInstanceRequest>().not.toHaveProperty("instance_id");
    expectTypeOf<CapacityOperationResponse>().toEqualTypeOf<GetCapacityOperationResponse>();
  });

  test.each([undefined, "", "释放 /?&+#%= 原因"])(
    "DELETE sends optional reason only as encoded query: %s",
    async (reason) => {
      const { client, requestJson } = mockClient();
      const expectedQuery =
        reason === undefined
          ? ""
          : reason === ""
            ? "?reason="
            : "?reason=%E9%87%8A%E6%94%BE+%2F%3F%26%2B%23%25%3D+%E5%8E%9F%E5%9B%A0";
      await deleteCapacityInstance(client, code, instanceId, { reason, requestId: "delete-id" });
      expect(requestJson).toHaveBeenCalledExactlyOnceWith({
        path: `${encodedInstance}${expectedQuery}`,
        method: "DELETE",
        headers: idHeaders("delete-id"),
        signal: undefined,
      });
      expect(requestJson.mock.calls[0][0]).not.toHaveProperty("body");
    },
  );

  test.each(["enable", "disable"] as const)(
    "updates deployment overflow to %s",
    async (strategy) => {
      const response = { output: { deployed_model: code, overflow_strategy: strategy } };
      const { client, requestJson } = mockClient(response);
      const signal = new AbortController().signal;
      expect(await updateDeploymentOverflow(client, code, strategy, signal)).toBe(response);
      expect(requestJson).toHaveBeenCalledExactlyOnceWith({
        path: `${encodedDeployment}/update-overflowstrategy`,
        method: "PUT",
        body: { overflow_strategy: strategy },
        signal,
      });
    },
  );

  test("initial ModelCode creation allows missing name without instance idempotency headers", async () => {
    const body: CreateDeploymentRequest = {
      model_name: "base-model",
      plan: "ptu",
      charge_type: "pre_paid",
      service_tier: "ptu_default",
      suffix: "custom-suffix",
      ptu_capacity: capacity,
      pre_paid_info: prepaid,
    };
    const response = { output: { deployed_model: code, operation_id: "123" } };
    const { client, requestJson } = mockClient(response);
    const signal = new AbortController().signal;
    expect(await createDeployment(client, body, signal)).toBe(response);
    expect(requestJson).toHaveBeenCalledExactlyOnceWith({
      path: "/api/v1/deployments",
      method: "POST",
      body,
      signal,
    });
    expect(requestJson.mock.calls[0][0]).not.toHaveProperty("headers");
  });

  test.each([undefined, "legacy-scale-id"])(
    "old scale preserves fourth-argument signal and accepts fifth-argument ID: %s",
    async (requestId) => {
      for (const body of [
        { capacity: 0 },
        {
          instance_id: instanceId,
          ptu_capacity: capacity,
          pre_paid_info: prepaid,
          order_type: "UPGRADE",
        },
      ] satisfies ScaleDeploymentRequest[]) {
        const response = { output: { deployed_model: code, operation_id: "123" } };
        const { client, requestJson } = mockClient(response);
        const signal = new AbortController().signal;
        expect(await scaleDeployment(client, code, body, signal, requestId)).toBe(response);
        expect(requestJson).toHaveBeenCalledExactlyOnceWith({
          path: `${encodedDeployment}/scale`,
          method: "PUT",
          body,
          headers: requestId ? idHeaders(requestId) : undefined,
          signal,
        });
      }
    },
  );

  test.each(["output", "data"] as const)(
    "delete deployment accepts a deployment in %s",
    async (envelope) => {
      const response: DeleteDeploymentResponse = {
        [envelope]: {
          deployed_model: code,
          plan: "ptu",
          status: "STOPPED",
          ptu_capacity: capacity,
          deleted: true,
        },
      };
      const { client, requestJson } = mockClient(response);
      expect(await deleteDeployment(client, code)).toBe(response);
      expectTypeOf(response[envelope]?.ptu_capacity).toEqualTypeOf<
        ReservationCapacity | undefined
      >();
      expect(requestJson).toHaveBeenCalledExactlyOnceWith({
        path: encodedDeployment,
        method: "DELETE",
        signal: undefined,
      });
    },
  );
});

describe("shared reservation capacity", () => {
  test("requires a pair only when capacity is supplied or required", () => {
    expect(validateReservationCapacity({}, false)).toBeUndefined();
    expectBilingual(validateReservationCapacity({}, true), "--input-tpm");
    for (const required of [false, true]) {
      expectBilingual(validateReservationCapacity({ inputTpm: 0 }, required), "--output-tpm");
      expectBilingual(validateReservationCapacity({ outputTpm: 0 }, required), "--input-tpm");
    }
  });

  test.each([-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid capacity %s in either dimension",
    (value) => {
      for (const required of [false, true]) {
        expectBilingual(
          validateReservationCapacity({ inputTpm: value, outputTpm: 0 }, required),
          "--input-tpm",
        );
        expectBilingual(
          validateReservationCapacity({ inputTpm: 0, outputTpm: value }, required),
          "--output-tpm",
        );
      }
    },
  );

  test.each([0, 1, 7, Number.MAX_SAFE_INTEGER])(
    "keeps kTPM %s without model limits or conversion",
    (value) => {
      const flags = { inputTpm: value, outputTpm: value };
      expect(validateReservationCapacity(flags, true)).toBeUndefined();
      expect(buildReservationCapacity(flags)).toStrictEqual({
        input_tpm: value,
        output_tpm: value,
      });
    },
  );
});

describe("shared prepaid information", () => {
  test("omits an absent block and retains an explicit false", () => {
    expect(hasPrepaidFlags({ inputTpm: 0, outputTpm: 0 })).toBe(false);
    expect(buildPrepaidInfo({})).toBeUndefined();
    expect(buildPrepaidInfo({ duration: undefined, autoRenewal: undefined })).toBeUndefined();
    expect(validatePrepaidFlags({}, false)).toBeUndefined();
    expectBilingual(validatePrepaidFlags({}, true), "--duration");
    expect(hasPrepaidFlags({ autoRenewal: false })).toBe(true);
    expect(buildPrepaidInfo({ duration: 30, autoRenewal: false })).toStrictEqual(prepaid);
    expect(validatePrepaidFlags({ duration: 30, autoRenewal: false }, true)).toBeUndefined();
  });

  test.each([
    { duration: 30 },
    { autoRenewal: false },
    { autoRenewalDuration: 30 },
    { autoRenewalCycle: "Day" },
  ] satisfies ReservationFlags[])("any prepaid field requires the complete block: %j", (flags) => {
    expect(hasPrepaidFlags(flags)).toBe(true);
    expectBilingual(validatePrepaidFlags(flags, false));
  });

  test.each([undefined, 0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "requires positive safe purchase and automatic renewal durations: %s",
    (duration) => {
      expectBilingual(validatePrepaidFlags({ duration, autoRenewal: false }, false), "--duration");
      expectBilingual(
        validatePrepaidFlags(
          { duration: 30, autoRenewal: true, autoRenewalDuration: duration },
          false,
        ),
        "--auto-renewal-duration",
      );
    },
  );

  test.each([undefined, "false", 0, null])("requires an explicit boolean: %s", (autoRenewal) => {
    const flags = { duration: 30, autoRenewal } as unknown as ReservationFlags;
    expectBilingual(validatePrepaidFlags(flags, true), "--auto-renewal");
  });

  test.each(["", "   ", "\t\n"])("rejects an empty cycle: %j", (autoRenewalCycle) => {
    expectBilingual(
      validatePrepaidFlags({ duration: 30, autoRenewal: false, autoRenewalCycle }, false),
      "--auto-renewal-cycle",
    );
  });

  test("passes future cycle names and safe durations through unchanged", () => {
    const flags: ReservationFlags = {
      duration: Number.MAX_SAFE_INTEGER,
      autoRenewal: true,
      autoRenewalDuration: 1,
      autoRenewalCycle: "FUTURE_CYCLE",
    };
    expect(validatePrepaidFlags(flags, true)).toBeUndefined();
    expect(buildPrepaidInfo(flags)).toStrictEqual({
      duration: Number.MAX_SAFE_INTEGER,
      auto_renewal: true,
      auto_renewal_duration: 1,
      auto_renewal_cycle: "FUTURE_CYCLE",
    });
    expectBilingual(
      validatePrepaidFlags({ duration: 30, autoRenewal: false, autoRenewalDuration: 0 }, false),
      "--auto-renewal-duration",
    );
  });
});

function planContext(client: Client, flags: CreatePlanFlags = {}, dryRun = false): PlanContext {
  return { client, flags, dryRun, model: "base-model", binName: "test-cli" };
}

describe("PTU creation strategy", () => {
  const strategy = pickPlanStrategy("ptu");
  const validFlags: CreatePlanFlags = { chargeType: "post_paid", inputTpm: 0, outputTpm: 7 };

  test.each([
    { chargeType: undefined },
    { chargeType: "POST_PAY" },
    { chargeType: "" },
    { serviceTier: "ptu_v2" },
    { serviceTier: "" },
    { serviceTier: "ptu_default" },
    { thinkingOutputTpm: 0 },
    { capacity: 0 },
    { deploySpec: "MU1" },
    { billingMethod: "POST_PAY" },
    { duration: 30 },
    { autoRenewal: false },
    { autoRenewalDuration: 30 },
    { autoRenewalCycle: "Day" },
    { inputTpm: undefined },
    { outputTpm: -1 },
    { chargeType: "pre_paid" },
    { chargeType: "pre_paid", duration: 30 },
    { chargeType: "pre_paid", duration: 30, autoRenewal: true },
  ] satisfies CreatePlanFlags[])(
    "rejects invalid combinations with bilingual errors: %j",
    (overrides) => {
      expectBilingual(strategy.validateFlags({ ...validFlags, ...overrides }));
    },
  );

  test.each([undefined, "ptu_fast"])(
    "postpaid omits optional fields without defaults: %s",
    async (serviceTier) => {
      const flags = { ...validFlags, serviceTier };
      const { client, requestJson } = mockClient();
      expect(strategy.validateFlags(flags)).toBeUndefined();
      expect(await strategy.resolve(planContext(client, flags))).toStrictEqual({
        body: {
          charge_type: "post_paid",
          ptu_capacity: { input_tpm: 0, output_tpm: 7 },
          ...(serviceTier === undefined ? {} : { service_tier: serviceTier }),
        },
      });
      expect(requestJson).not.toHaveBeenCalled();
    },
  );

  test.each([undefined, "ptu_fast", "ptu_default"])(
    "prepaid builds reservation fields for %s",
    async (serviceTier) => {
      const flags: CreatePlanFlags = {
        ...validFlags,
        chargeType: "pre_paid",
        serviceTier,
        suffix: "my-suffix",
        duration: 30,
        autoRenewal: false,
      };
      const { client, requestJson } = mockClient();
      expect(strategy.validateFlags(flags)).toBeUndefined();
      expect(await strategy.resolve(planContext(client, flags))).toStrictEqual({
        body: {
          charge_type: "pre_paid",
          ptu_capacity: { input_tpm: 0, output_tpm: 7 },
          pre_paid_info: prepaid,
          suffix: "my-suffix",
          ...(serviceTier === undefined ? {} : { service_tier: serviceTier }),
        },
      });
      expect(requestJson).not.toHaveBeenCalled();
    },
  );
});

describe("MU and LoRA regressions", () => {
  test("LoRA keeps the placeholder capacity and does not call the catalog", async () => {
    const strategy = pickPlanStrategy("lora");
    const { client, requestJson } = mockClient();
    expect(strategy.validateFlags({})).toBeUndefined();
    expect(await strategy.resolve(planContext(client))).toStrictEqual({ body: { capacity: 1 } });
    expect(requestJson).not.toHaveBeenCalled();
  });

  test.each([
    { dryRun: true, flags: {}, expected: { capacity: 1, billing_method: "POST_PAY" } },
    {
      dryRun: false,
      flags: { deploySpec: "explicit" },
      expected: { capacity: 1, billing_method: "POST_PAY", deploy_spec: "explicit" },
    },
    {
      dryRun: false,
      flags: { deploySpec: "explicit", capacity: 0, billingMethod: "PRE_PAY" },
      expected: { capacity: 0, billing_method: "PRE_PAY", deploy_spec: "explicit" },
    },
  ])("MU skips catalog for dry-run or explicit spec: %j", async ({ dryRun, flags, expected }) => {
    const strategy = pickPlanStrategy("mu");
    const { client, requestJson } = mockClient();
    expect(strategy.validateFlags(flags)).toBeUndefined();
    expect(await strategy.resolve(planContext(client, flags, dryRun))).toStrictEqual({
      body: expected,
    });
    expect(requestJson).not.toHaveBeenCalled();
  });

  test.each(["output", "data"] as const)(
    "MU selects billing-matched catalog templates in %s",
    async (envelope) => {
      const templates = [
        {
          template_id: "prepaid-spec",
          charge_type: "pre_paid",
          roles: { unified: { capacity_unit_per_instance: 2 } },
        },
        {
          deploy_spec: "postpaid-spec",
          charge_type: "post_paid",
          roles: { unified: { capacity_unit_per_instance: 8 } },
        },
      ];
      for (const billingMethod of [undefined, "PRE_PAY"]) {
        const { client, requestJson } = mockClient({
          [envelope]: {
            models: [{ model_name: "base-model", plans: [{ plan: "mu", templates }] }],
          },
        });
        expect(
          await pickPlanStrategy("mu").resolve(planContext(client, { billingMethod })),
        ).toStrictEqual({
          body:
            billingMethod === "PRE_PAY"
              ? { capacity: 2, billing_method: "PRE_PAY", deploy_spec: "prepaid-spec" }
              : { capacity: 8, billing_method: "POST_PAY", deploy_spec: "postpaid-spec" },
        });
        expect(requestJson).toHaveBeenCalledExactlyOnceWith({
          path: "/api/v1/deployments/models?page_size=100&version=v1.0&model_source=base",
          method: "GET",
          signal: undefined,
        });
      }
    },
  );

  test("MU keeps explicit capacity and falls back to the first template", async () => {
    const { client } = mockClient({
      output: {
        models: [
          {
            model_name: "base-model",
            plans: [
              { plan: "mu", templates: [{ template_id: "fallback", charge_type: "pre_paid" }] },
            ],
          },
        ],
      },
    });
    expect(
      await pickPlanStrategy("mu").resolve(planContext(client, { capacity: 5 })),
    ).toStrictEqual({
      body: { capacity: 5, billing_method: "POST_PAY", deploy_spec: "fallback" },
    });
  });
});
