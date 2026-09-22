import {
  BailianError,
  ExitCode,
  type AnyCommand,
  type Client,
  type Settings,
} from "bailian-cli-core";
import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from "vite-plus/test";
import {
  deployCapacityCreate,
  deployCapacityScale,
  deployCapacityRenew,
  deployCapacityDelete,
} from "../src/commands/deploy/capacity-write.ts";
import deployOverflow from "../src/commands/deploy/overflow.ts";

type CommandFlags = Parameters<NonNullable<AnyCommand["validate"]>>[0];
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
const INSTANCES_PATH = `${DEPLOYMENT_PATH}/capacity-instances`;
const INSTANCE_PATH = `${INSTANCES_PATH}/instance%2Ftest`;
const OPERATION_PATH = `${DEPLOYMENT_PATH}/capacity-operations/000900719925474099312345%2Foperation`;
const REQUEST_ID = "fc9c0b75-7327-4a86-88e1-a3b7d093da89";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const IDS = { deployedModel: MODEL_CODE, instanceId: INSTANCE_ID };
const PREPAID = { duration: 31, autoRenewal: false };
const INSTANCE = {
  instance_id: INSTANCE_ID,
  charge_type: "post_paid",
  status: "RUNNING",
  deleted: false,
  can_scale: true,
  can_renew: true,
  can_delete: true,
  configured_capacity: { input_tpm: 100, output_tpm: 10 },
};
const OPERATION = {
  operation_id: OPERATION_ID,
  operation_status: "PROCESSING",
  instance_id: INSTANCE_ID,
};
interface MutationCase {
  name: string;
  command: AnyCommand;
  flags: CommandFlags;
  method: "POST" | "PUT" | "DELETE";
  path: string;
  body?: object;
  precheck?: string;
  instance: typeof INSTANCE;
}
const MUTATIONS: MutationCase[] = [
  {
    name: "create",
    command: deployCapacityCreate,
    flags: { deployedModel: MODEL_CODE, billingMethod: "POST_PAY", inputTpm: 0, outputTpm: 0 },
    method: "POST",
    path: INSTANCES_PATH,
    body: { billing_method: "POST_PAY", ptu_capacity: { input_tpm: 0, output_tpm: 0 } },
    instance: INSTANCE,
  },
  {
    name: "scale",
    command: deployCapacityScale,
    flags: { ...IDS, inputTpm: 0, outputTpm: 0 },
    method: "PUT",
    path: `${INSTANCE_PATH}/scale`,
    body: { ptu_capacity: { input_tpm: 0, output_tpm: 0 } },
    precheck: "can_scale",
    instance: INSTANCE,
  },
  {
    name: "renew",
    command: deployCapacityRenew,
    flags: { ...IDS, ...PREPAID },
    method: "PUT",
    path: `${INSTANCE_PATH}/renew`,
    body: { pre_paid_info: { duration: 31, auto_renewal: false }, is_change: false },
    precheck: "can_renew/pre_paid/configured_capacity",
    instance: { ...INSTANCE, charge_type: "pre_paid" },
  },
  {
    name: "delete",
    command: deployCapacityDelete,
    flags: IDS,
    method: "DELETE",
    path: INSTANCE_PATH,
    precheck: "can_delete/prepaid_unsubscribe",
    instance: INSTANCE,
  },
];
const ALL_COMMANDS = [
  ...MUTATIONS,
  {
    name: "overflow",
    command: deployOverflow,
    flags: { deployedModel: MODEL_CODE, strategy: "enable" },
  },
];
let stdout = "";
let stderr = "";
let interruptListeners: ReturnType<typeof process.listeners>;
const mocks: ReturnType<typeof mockClient>[] = [];

function mockClient(...responses: unknown[]): {
  client: Client;
  requestJson: Mock<Client["requestJson"]>;
  request: Mock<Client["request"]>;
} {
  const requestJson = vi
    .fn<Client["requestJson"]>()
    .mockRejectedValue(new Error("Unexpected request"));
  for (const response of responses) {
    if (response instanceof Error) requestJson.mockRejectedValueOnce(response);
    else requestJson.mockResolvedValueOnce(response);
  }
  const request = vi.fn<Client["request"]>().mockRejectedValue(new Error("Unexpected raw request"));
  const mock = { client: { requestJson, request } as unknown as Client, requestJson, request };
  mocks.push(mock);
  return mock;
}

function mutationClient(mutation: MutationCase, response: unknown, envelope = "output") {
  return mockClient(...(mutation.precheck ? [{ [envelope]: mutation.instance }] : []), response);
}

