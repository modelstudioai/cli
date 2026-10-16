import {
  BailianError,
  ExitCode,
  type AnyCommand,
  type Client,
  type Settings,
} from "bailian-cli-core";
import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from "vite-plus/test";
import deployList from "../src/commands/deploy/list.ts";
import deployGet from "../src/commands/deploy/get.ts";
import deployCapacityList from "../src/commands/deploy/capacity-list.ts";
import deployCapacityGet from "../src/commands/deploy/capacity-get.ts";
import deployOperationGet from "../src/commands/deploy/operation-get.ts";
import deployOperationWait, {
  waitForCapacityOperation,
} from "../src/commands/deploy/operation-wait.ts";

const SETTINGS: Settings = {
  output: "json",
  outputExplicit: true,
  timeout: 30,
  watermark: true,
  verbose: false,
  quiet: true,
  dryRun: false,
  telemetry: false,
};
const MODEL_CODE = "model/test";
const INSTANCE_ID = "instance/test";
const OPERATION_ID = "000900719925474099312345/operation";
const DEPLOYMENT_PATH = "/api/v1/deployments/model%2Ftest";
const INSTANCE_PATH = `${DEPLOYMENT_PATH}/capacity-instances/instance%2Ftest`;
const OPERATION_PATH = `${DEPLOYMENT_PATH}/capacity-operations/000900719925474099312345%2Foperation`;
const QUERY_COMMANDS: {
  name: string;
  command: AnyCommand;
  flags: Record<string, string>;
  action: string;
}[] = [
  { name: "list", command: deployList, flags: {}, action: "deploy.list" },
  { name: "get", command: deployGet, flags: { deployedModel: MODEL_CODE }, action: "deploy.get" },
  {
    name: "capacity list",
    command: deployCapacityList,
    flags: { deployedModel: MODEL_CODE },
    action: "deploy.capacity.list",
  },
  {
    name: "capacity get",
    command: deployCapacityGet,
    flags: { deployedModel: MODEL_CODE, instanceId: INSTANCE_ID },
    action: "deploy.capacity.get",
  },
  {
    name: "operation get",
    command: deployOperationGet,
    flags: { deployedModel: MODEL_CODE, operationId: OPERATION_ID },
    action: "deploy.operation.get",
  },
  {
    name: "operation wait",
    command: deployOperationWait,
    flags: { deployedModel: MODEL_CODE, operationId: OPERATION_ID },
    action: "deploy.operation.wait",
  },
];

const mockClients: ReturnType<typeof createMockClient>[] = [];
let stdout = "";

function createMockClient(response: unknown = {}): {
  client: Client;
  requestJson: Mock<Client["requestJson"]>;
  request: Mock<Client["request"]>;
} {
  const requestJson = vi.fn<Client["requestJson"]>().mockResolvedValue(response);
  const request = vi.fn<Client["request"]>().mockRejectedValue(new Error("Unexpected raw request"));
  const result = { client: { requestJson, request } as unknown as Client, requestJson, request };
  mockClients.push(result);
  return result;
}

function runCommand(
  command: AnyCommand,
  flags: Record<string, unknown>,
  client: Client,
  dryRun = false,
) {
  return command.run({
    identity: {
      binName: "bl",
      version: "test",
      npmPackage: "bailian-cli",
      clientName: "bailian-cli",
    },
    settings: { ...SETTINGS, dryRun },
    flags,
    client,
  } as never);
}

function wait(
  client: Client,
  options: { interval?: number; pollTimeout?: number; signal?: AbortSignal } = {},
) {
  return waitForCapacityOperation(client, MODEL_CODE, OPERATION_ID, {
    interval: 2,
    pollTimeout: 600,
    ...options,
  });
}

/** Simulate a transport that remains pending until its supplied signal aborts. */
function pendingRequestUntilAbort(request: Parameters<Client["requestJson"]>[0]): Promise<never> {
  return new Promise((_resolve, reject) => {
    const signal = request.signal;
    if (!signal) {
      reject(new Error("Expected an abortable request"));
      return;
    }
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

function requestPaths(mock: ReturnType<typeof createMockClient>): string[] {
  return mock.requestJson.mock.calls.map(([request]) => request.path);
}

beforeEach(() => {
  stdout = "";
  mockClients.length = 0;
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("Real network is forbidden in deploy query tests")),
  );
});

afterEach(() => {
  try {
    // Enforce the read-only contract for every command, poll, refresh and error path.
    for (const mock of mockClients) {
      expect(mock.request).not.toHaveBeenCalled();
      for (const [request] of mock.requestJson.mock.calls) {
        expect(request.method).toBe("GET");
        expect(request).not.toHaveProperty("body");
      }
    }
    expect(fetch).not.toHaveBeenCalled();
    if (vi.isFakeTimers()) expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

describe("deploy query dry-run", () => {
  test.each(QUERY_COMMANDS)(
    "$name emits its plan without any request or SIGINT listener",
    async ({ command, flags, action }) => {
      const mock = createMockClient();
      const listeners = process.listeners("SIGINT");
      await runCommand(command, flags, mock.client, true);
      expect(JSON.parse(stdout)).toMatchObject({ action });
      expect(mock.requestJson).not.toHaveBeenCalled();
      expect(process.listeners("SIGINT")).toEqual(listeners);
    },
  );

  test("list reports server plan and page-local status filtering in dry-run", async () => {
    const mock = createMockClient();
    await runCommand(
      deployList,
      { page: 3, pageSize: 25, plan: " ptu ", status: " RUNNING " },
      mock.client,
      true,
    );
    expect(JSON.parse(stdout)).toEqual({
      action: "deploy.list",
      page: 3,
      page_size: 25,
      plan: "ptu",
      status: "RUNNING",
      filter_scope: "page",
    });
    expect(mock.requestJson).not.toHaveBeenCalled();
  });

  test.each([
    { flags: {}, interval: 2, pollTimeout: 600 },
    { flags: { interval: 3.5, pollTimeout: 9 }, interval: 3.5, pollTimeout: 9 },
  ])(
    "wait dry-run preserves interval=$interval and pollTimeout=$pollTimeout",
    async ({ flags, interval, pollTimeout }) => {
      const mock = createMockClient();
      await runCommand(
        deployOperationWait,
        { deployedModel: MODEL_CODE, operationId: OPERATION_ID, ...flags },
        mock.client,
        true,
      );
      expect(JSON.parse(stdout)).toEqual({
        action: "deploy.operation.wait",
        deployed_model: MODEL_CODE,
        operation_id: OPERATION_ID,
        interval,
        poll_timeout: pollTimeout,
      });
      expect(mock.requestJson).not.toHaveBeenCalled();
    },
  );
});

describe.each(["output", "data"] as const)("deploy query %s envelope", (envelope) => {
  test("list sends plan but filters status only on the requested page, preserving the server total", async () => {
    const matching = {
      deployed_model: MODEL_CODE,
      status: "RUNNING",
      plan: "ptu",
      capacity: 0,
      gmt_create: "created",
      ptu_capacity: { input_tpm: 0, output_tpm: 12 },
      future_flag: false,
    };
    const mock = createMockClient({
      request_id: "list-request",
      [envelope]: {
        deployments: [matching, { deployed_model: "stopped", status: "STOPPED" }],
        total: 57,
        page_no: 3,
        page_size: 2,
      },
    });
    await runCommand(
      deployList,
      { page: 3, pageSize: 2, plan: " ptu ", status: " RUNNING " },
      mock.client,
    );
    expect(requestPaths(mock)).toEqual(["/api/v1/deployments?page_no=3&page_size=2&plan=ptu"]);
    expect(JSON.parse(stdout)).toEqual({
      items: [{ ...matching, capacity: "0", model_name: "", created_at: "created" }],
      total: 57,
      page_no: 3,
      page_size: 2,
      request_id: "list-request",
      local_filter: {
        status: "RUNNING",
        scope: "page",
        matched_count: 1,
        unfiltered_page_count: 2,
      },
    });
  });

  test("an empty filtered page does not fetch subsequent pages or change total", async () => {
    const mock = createMockClient({
      [envelope]: { deployments: [{ status: "STOPPED" }], total: 100 },
    });
    await runCommand(deployList, { status: "RUNNING" }, mock.client);
    expect(requestPaths(mock)).toEqual(["/api/v1/deployments?page_no=1&page_size=10"]);
    expect(JSON.parse(stdout)).toEqual({
      items: [],
      total: 100,
      page_no: 1,
      page_size: 10,
      local_filter: {
        status: "RUNNING",
        scope: "page",
        matched_count: 0,
        unfiltered_page_count: 1,
      },
    });
  });

  test("list retains legacy string capacity and stringifies numbers without adding a local filter", async () => {
    const mock = createMockClient({
      [envelope]: {
        deployments: [{ capacity: "8" }, { capacity: 4 }, { capacity: 0 }, {}],
        total: 4,
      },
    });
    await runCommand(deployList, {}, mock.client);
    const result = JSON.parse(stdout);
    expect(result.items.map((item: { capacity: string }) => item.capacity)).toEqual([
      "8",
      "4",
      "0",
      "",
    ]);
    expect(result).not.toHaveProperty("local_filter");
    expect(result.total).toBe(4);
    expect(requestPaths(mock)).toEqual(["/api/v1/deployments?page_no=1&page_size=10"]);
  });

  test("get keeps unknown fields, zeros, false values and nested PTU/prepaid fields", async () => {
    const deployment = {
      deployed_model: MODEL_CODE,
      name: "reservation",
      model_name: "base-model",
      base_model: "base",
      status: "RUNNING",
      plan: "ptu",
      capacity: 0,
      base_capacity: 0,
      ready_capacity: 0,
      rpm_limit: 0,
      tpm_limit: 0,
      input_tpm: 0,
      output_tpm: 0,
      ptu_capacity: { input_tpm: 0, output_tpm: 0, future_capacity: 0 },
      ptu_service_tier: "FUTURE_TIER",
      overflow_strategy: "FUTURE_STRATEGY",
      pre_paid_info: { auto_renewal: false, auto_renewal_duration: 0, future: { enabled: false } },
      future_field: { enabled: false, quota: 0 },
      can_scale: false,
      gmt_create: "created",
      gmt_modified: "modified",
    };
    const mock = createMockClient({ [envelope]: deployment, request_id: "get-request" });
    await runCommand(deployGet, { deployedModel: MODEL_CODE }, mock.client);
    expect(JSON.parse(stdout)).toEqual({
      ...deployment,
      deployed_name: "reservation",
      created_at: "created",
      updated_at: "modified",
      request_id: "get-request",
    });
    expect(requestPaths(mock)).toEqual([DEPLOYMENT_PATH]);
  });

  test("capacity list preserves native records/items/page/itemsPerPage/pageCount", async () => {
    const response = {
      request_id: "capacity-list-request",
      future_envelope: false,
      [envelope]: {
        records: [
          {
            instance_id: INSTANCE_ID,
            status: "STOPPED",
            deleted: false,
            effective_capacity: { input_tpm: 0 },
            target_capacity: null,
          },
        ],
        items: 27,
        page: 2,
        itemsPerPage: 20,
        pageCount: 2,
        future_page: 0,
      },
    };
    const mock = createMockClient(response);
    await runCommand(deployCapacityList, { deployedModel: MODEL_CODE, page: 2 }, mock.client);
    expect(JSON.parse(stdout)).toEqual(response);
    expect(requestPaths(mock)).toEqual([
      `${DEPLOYMENT_PATH}/capacity-instances?page_no=2&page_size=20&include_deleted=true`,
    ]);
  });

  test("capacity get preserves the entire envelope, including released instances and false capabilities", async () => {
    const response = {
      request_id: "instance-request",
      future_flag: false,
      [envelope]: {
        instance_id: INSTANCE_ID,
        status: "STOPPED",
        deleted: true,
        can_scale: false,
        can_renew: false,
        can_delete: false,
        effective_capacity: { input_tpm: 0, output_tpm: 0 },
        configured_capacity: { input_tpm: 10 },
        target_capacity: null,
        pre_paid_info: { auto_renewal: false, duration: 0 },
        future_field: 0,
      },
    };
    const mock = createMockClient(response);
    await runCommand(
      deployCapacityGet,
      { deployedModel: MODEL_CODE, instanceId: INSTANCE_ID },
      mock.client,
    );
    expect(JSON.parse(stdout)).toEqual(response);
    expect(requestPaths(mock)).toEqual([INSTANCE_PATH]);
  });

  test("operation get returns FAILED as data without throwing or refreshing", async () => {
    const response = {
      request_id: "query-request",
      future_field: 0,
      [envelope]: {
        operation_id: OPERATION_ID,
        operation_status: "FAILED",
        instance_id: INSTANCE_ID,
        request_id: "original-write-request",
        error_code: "Original.Code",
        error_message: "服务端原始错误 / original message",
        future_flag: false,
      },
    };
    const mock = createMockClient(response);
    await runCommand(
      deployOperationGet,
      { deployedModel: MODEL_CODE, operationId: OPERATION_ID },
      mock.client,
    );
    expect(JSON.parse(stdout)).toEqual(response);
    expect(requestPaths(mock)).toEqual([OPERATION_PATH]);
  });
});

describe("deploy query defaults and filters", () => {
  test.each([
    { name: "omitted", flags: {}, expected: true },
    { name: "false", flags: { includeDeleted: false }, expected: false },
    { name: "true", flags: { includeDeleted: true }, expected: true },
  ])(
    "capacity list includeDeleted=$name and CSV filters map to query parameters",
    async ({ flags, expected }) => {
      const mock = createMockClient();
      await runCommand(
        deployCapacityList,
        {
          deployedModel: MODEL_CODE,
          page: 4,
          pageSize: 7,
          statuses: " RUNNING, STOPPED ,FUTURE_STATE ",
          chargeTypes: " pre_paid, post_paid ",
          ...flags,
        },
        mock.client,
      );
      expect(requestPaths(mock)).toEqual([
        `${DEPLOYMENT_PATH}/capacity-instances?page_no=4&page_size=7&include_deleted=${expected}&statuses=RUNNING%2CSTOPPED%2CFUTURE_STATE&charge_types=pre_paid%2Cpost_paid`,
      ]);
    },
  );

  test("capacity list preserves empty pages and zero totals", async () => {
    const response = { output: { records: [], items: 0, page: 1, itemsPerPage: 20, pageCount: 0 } };
    const mock = createMockClient(response);
    await runCommand(deployCapacityList, { deployedModel: MODEL_CODE }, mock.client);
    expect(JSON.parse(stdout)).toEqual(response);
    expect(requestPaths(mock)).toEqual([
      `${DEPLOYMENT_PATH}/capacity-instances?page_no=1&page_size=20&include_deleted=true`,
    ]);
  });

  test("get with no payload still reports the queried identifier and request ID", async () => {
    const mock = createMockClient({ request_id: "empty-request" });
    await runCommand(deployGet, { deployedModel: MODEL_CODE }, mock.client);
    expect(JSON.parse(stdout)).toEqual({ deployed_model: MODEL_CODE, request_id: "empty-request" });
  });
});

describe("deploy query validation", () => {
  test.each(QUERY_COMMANDS)(
    "$name accepts valid required identifiers and omitted optional flags",
    async ({ command, flags }) => {
      expect(await command.validate?.(flags)).toBeUndefined();
    },
  );

  const idCases = QUERY_COMMANDS.flatMap(({ name, command, flags }) =>
    Object.keys(flags).map((field) => ({ name, command, flags, field })),
  );
  test.each(idCases)(
    "$name rejects empty or whitespace-only $field",
    async ({ command, flags, field }) => {
      for (const value of ["", " \t\n "]) {
        expect(await command.validate?.({ ...flags, [field]: value })).toMatch(
          /Identifiers must not be empty/,
        );
      }
    },
  );

  describe.each(QUERY_COMMANDS.filter(({ name }) => name === "list" || name === "capacity list"))(
    "$name pagination",
    ({ command, flags }) => {
      test.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
        "rejects page=%s",
        async (page) => {
          expect(await command.validate?.({ ...flags, page })).toMatch(/--page must/);
        },
      );
      test.each([0, -1, 1.5, 101, NaN, Infinity])("rejects pageSize=%s", async (pageSize) => {
        expect(await command.validate?.({ ...flags, pageSize })).toMatch(/--page-size must/);
      });
      test.each([1, 100])("accepts pageSize boundary=%s", async (pageSize) => {
        expect(await command.validate?.({ ...flags, page: 1, pageSize })).toBeUndefined();
      });
    },
  );

  test.each(["plan", "status"])("list rejects blank %s", async (field) => {
    expect(await deployList.validate?.({ [field]: " \t " })).toMatch(/Filters must not be empty/);
  });

  test.each(["statuses", "chargeTypes"])(
    "capacity list rejects empty CSV components in %s",
    async (field) => {
      for (const value of ["", " ", ",", "RUNNING,", ",RUNNING", "RUNNING, ,STOPPED"]) {
        expect(
          await deployCapacityList.validate?.({ deployedModel: MODEL_CODE, [field]: value }),
        ).toMatch(/must not contain empty values/);
      }
    },
  );

  test.each(["POST_PAY", "PRE_PAID", "unknown", "pre_paid,unknown"])(
    "capacity list rejects chargeTypes=%s",
    async (chargeTypes) => {
      expect(
        await deployCapacityList.validate?.({ deployedModel: MODEL_CODE, chargeTypes }),
      ).toMatch(/--charge-types accepts/);
    },
  );

  test("capacity list accepts trimmed CSVs, future statuses and explicit false", async () => {
    expect(
      await deployCapacityList.validate?.({
        deployedModel: MODEL_CODE,
        includeDeleted: false,
        statuses: "RUNNING, FUTURE_STATE",
        chargeTypes: " pre_paid, post_paid ",
      }),
    ).toBeUndefined();
  });

  test.each([0, -1, 0.5, 3601, NaN, Infinity, -Infinity])(
    "wait rejects interval=%s",
    async (interval) => {
      expect(
        await deployOperationWait.validate?.({
          deployedModel: MODEL_CODE,
          operationId: OPERATION_ID,
          interval,
        }),
      ).toMatch(/--interval must/);
    },
  );
  test.each([0, -1, 2_147_484, NaN, Infinity, -Infinity])(
    "wait rejects pollTimeout=%s",
    async (pollTimeout) => {
      expect(
        await deployOperationWait.validate?.({
          deployedModel: MODEL_CODE,
          operationId: OPERATION_ID,
          pollTimeout,
        }),
      ).toMatch(/--poll-timeout must/);
    },
  );
  test.each([
    { interval: 1, pollTimeout: 0.5 },
    { interval: 1.5, pollTimeout: 600 },
    { interval: 3600, pollTimeout: 2_147_483 },
  ])("wait accepts interval=$interval and pollTimeout=$pollTimeout", async (flags) => {
    expect(
      await deployOperationWait.validate?.({
        deployedModel: MODEL_CODE,
        operationId: OPERATION_ID,
        ...flags,
      }),
    ).toBeUndefined();
  });
});

describe("waitForCapacityOperation read-only polling", () => {
  beforeEach(() => vi.useFakeTimers());

  test.each(["output", "data"] as const)(
    "backs off PROCESSING, then preserves %s and refreshes instance followed by deployment",
    async (envelope) => {
      const mock = createMockClient();
      const response = {
        request_id: "poll-request",
        future_flag: false,
        [envelope]: {
          operation_status: "SUCCEEDED",
          instance_id: INSTANCE_ID,
          operation_id: OPERATION_ID,
        },
      };
      const instance = {
        data: { instance_id: INSTANCE_ID, effective_capacity: { input_tpm: 0 }, can_scale: false },
        request_id: "instance-request",
      };
      const deployment = {
        output: { deployed_model: MODEL_CODE, ptu_capacity: { input_tpm: 0, output_tpm: 10 } },
        request_id: "deployment-request",
      };
      mock.requestJson
        .mockResolvedValueOnce({ [envelope]: { operation_status: "PROCESSING" } })
        .mockResolvedValueOnce({ [envelope]: { operation_status: "PROCESSING" } })
        .mockResolvedValueOnce(response)
        .mockResolvedValueOnce(instance)
        .mockResolvedValueOnce(deployment);
      const result = wait(mock.client);
      await vi.advanceTimersByTimeAsync(0);
      expect(mock.requestJson).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1999);
      expect(mock.requestJson).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(mock.requestJson).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(3999);
      expect(mock.requestJson).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      const value = await result;
      expect(value).toEqual({ ...response, instance, deployment });
      expect(value[envelope]).toBe(response[envelope]);
      expect(value.instance).toBe(instance);
      expect(value.deployment).toBe(deployment);
      expect(requestPaths(mock)).toEqual([
        OPERATION_PATH,
        OPERATION_PATH,
        OPERATION_PATH,
        INSTANCE_PATH,
        DEPLOYMENT_PATH,
      ]);
      const signal = mock.requestJson.mock.calls[0][0].signal;
      expect(signal).toBeInstanceOf(AbortSignal);
      for (const [request] of mock.requestJson.mock.calls) expect(request.signal).toBe(signal);
      expect(signal?.aborted).toBe(false);
    },
  );

  test.each([
    { interval: 2, delays: [2000, 4000, 8000, 16000, 30000, 30000] },
    { interval: 40, delays: [40000, 40000, 40000] },
  ])(
    "caps backoff at max(initial, 30 seconds) for interval=$interval",
    async ({ interval, delays }) => {
      const mock = createMockClient({ output: { operation_status: "PROCESSING" } });
      delays.forEach(() => {
        mock.requestJson.mockResolvedValueOnce({ output: { operation_status: "PROCESSING" } });
      });
      mock.requestJson
        .mockResolvedValueOnce({ output: { operation_status: "SUCCEEDED" } })
        .mockResolvedValueOnce({ output: { deployed_model: MODEL_CODE } });
      const result = wait(mock.client, { interval });
      await vi.advanceTimersByTimeAsync(0);
      let pollCount = 1;
      for (const delay of delays) {
        await vi.advanceTimersByTimeAsync(delay - 1);
        expect(mock.requestJson).toHaveBeenCalledTimes(pollCount);
        await vi.advanceTimersByTimeAsync(1);
        pollCount += 1;
      }
      await result;
      expect(requestPaths(mock)).toEqual([
        ...Array<string>(delays.length + 1).fill(OPERATION_PATH),
        DEPLOYMENT_PATH,
      ]);
    },
  );

  test.each([undefined, ""])(
    "SUCCEEDED without instance_id=%s refreshes only the deployment",
    async (instanceId) => {
      const response = { data: { operation_status: "SUCCEEDED", instance_id: instanceId } };
      const deployment = { data: { deployed_model: MODEL_CODE } };
      const mock = createMockClient();
      mock.requestJson.mockResolvedValueOnce(response).mockResolvedValueOnce(deployment);
      expect(await wait(mock.client)).toEqual({ ...response, instance: undefined, deployment });
      expect(requestPaths(mock)).toEqual([OPERATION_PATH, DEPLOYMENT_PATH]);
    },
  );

  test.each(["output", "data"] as const)(
    "FAILED in %s keeps original message/code/request ID/cause and never refreshes",
    async (envelope) => {
      const operation = {
        operation_id: OPERATION_ID,
        instance_id: INSTANCE_ID,
        operation_status: "FAILED",
        error_message: "原始错误\nDo not translate",
        error_code: "Vendor.OriginalCode",
        request_id: "write-request",
        future_flag: false,
      };
      const response = { request_id: "poll-request", [envelope]: operation };
      const mock = createMockClient(response);
      const result = wait(mock.client);
      await expect(result).rejects.toMatchObject({
        message: operation.error_message,
        exitCode: ExitCode.GENERAL,
        api: { httpStatus: 200, apiCode: operation.error_code, requestId: "poll-request" },
        rawResponse: JSON.stringify(response),
      });
      await expect(result).rejects.toHaveProperty("cause", operation);
      expect(await result.catch((error: BailianError) => error.cause)).toBe(operation);
      expect(requestPaths(mock)).toEqual([OPERATION_PATH]);
    },
  );

  test.each([
    { output: { operation_status: "UNKNOWN" } },
    { data: { operation_status: "RUNNING" } },
    { output: { operation_status: "succeeded" } },
    { output: { operation_status: "" } },
    { output: {} },
    { data: {} },
    {},
  ])("rejects unknown or missing status: %j", async (response) => {
    const mock = createMockClient(response);
    const result = wait(mock.client);
    await expect(result).rejects.toMatchObject({
      message: expect.stringContaining("Missing or unsupported operation_status"),
      exitCode: ExitCode.GENERAL,
      cause: response,
      rawResponse: JSON.stringify(response),
    });
    expect(requestPaths(mock)).toEqual([OPERATION_PATH]);
  });

  test("total timeout interrupts sleep, retains last response and clears both timers", async () => {
    const response = { output: { operation_status: "PROCESSING" }, request_id: "last-request" };
    const mock = createMockClient(response);
    const result = wait(mock.client, { interval: 2, pollTimeout: 3 });
    const rejection = expect(result).rejects.toMatchObject({
      exitCode: ExitCode.TIMEOUT,
      cause: { deployed_model: MODEL_CODE, operation_id: OPERATION_ID, last_response: response },
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(mock.requestJson).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(mock.requestJson.mock.calls[0][0].signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(mock.requestJson.mock.calls[0][0].signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(requestPaths(mock)).toEqual([OPERATION_PATH, OPERATION_PATH]);
  });

  test.each(["poll", "instance", "deployment"] as const)(
    "total timeout aborts an in-flight %s request",
    async (phase) => {
      const mock = createMockClient();
      if (phase !== "poll")
        mock.requestJson.mockResolvedValueOnce({
          output: { operation_status: "SUCCEEDED", instance_id: INSTANCE_ID },
        });
      if (phase === "deployment")
        mock.requestJson.mockResolvedValueOnce({ output: { instance_id: INSTANCE_ID } });
      mock.requestJson.mockImplementation(pendingRequestUntilAbort);
      const result = wait(mock.client, { pollTimeout: 3 });
      const rejection = expect(result).rejects.toMatchObject({ exitCode: ExitCode.TIMEOUT });
      await vi.advanceTimersByTimeAsync(0);
      const request = mock.requestJson.mock.calls.at(-1)![0];
      expect(request.signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(3000);
      await rejection;
      expect(request.signal?.aborted).toBe(true);
      expect(await result.catch((error: unknown) => error)).toBe(request.signal?.reason);
      expect(requestPaths(mock)).toEqual(
        phase === "poll"
          ? [OPERATION_PATH]
          : phase === "instance"
            ? [OPERATION_PATH, INSTANCE_PATH]
            : [OPERATION_PATH, INSTANCE_PATH, DEPLOYMENT_PATH],
      );
    },
  );

  test("request time consumes the same total budget as subsequent sleeps", async () => {
    const mock = createMockClient();
    let resolvePoll!: (response: unknown) => void;
    mock.requestJson.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePoll = resolve;
        }),
    );
    const result = wait(mock.client, { interval: 2, pollTimeout: 3 });
    const rejection = expect(result).rejects.toMatchObject({ exitCode: ExitCode.TIMEOUT });
    await vi.advanceTimersByTimeAsync(2500);
    resolvePoll({ output: { operation_status: "PROCESSING" } });
    await vi.advanceTimersByTimeAsync(499);
    expect(mock.requestJson.mock.calls[0][0].signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(requestPaths(mock)).toEqual([OPERATION_PATH]);
  });

  test.each(["already aborted", "poll request", "sleep"] as const)(
    "parent signal interrupts during %s and detaches its listener",
    async (phase) => {
      const controller = new AbortController();
      const reason = new Error("caller cancelled without cancelling the remote operation");
      const addListener = vi.spyOn(controller.signal, "addEventListener");
      const removeListener = vi.spyOn(controller.signal, "removeEventListener");
      const mock = createMockClient({ output: { operation_status: "PROCESSING" } });
      if (phase === "already aborted") controller.abort(reason);
      if (phase === "poll request") mock.requestJson.mockImplementation(pendingRequestUntilAbort);
      const result = wait(mock.client, { signal: controller.signal });
      const rejection = expect(result).rejects.toBe(reason);
      if (phase !== "already aborted") {
        await vi.advanceTimersByTimeAsync(0);
        expect(mock.requestJson).toHaveBeenCalledTimes(1);
        if (phase === "sleep") expect(vi.getTimerCount()).toBe(2);
        controller.abort(reason);
      }
      await rejection;
      expect(removeListener).toHaveBeenCalledExactlyOnceWith("abort", addListener.mock.calls[0][1]);
      expect(vi.getTimerCount()).toBe(0);
      if (phase === "already aborted") expect(mock.requestJson).not.toHaveBeenCalled();
      else expect(mock.requestJson.mock.calls[0][0].signal?.reason).toBe(reason);
      await vi.advanceTimersByTimeAsync(600_000);
      expect(mock.requestJson).toHaveBeenCalledTimes(phase === "already aborted" ? 0 : 1);
    },
  );

  test("successful wait detaches the parent signal and deadline without later aborting requests", async () => {
    const controller = new AbortController();
    const addListener = vi.spyOn(controller.signal, "addEventListener");
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const mock = createMockClient();
    mock.requestJson
      .mockResolvedValueOnce({ data: { operation_status: "SUCCEEDED" } })
      .mockResolvedValueOnce({ output: {} });
    await wait(mock.client, { signal: controller.signal });
    expect(removeListener).toHaveBeenCalledExactlyOnceWith("abort", addListener.mock.calls[0][1]);
    controller.abort(new Error("late cancellation"));
    await vi.advanceTimersByTimeAsync(600_000);
    expect(mock.requestJson.mock.calls[0][0].signal?.aborted).toBe(false);
  });

  test.each(["poll", "instance", "deployment"] as const)(
    "passes an HTTP failure during %s through unchanged without additional requests",
    async (phase) => {
      const failure = new BailianError(
        "Server original message",
        ExitCode.GENERAL,
        "Original hint",
        {
          api: { httpStatus: 503, apiCode: "Service.Unavailable", requestId: "http-request" },
          rawResponse: "original raw body",
          cause: new Error("original cause"),
        },
      );
      const mock = createMockClient();
      if (phase !== "poll")
        mock.requestJson.mockResolvedValueOnce({
          data: { operation_status: "SUCCEEDED", instance_id: INSTANCE_ID },
        });
      if (phase === "deployment")
        mock.requestJson.mockResolvedValueOnce({ data: { instance_id: INSTANCE_ID } });
      mock.requestJson.mockRejectedValue(failure);
      await expect(wait(mock.client)).rejects.toBe(failure);
      expect(requestPaths(mock)).toEqual(
        phase === "poll"
          ? [OPERATION_PATH]
          : phase === "instance"
            ? [OPERATION_PATH, INSTANCE_PATH]
            : [OPERATION_PATH, INSTANCE_PATH, DEPLOYMENT_PATH],
      );
    },
  );
});

describe("deploy operation wait command lifecycle", () => {
  beforeEach(() => vi.useFakeTimers());
  const flags = {
    deployedModel: MODEL_CODE,
    operationId: OPERATION_ID,
    interval: 2,
    pollTimeout: 3,
  };

  test("success emits the operation and refreshed envelopes and removes its SIGINT listener", async () => {
    const listeners = process.listeners("SIGINT");
    const response = {
      output: { operation_status: "SUCCEEDED", instance_id: INSTANCE_ID },
      request_id: "poll-request",
    };
    const instance = { output: { instance_id: INSTANCE_ID } };
    const deployment = { data: { deployed_model: MODEL_CODE } };
    const mock = createMockClient();
    mock.requestJson
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(instance)
      .mockResolvedValueOnce(deployment);
    await runCommand(deployOperationWait, flags, mock.client);
    expect(JSON.parse(stdout)).toEqual({ ...response, instance, deployment });
    expect(process.listeners("SIGINT")).toEqual(listeners);
  });

  test.each(["poll request", "sleep"] as const)(
    "SIGINT during %s aborts local waiting, clears timers/listener and emits no success",
    async (phase) => {
      const listeners = process.listeners("SIGINT");
      const once = vi.spyOn(process, "once");
      const mock = createMockClient({ output: { operation_status: "PROCESSING" } });
      if (phase === "poll request") mock.requestJson.mockImplementation(pendingRequestUntilAbort);
      const result = runCommand(deployOperationWait, flags, mock.client);
      await vi.advanceTimersByTimeAsync(0);
      expect(process.listeners("SIGINT")).toHaveLength(listeners.length + 1);
      const handler = once.mock.calls.find(([event]) => event === "SIGINT")?.[1];
      expect(handler).toBeTypeOf("function");
      // Invoke only the command's handler: never signal Vitest or unrelated runtime handlers.
      handler!();
      await result;
      expect(mock.requestJson.mock.calls[0][0].signal?.aborted).toBe(true);
      expect(stdout).toBe("");
      expect(process.listeners("SIGINT")).toEqual(listeners);
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(requestPaths(mock)).toEqual([OPERATION_PATH]);
    },
  );

  test.each(["FAILED", "unknown", "HTTP", "timeout"] as const)(
    "%s emits no success and removes the SIGINT listener",
    async (scenario) => {
      const listeners = process.listeners("SIGINT");
      const failure = new BailianError("HTTP original error", ExitCode.GENERAL);
      const mock = createMockClient({
        output: {
          operation_status: scenario === "timeout" ? "PROCESSING" : scenario,
          error_message: "Operation original error",
        },
      });
      if (scenario === "HTTP") mock.requestJson.mockRejectedValue(failure);
      const result = runCommand(deployOperationWait, flags, mock.client);
      const rejection =
        scenario === "HTTP"
          ? expect(result).rejects.toBe(failure)
          : expect(result).rejects.toMatchObject({
              exitCode: scenario === "timeout" ? ExitCode.TIMEOUT : ExitCode.GENERAL,
            });
      if (scenario === "timeout") await vi.advanceTimersByTimeAsync(3000);
      await rejection;
      expect(stdout).toBe("");
      expect(process.listeners("SIGINT")).toEqual(listeners);
    },
  );
});