async function run(
  command: AnyCommand,
  flags: CommandFlags,
  client: Client,
  settings: Partial<Settings> = {},
) {
  const validation = await command.validate?.(flags);
  if (validation) throw new BailianError(validation, ExitCode.USAGE);
  // Only settings/flags/client are exercised. No auth/config store or runtime startup is invoked.
  await command.run({
    identity: {
      binName: "test-cli",
      version: "test",
      npmPackage: "test-cli",
      clientName: "test-cli",
    },
    settings: { ...SETTINGS, ...settings },
    flags,
    client,
  } as Parameters<AnyCommand["run"]>[0]);
}

function requests(mock: ReturnType<typeof mockClient>) {
  return mock.requestJson.mock.calls.map(([request]) => request);
}

function writes(mock: ReturnType<typeof mockClient>) {
  return requests(mock).filter(({ method }) => method !== "GET");
}

function expectSingleSubmission(mock: ReturnType<typeof mockClient>, mutation: MutationCase) {
  expect(writes(mock)).toHaveLength(1);
  expect(writes(mock)[0]).toMatchObject({ method: mutation.method, path: mutation.path });
  const afterWrite = requests(mock).slice(mutation.precheck ? 2 : 1);
  expect(afterWrite.every(({ method }) => method === "GET")).toBe(true);
  for (const request of afterWrite) expect(request).not.toHaveProperty("body");
}

/** Route by HTTP method/path, not by an implementation-specific number of polls. */
function waitingClient(
  mutation: MutationCase,
  options: {
    initialStatus?: string;
    pollStatus?: string;
    pollFailure?: Error;
    deleted?: boolean;
    omitPollId?: boolean;
  } = {},
) {
  const mock = mockClient();
  let submitted = false;
  const instance = { output: { ...mutation.instance, deleted: options.deleted ?? true } };
  const deployment = { data: { deployed_model: MODEL_CODE, future_flag: false, capacity: 0 } };
  const initial = {
    request_id: "submit-request",
    output: { ...OPERATION, operation_status: options.initialStatus ?? "PROCESSING" },
  };
  const completed = {
    request_id: "poll-request",
    output: {
      ...OPERATION,
      operation_id: options.omitPollId ? undefined : OPERATION_ID,
      operation_status: options.pollStatus ?? "SUCCEEDED",
    },
  };
  mock.requestJson.mockImplementation(async (request) => {
    if (request.method === mutation.method && request.path === mutation.path) {
      if (submitted) throw new Error("Write must not be retried");
      submitted = true;
      return initial;
    }
    if (request.method !== "GET") throw new Error(`Unexpected write: ${request.path}`);
    if (request.path === INSTANCE_PATH) {
      return submitted ? instance : { output: mutation.instance };
    }
    if (request.path === OPERATION_PATH) {
      if (options.initialStatus === "SUCCEEDED") {
        throw new Error("Already-terminal submission must not be polled again");
      }
      if (options.pollFailure) throw options.pollFailure;
      return completed;
    }
    if (request.path === DEPLOYMENT_PATH) return deployment;
    throw new Error(`Unexpected read: ${request.path}`);
  });
  return { mock, initial, completed, instance, deployment };
}

beforeEach(() => {
  vi.useFakeTimers();
  stdout = "";
  stderr = "";
  mocks.length = 0;
  interruptListeners = process.listeners("SIGINT");
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Real network is forbidden")));
});

afterEach(() => {
  try {
    expect(fetch).not.toHaveBeenCalled();
    for (const mock of mocks) expect(mock.request).not.toHaveBeenCalled();
    expect(process.listeners("SIGINT")).toEqual(interruptListeners);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

describe("capacity mutation metadata and offline previews", () => {
  test.each(ALL_COMMANDS)("$name is high risk, bilingual, and owns no yes flag", ({ command }) => {
    expect(command.auth).toBe("apiKey");
    expect(command.risk).toMatchObject({
      level: "high",
      message: { "en-US": expect.any(String), "zh-CN": expect.any(String) },
    });
    expect(command.flags).not.toHaveProperty("yes");
  });

  test("parser metadata constrains billing/strategy and renewal has no order-type", () => {
    expect(deployCapacityCreate.flags?.billingMethod).toMatchObject({
      required: true,
      choices: ["PRE_PAY", "POST_PAY"],
    });
    expect(deployOverflow.flags?.strategy).toMatchObject({
      required: true,
      choices: ["enable", "disable"],
    });
    expect(deployCapacityRenew.flags).not.toHaveProperty("orderType");
    expect(deployCapacityScale.flags?.orderType.choices).toEqual(["UPGRADE", "DOWNGRADE"]);
  });

  test.each(MUTATIONS)(
    "$name dry-run does not execute even its can_x precheck or wait",
    async (mutation) => {
      const mock = mockClient();
      await run(mutation.command, { ...mutation.flags, wait: true }, mock.client, { dryRun: true });
      expect(mock.requestJson).not.toHaveBeenCalled();
      expect(stderr).toBe("");
      const result = JSON.parse(stdout);
      expect(result).toMatchObject({
        action: `deploy.capacity.${mutation.name}`,
        deployed_model: MODEL_CODE,
        client_request_id: "<generated UUID>",
        wait: true,
      });
      if (mutation.precheck) expect(result.precheck).toBe(mutation.precheck);
      if (mutation.body) expect(result.body).toEqual(mutation.body);
      else expect(result.query).toEqual({});
    },
  );

  test("prepaid create dry-run keeps duration and explicit false without resolving eligibility", async () => {
    const mock = mockClient();
    await run(
      deployCapacityCreate,
      {
        deployedModel: MODEL_CODE,
        billingMethod: "PRE_PAY",
        inputTpm: 0,
        outputTpm: 7,
        ...PREPAID,
        requestId: REQUEST_ID,
      },
      mock.client,
      { dryRun: true },
    );
    expect(mock.requestJson).not.toHaveBeenCalled();
    expect(JSON.parse(stdout)).toMatchObject({
      client_request_id: REQUEST_ID,
      body: {
        billing_method: "PRE_PAY",
        ptu_capacity: { input_tpm: 0, output_tpm: 7 },
        pre_paid_info: { duration: 31, auto_renewal: false },
      },
    });
  });
});

describe.each(MUTATIONS)("$name capacity write contract", (mutation) => {
  test.each(["output", "data"])(
    "preserves the %s server envelope, zero/false, URL and paired headers",
    async (envelope) => {
      const response = {
        request_id: "server-request",
        future_envelope: false,
        [envelope]: {
          ...OPERATION,
          future_field: { count: 0, enabled: false },
          effective_capacity: { input_tpm: 0 },
          deleted: false,
        },
      };
      const mock = mutationClient(mutation, response, envelope);
      await run(mutation.command, { ...mutation.flags, requestId: REQUEST_ID }, mock.client);
      expect(requests(mock).map(({ method, path }) => ({ method, path }))).toEqual([
        ...(mutation.precheck ? [{ method: "GET", path: INSTANCE_PATH }] : []),
        { method: mutation.method, path: mutation.path },
      ]);
      const write = writes(mock)[0];
      expect(write.headers).toEqual({
        "x-acs-req-uuid": REQUEST_ID,
        "X-DashScope-RequestId": REQUEST_ID,
      });
      if (mutation.body) {
        expect(write.body).toEqual(mutation.body);
        expect(write.body).not.toHaveProperty("request_id");
      } else expect(write).not.toHaveProperty("body");
      expect(JSON.parse(stdout)).toEqual({ ...response, client_request_id: REQUEST_ID });
    },
  );

  test("generated request ID is visible and matches both headers", async () => {
    const mock = mutationClient(mutation, { output: OPERATION });
    await run(mutation.command, mutation.flags, mock.client);
    const requestId = JSON.parse(stdout).client_request_id;
    expect(requestId).toMatch(UUID);
    expect(writes(mock)[0].headers).toEqual({
      "x-acs-req-uuid": requestId,
      "X-DashScope-RequestId": requestId,
    });
    expectSingleSubmission(mock, mutation);
  });

  test.each(["output", "data"])(
    "HTTP 200 FAILED in %s throws the original message and retains metadata",
    async (envelope) => {
      const operation = {
        ...OPERATION,
        operation_status: "FAILED",
        error_code: "Vendor.Capacity.Rejected",
        error_message: "原始服务错误\nDo not rewrite",
        future_flag: false,
      };
      const response = { request_id: "server-failure", [envelope]: operation };
      const mock = mutationClient(mutation, response, envelope);
      const result = run(
        mutation.command,
        { ...mutation.flags, requestId: REQUEST_ID, wait: true },
        mock.client,
      );
      await expect(result).rejects.toMatchObject({
        message: operation.error_message,
        exitCode: ExitCode.GENERAL,
        api: { httpStatus: 200, apiCode: operation.error_code, requestId: "server-failure" },
        cause: { ...response, client_request_id: REQUEST_ID },
      });
      const failure = await result.catch((error: BailianError) => error);
      expect(failure).toBeInstanceOf(BailianError);
      if (failure instanceof BailianError) {
        expect(JSON.parse(failure.rawResponse!)).toEqual({
          ...response,
          client_request_id: REQUEST_ID,
        });
      }
      expect(stdout).toBe("");
      expectSingleSubmission(mock, mutation);
      expect(requests(mock).at(-1)?.method).toBe(mutation.method);
    },
  );

  test.each(["FUTURE_STATUS", undefined])(
    "status=%s after submission is not mistaken for success or retried",
    async (operationStatus) => {
      const mock = mutationClient(mutation, {
        output: { ...OPERATION, operation_status: operationStatus },
      });
      await expect(run(mutation.command, mutation.flags, mock.client)).rejects.toMatchObject({
        exitCode: ExitCode.GENERAL,
        message: expect.stringMatching(/submitted|submission|提交/i),
        cause: { client_request_id: expect.stringMatching(UUID) },
      });
      expectSingleSubmission(mock, mutation);
      expect(stdout).toBe("");
    },
  );

  test.each([ExitCode.GENERAL, ExitCode.TIMEOUT, ExitCode.NETWORK])(
    "transport/service error code=%s keeps message/metadata and generated ID recovery context",
    async (exitCode) => {
      const cause = { original: false };
      const failure = new BailianError("Original write failure", exitCode, "Original hint", {
        api: { httpStatus: 503, apiCode: "Server.Original", requestId: "server-request" },
        rawResponse: "original raw response",
        cause,
      });
      const mock = mutationClient(mutation, failure);
      const result = run(mutation.command, mutation.flags, mock.client);
      await expect(result).rejects.toMatchObject({
        message: "Original write failure",
        exitCode,
        api: failure.api,
        rawResponse: failure.rawResponse,
        hint: expect.stringContaining("Original hint"),
      });
      const requestId = writes(mock)[0].headers?.["x-acs-req-uuid"];
      expect(requestId).toMatch(UUID);
      await expect(result).rejects.toMatchObject({
        hint: expect.stringContaining(requestId!),
        cause: { client_request_id: requestId, original_cause: cause },
      });
      await vi.advanceTimersByTimeAsync(600_000);
      expectSingleSubmission(mock, mutation);
      expect(requests(mock).at(-1)?.method).toBe(mutation.method);
      expect(stdout).toBe("");
    },
  );

  test("read-only AbortError (DOMException) is rethrown untouched, never masked by a TypeError", async () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    const mock = mutationClient(mutation, abort);
    // Appending to DOMException.message throws; the helper must swallow that and
    // rethrow the original error so the runtime still classifies it as a timeout.
    await expect(run(mutation.command, mutation.flags, mock.client)).rejects.toBe(abort);
    expectSingleSubmission(mock, mutation);
    expect(stdout).toBe("");
  });

  test("plain Error keeps its identity and gains the recovery hint", async () => {
    const failure = new Error("transport failure");
    const mock = mutationClient(mutation, failure);
    await expect(run(mutation.command, mutation.flags, mock.client)).rejects.toBe(failure);
    expect(failure.message).toContain("No automatic retry");
    expectSingleSubmission(mock, mutation);
    expect(stdout).toBe("");
  });

  test.each([
    { requestId: " " },
    { requestId: "id\ninjected" },
    { requestId: "id\rinjected" },
    { interval: 2 },
    { pollTimeout: 5 },
    { wait: true, interval: 0 },
    { wait: true, interval: Infinity },
    { wait: true, interval: 3601 },
    { wait: true, pollTimeout: 0 },
    { wait: true, pollTimeout: 2_147_484 },
  ])("invalid write options %j fail before any request", async (flags) => {
    const mock = mockClient();
    await expect(
      run(mutation.command, { ...mutation.flags, ...flags }, mock.client),
    ).rejects.toMatchObject({ exitCode: ExitCode.USAGE });
    expect(mock.requestJson).not.toHaveBeenCalled();
  });
});

describe("capacity/prepaid validation and purchase mapping", () => {
  test.each(MUTATIONS.filter(({ name }) => name !== "delete"))(
    "$name rejects unpaired, negative, fractional or unsafe capacity locally",
    async (mutation) => {
      for (const capacity of [
        { inputTpm: 1, outputTpm: undefined },
        { inputTpm: undefined, outputTpm: 1 },
        { inputTpm: -1, outputTpm: 0 },
        { inputTpm: 0, outputTpm: 0.5 },
        { inputTpm: NaN, outputTpm: 0 },
        { inputTpm: 0, outputTpm: Infinity },
        { inputTpm: Number.MAX_SAFE_INTEGER + 1, outputTpm: 0 },
      ]) {
        const mock = mockClient();
        await expect(
          run(mutation.command, { ...mutation.flags, ...capacity }, mock.client),
        ).rejects.toMatchObject({ exitCode: ExitCode.USAGE });
        expect(mock.requestJson).not.toHaveBeenCalled();
      }
    },
  );

  test.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects prepaid duration=%s locally",
    async (duration) => {
      const mock = mockClient();
      await expect(
        run(deployCapacityRenew, { ...IDS, ...PREPAID, duration }, mock.client),
      ).rejects.toMatchObject({ exitCode: ExitCode.USAGE });
      expect(mock.requestJson).not.toHaveBeenCalled();
    },
  );

  test.each([
    {},
    { duration: 31 },
    { autoRenewal: false },
    { duration: 31, autoRenewal: true },
    { ...PREPAID, autoRenewalDuration: 0 },
    { ...PREPAID, autoRenewalCycle: " " },
  ])("PRE_PAY purchase rejects incomplete prepaid block %j", async (flags) => {
    const mock = mockClient();
    await expect(
      run(
        deployCapacityCreate,
        {
          deployedModel: MODEL_CODE,
          billingMethod: "PRE_PAY",
          inputTpm: 0,
          outputTpm: 0,
          ...flags,
        },
        mock.client,
      ),
    ).rejects.toMatchObject({ exitCode: ExitCode.USAGE });
    expect(mock.requestJson).not.toHaveBeenCalled();
  });

  test.each([
    { autoRenewal: false },
    PREPAID,
    { autoRenewalDuration: 31 },
    { autoRenewalCycle: "Day" },
  ])("POST_PAY rejects prepaid fields %j", async (prepaid) => {
    const mock = mockClient();
    await expect(
      run(
        deployCapacityCreate,
        {
          deployedModel: MODEL_CODE,
          billingMethod: "POST_PAY",
          inputTpm: 0,
          outputTpm: 0,
          ...prepaid,
        },
        mock.client,
      ),
    ).rejects.toMatchObject({ exitCode: ExitCode.USAGE });
    expect(mock.requestJson).not.toHaveBeenCalled();
  });

  test.each([false, true])(
    "PRE_PAY preserves days, zero capacity and autoRenewal=%s",
    async (autoRenewal) => {
      const mock = mockClient({ output: OPERATION });
      await run(
        deployCapacityCreate,
        {
          deployedModel: MODEL_CODE,
          billingMethod: "PRE_PAY",
          inputTpm: 0,
          outputTpm: 7,
          duration: 31,
          autoRenewal,
          autoRenewalDuration: 62,
          autoRenewalCycle: "Day",
        },
        mock.client,
      );
      expect(writes(mock)[0].body).toEqual({
        billing_method: "PRE_PAY",
        ptu_capacity: { input_tpm: 0, output_tpm: 7 },
        pre_paid_info: {
          duration: 31,
          auto_renewal: autoRenewal,
          auto_renewal_duration: 62,
          auto_renewal_cycle: "Day",
        },
      });
      expect(requests(mock)).toHaveLength(1);
    },
  );

  test.each([undefined, "UPGRADE", "DOWNGRADE"])(
    "prepaid scale maps orderType=%s and never invents absent prepaid settings",
    async (orderType) => {
      const mock = mockClient(
        { output: { ...INSTANCE, charge_type: "pre_paid" } },
        { output: OPERATION },
      );
      await run(
        deployCapacityScale,
        { ...IDS, inputTpm: 17, outputTpm: 0, orderType },
        mock.client,
      );
      expect(writes(mock)[0].body).toEqual({
        ptu_capacity: { input_tpm: 17, output_tpm: 0 },
        ...(orderType ? { order_type: orderType } : {}),
      });
    },
  );

  test("prepaid scale carries an explicit false renewal setting", async () => {
    const mock = mockClient(
      { output: { ...INSTANCE, charge_type: "pre_paid" } },
      { output: OPERATION },
    );
    await run(
      deployCapacityScale,
      { ...IDS, inputTpm: 0, outputTpm: 0, ...PREPAID, orderType: "DOWNGRADE" },
      mock.client,
    );
    expect(writes(mock)[0].body).toEqual({
      ptu_capacity: { input_tpm: 0, output_tpm: 0 },
      order_type: "DOWNGRADE",
      pre_paid_info: { duration: 31, auto_renewal: false },
    });
  });
});

describe.each(MUTATIONS.filter(({ precheck }) => precheck))("$name precheck safety", (mutation) => {
  test.each(["false", "missing", "deleted", "missing payload"])(
    "%s capability/instance prevents all writes",
    async (scenario) => {
      const capability = `can_${mutation.name}`;
      const response =
        scenario === "missing payload"
          ? {}
          : {
              output: {
                ...mutation.instance,
                [capability]:
                  scenario === "false" ? false : scenario === "missing" ? undefined : true,
                deleted: scenario === "deleted",
              },
            };
      const mock = mockClient(response);
      await expect(run(mutation.command, mutation.flags, mock.client)).rejects.toMatchObject({
        exitCode: ExitCode.USAGE,
      });
      expect(requests(mock).map(({ method, path }) => ({ method, path }))).toEqual([
        { method: "GET", path: INSTANCE_PATH },
      ]);
      expect(stdout).toBe("");
    },
  );

  test.each([undefined, "FUTURE_BILLING"])(
    "unknown charge_type=%s must fail closed",
    async (chargeType) => {
      const mock = mockClient(
        { output: { ...mutation.instance, charge_type: chargeType } },
        { output: OPERATION },
      );
      await expect(run(mutation.command, mutation.flags, mock.client)).rejects.toMatchObject({
        exitCode: ExitCode.USAGE,
      });
      expect(writes(mock)).toHaveLength(0);
    },
  );

  test("precheck failure is not swallowed or retried", async () => {
    const failure = new BailianError("Original precheck failure", ExitCode.NETWORK);
    const mock = mockClient(failure);
    await expect(run(mutation.command, mutation.flags, mock.client)).rejects.toBe(failure);
    expect(requests(mock)).toHaveLength(1);
    expect(writes(mock)).toHaveLength(0);
  });
});

describe("renewal and release business constraints", () => {
  test.each([deployCapacityScale, deployCapacityRenew])(
    "postpaid instance rejects prepaid configuration",
    async (command) => {
      const mock = mockClient({ output: INSTANCE });
      await expect(
        run(command, { ...IDS, inputTpm: 0, outputTpm: 0, ...PREPAID }, mock.client),
      ).rejects.toMatchObject({ exitCode: ExitCode.USAGE });
      expect(writes(mock)).toHaveLength(0);
    },
  );

  test.each([undefined, false])(
    "renewing changed capacity requires isChange=true, not %s",
    async (isChange) => {
      const mock = mockClient({ output: { ...INSTANCE, charge_type: "pre_paid" } });
      await expect(
        run(
          deployCapacityRenew,
          { ...IDS, ...PREPAID, inputTpm: 0, outputTpm: 0, isChange },
          mock.client,
        ),
      ).rejects.toMatchObject({
        exitCode: ExitCode.USAGE,
        message: expect.stringContaining("--is-change true"),
      });
      expect(writes(mock)).toHaveLength(0);
    },
  );

  test.each([
    { inputTpm: 0, outputTpm: 0, isChange: true },
    { inputTpm: 100, outputTpm: 10, isChange: false },
  ])("renew maps explicit change intent %j", async (capacity) => {
    const mock = mockClient(
      { output: { ...INSTANCE, charge_type: "pre_paid" } },
      { output: OPERATION },
    );
    await run(deployCapacityRenew, { ...IDS, ...PREPAID, ...capacity }, mock.client);
    expect(writes(mock)[0].body).toEqual({
      pre_paid_info: { duration: 31, auto_renewal: false },
      is_change: capacity.isChange,
      ptu_capacity: { input_tpm: capacity.inputTpm, output_tpm: capacity.outputTpm },
    });
  });

  test("renew cannot assume unchanged capacity when configured_capacity is absent", async () => {
    const mock = mockClient({
      output: { ...INSTANCE, charge_type: "pre_paid", configured_capacity: undefined },
    });
    await expect(
      run(deployCapacityRenew, { ...IDS, ...PREPAID, inputTpm: 100, outputTpm: 10 }, mock.client),
    ).rejects.toMatchObject({ exitCode: ExitCode.USAGE });
    expect(writes(mock)).toHaveLength(0);
  });

  test.each(["RUNNING", "STOPPED", "PROCESSING", undefined])(
    "prepaid status=%s blocks direct release even with can_delete=true",
    async (status) => {
      const mock = mockClient({ output: { ...INSTANCE, charge_type: "pre_paid", status } });
      await expect(run(deployCapacityDelete, IDS, mock.client)).rejects.toMatchObject({
        exitCode: ExitCode.USAGE,
        message: expect.stringMatching(/unsubscribe|退订/),
      });
      expect(writes(mock)).toHaveLength(0);
    },
  );

  test.each(["accepted", "rejected"])(
    "FAILED prepaid release is %s by the server, not decided from status alone",
    async (outcome) => {
      const failure = new BailianError("Original refund rule rejection", ExitCode.GENERAL);
      const mock = mockClient(
        { output: { ...INSTANCE, charge_type: "pre_paid", status: "FAILED" } },
        outcome === "accepted" ? { output: OPERATION } : failure,
      );
      const result = run(deployCapacityDelete, IDS, mock.client);
      if (outcome === "accepted") await result;
      else
        await expect(result).rejects.toMatchObject({
          message: failure.message,
          exitCode: ExitCode.GENERAL,
        });
      expect(writes(mock)).toHaveLength(1);
      expect(writes(mock)[0]).toMatchObject({ method: "DELETE", path: INSTANCE_PATH });
    },
  );

  test.each([
    { reason: undefined, query: "" },
    { reason: "", query: "?reason=" },
    {
      reason: "release / capacity & keep model",
      query: "?reason=release+%2F+capacity+%26+keep+model",
    },
  ])(
    "release reason=$reason is a query parameter; never deletes ModelCode",
    async ({ reason, query }) => {
      const mock = mockClient({ output: INSTANCE }, { output: OPERATION });
      await run(deployCapacityDelete, { ...IDS, reason }, mock.client);
      expect(writes(mock)[0]).toMatchObject({ method: "DELETE", path: `${INSTANCE_PATH}${query}` });
      expect(writes(mock)[0]).not.toHaveProperty("body");
      expect(requests(mock).some(({ path }) => path === DEPLOYMENT_PATH)).toBe(false);
    },
  );
});

describe.each(MUTATIONS)("$name wait lifecycle", (mutation) => {
  test("submits once, waits only with GETs, keeps operation ID and stderr submitted record", async () => {
    const { mock, completed, instance, deployment } = waitingClient(mutation);
    const result = run(
      mutation.command,
      { ...mutation.flags, requestId: REQUEST_ID, wait: true },
      mock.client,
    );
    const assertion = expect(result).resolves.toBeUndefined();
    await Promise.all([assertion, vi.advanceTimersByTimeAsync(10_000)]);
    expectSingleSubmission(mock, mutation);
    expect(requests(mock).filter(({ path }) => path === OPERATION_PATH).length).toBeGreaterThan(0);
    expect(JSON.parse(stdout)).toEqual({
      ...completed,
      instance,
      deployment,
      client_request_id: REQUEST_ID,
    });
    expect(JSON.parse(stderr)).toEqual({
      submitted: true,
      deployed_model: MODEL_CODE,
      operation_id: OPERATION_ID,
      client_request_id: REQUEST_ID,
    });
  });

  test("already-SUCCEEDED submission refreshes without polling that terminal operation again", async () => {
    const { mock, initial, instance, deployment } = waitingClient(mutation, {
      initialStatus: "SUCCEEDED",
    });
    await run(
      mutation.command,
      { ...mutation.flags, requestId: REQUEST_ID, wait: true },
      mock.client,
    );
    expectSingleSubmission(mock, mutation);
    expect(requests(mock).some(({ path }) => path === OPERATION_PATH)).toBe(false);
    expect(JSON.parse(stdout)).toEqual({
      ...initial,
      instance,
      deployment,
      client_request_id: REQUEST_ID,
    });
    expect(JSON.parse(stderr)).toMatchObject({ submitted: true, operation_id: OPERATION_ID });
  });

  test("preserves submitted operation ID even when poll response omits its echo", async () => {
    const { mock } = waitingClient(mutation, { omitPollId: true });
    const result = run(mutation.command, { ...mutation.flags, wait: true }, mock.client);
    const assertion = expect(result).resolves.toBeUndefined();
    await Promise.all([assertion, vi.advanceTimersByTimeAsync(10_000)]);
    expect(JSON.parse(stdout).output.operation_id).toBe(OPERATION_ID);
    expectSingleSubmission(mock, mutation);
  });

  test("missing operation ID says already submitted and never retries", async () => {
    const response = { output: { operation_status: "PROCESSING" } };
    const mock = mutationClient(mutation, response);
    await expect(
      run(mutation.command, { ...mutation.flags, wait: true }, mock.client),
    ).rejects.toMatchObject({
      exitCode: ExitCode.GENERAL,
      message: expect.stringMatching(/submitted.*operation ID|已提交/),
      cause: { ...response, client_request_id: expect.stringMatching(UUID) },
    });
    expectSingleSubmission(mock, mutation);
    expect(requests(mock).at(-1)?.method).toBe(mutation.method);
    expect(stdout).toBe("");
  });

  test("wait timeout retains submitted identifiers, removes local timers, and never resubmits", async () => {
    const { mock } = waitingClient(mutation, { pollStatus: "PROCESSING" });
    const result = run(
      mutation.command,
      { ...mutation.flags, requestId: REQUEST_ID, wait: true, interval: 2, pollTimeout: 3 },
      mock.client,
    );
    const rejection = expect(result).rejects.toMatchObject({ exitCode: ExitCode.TIMEOUT });
    await Promise.all([rejection, vi.advanceTimersByTimeAsync(3000)]);
    expect(JSON.parse(stderr)).toMatchObject({
      submitted: true,
      operation_id: OPERATION_ID,
      client_request_id: REQUEST_ID,
    });
    expect(stdout).toBe("");
    expect(vi.getTimerCount()).toBe(0);
    const countAfterTimeout = requests(mock).length;
    await vi.advanceTimersByTimeAsync(600_000);
    expect(requests(mock)).toHaveLength(countAfterTimeout);
    expectSingleSubmission(mock, mutation);
  });

  test("poll error keeps original service message and never repeats the write", async () => {
    const failure = new BailianError("Original polling failure", ExitCode.GENERAL, undefined, {
      api: { httpStatus: 503, apiCode: "Original.Code", requestId: "poll-error" },
      rawResponse: "original poll body",
    });
    const { mock } = waitingClient(mutation, { pollFailure: failure });
    const result = run(mutation.command, { ...mutation.flags, wait: true }, mock.client);
    const rejection = expect(result).rejects.toBe(failure);
    await Promise.all([rejection, vi.advanceTimersByTimeAsync(10_000)]);
    expect(JSON.parse(stderr)).toMatchObject({ submitted: true, operation_id: OPERATION_ID });
    expect(stdout).toBe("");
    expectSingleSubmission(mock, mutation);
  });
});

describe("release completion confirmation", () => {
  test.each([false, undefined])(
    "STOPPED and zero capacity are not release when deleted=%s",
    async (deleted) => {
      const mutation = MUTATIONS.find(({ name }) => name === "delete")!;
      const { mock, instance } = waitingClient(mutation);
      Object.assign(instance.output, {
        deleted,
        status: "STOPPED",
        effective_capacity: { input_tpm: 0, output_tpm: 0 },
      });
      const result = run(deployCapacityDelete, { ...IDS, wait: true }, mock.client);
      const rejection = expect(result).rejects.toMatchObject({
        exitCode: ExitCode.GENERAL,
        message: expect.stringMatching(/deleted|release|释放/i),
      });
      await Promise.all([rejection, vi.advanceTimersByTimeAsync(10_000)]);
      expect(stdout).toBe("");
      expectSingleSubmission(mock, mutation);
    },
  );
});

describe("ModelCode overflow update and read-back", () => {
  test.each(["enable", "disable"])(
    "dry-run %s performs neither PUT nor confirmation GET",
    async (strategy) => {
      const mock = mockClient();
      await run(deployOverflow, { deployedModel: MODEL_CODE, strategy }, mock.client, {
        dryRun: true,
      });
      expect(mock.requestJson).not.toHaveBeenCalled();
      expect(JSON.parse(stdout)).toEqual({
        action: "deploy.overflow",
        deployed_model: MODEL_CODE,
        body: { overflow_strategy: strategy },
      });
    },
  );

  test.each(["output", "data"])(
    "confirms %s read-back and preserves both raw envelopes",
    async (envelope) => {
      for (const strategy of ["enable", "disable"]) {
        stdout = "";
        const response = {
          request_id: "update-request",
          [envelope]: { overflow_strategy: strategy, future_flag: false },
        };
        const deployment = {
          request_id: "get-request",
          [envelope]: {
            overflow_strategy: strategy,
            ptu_capacity: { input_tpm: 0 },
            future_count: 0,
          },
        };
        const mock = mockClient(response, deployment);
        await run(deployOverflow, { deployedModel: MODEL_CODE, strategy }, mock.client);
        expect(requests(mock).map(({ method, path }) => ({ method, path }))).toEqual([
          { method: "PUT", path: `${DEPLOYMENT_PATH}/update-overflowstrategy` },
          { method: "GET", path: DEPLOYMENT_PATH },
        ]);
        expect(writes(mock)[0].body).toEqual({ overflow_strategy: strategy });
        expect(JSON.parse(stdout)).toEqual({ ...response, deployment });
      }
    },
  );

  test.each(["disable", "FUTURE_STRATEGY", undefined])(
    "unconfirmed read-back=%s errors without repeating update",
    async (strategy) => {
      const response = { output: { accepted: true } };
      const deployment = { output: { overflow_strategy: strategy } };
      const mock = mockClient(response, deployment);
      await expect(
        run(deployOverflow, { deployedModel: MODEL_CODE, strategy: "enable" }, mock.client),
      ).rejects.toMatchObject({
        exitCode: ExitCode.GENERAL,
        message: expect.stringMatching(/submitted.*read-back|已提交/),
        cause: { response, deployment },
      });
      expect(writes(mock)).toHaveLength(1);
      expect(requests(mock)).toHaveLength(2);
      expect(stdout).toBe("");
    },
  );

  test.each(["update", "confirmation"])(
    "%s error is preserved without an automatic retry",
    async (phase) => {
      const failure = new BailianError("Original overflow failure", ExitCode.GENERAL, undefined, {
        api: { httpStatus: 503, apiCode: "Overflow.Original", requestId: "server-error" },
      });
      const mock = mockClient(...(phase === "confirmation" ? [{ output: {} }] : []), failure);
      await expect(
        run(deployOverflow, { deployedModel: MODEL_CODE, strategy: "disable" }, mock.client),
      ).rejects.toBe(failure);
      await vi.advanceTimersByTimeAsync(600_000);
      expect(writes(mock)).toHaveLength(1);
      expect(requests(mock)).toHaveLength(phase === "update" ? 1 : 2);
      expect(stdout).toBe("");
    },
  );
});
