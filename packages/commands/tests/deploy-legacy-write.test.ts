import {
  BailianError,
  ExitCode,
  type AnyCommand,
  type Client,
  type Settings,
} from "bailian-cli-core";
import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from "vite-plus/test";
import {
  deployTextCreate,
  deployAudioCreate,
  deployImageCreate,
} from "../src/commands/deploy/create.ts";
import deployScale from "../src/commands/deploy/scale.ts";
import deployDelete from "../src/commands/deploy/delete.ts";

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
const DEPLOYMENT_PATH = "/api/v1/deployments/model%2Ftest";
const INSTANCE_PATH = `${DEPLOYMENT_PATH}/capacity-instances/instance%2Ftest`;
const REQUEST_ID = "fc9c0b75-7327-4a86-88e1-a3b7d093da89";
const CREATE_COMMANDS = [
  { name: "text", command: deployTextCreate },
  { name: "audio", command: deployAudioCreate },
  { name: "image", command: deployImageCreate },
];
const PTU_CREATE = {
  modelName: "base-model",
  plan: "ptu",
  chargeType: "post_paid",
  inputTpm: 10,
  outputTpm: 1,
};
const PTU_SCALE = {
  deployedModel: MODEL_CODE,
  instanceId: INSTANCE_ID,
  inputTpm: 0,
  outputTpm: 0,
};
const INSTANCE = {
  instance_id: INSTANCE_ID,
  charge_type: "post_paid",
  can_scale: true,
  deleted: false,
};
const EMPTY_PAGE = { records: [], items: 0, page: 1, itemsPerPage: 1, pageCount: 0 };
let stdout = "";
let stderr = "";
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

type CommandFlags = Parameters<NonNullable<AnyCommand["validate"]>>[0];

function validate(command: AnyCommand, flags: CommandFlags) {
  return command.validate?.(flags);
}

async function run(
  command: AnyCommand,
  flags: CommandFlags,
  client: Client,
  settings: Partial<Settings> = {},
) {
  const validation = await command.validate?.(flags);
  if (validation)
    throw new BailianError(
      typeof validation === "string" ? validation : validation["en-US"],
      ExitCode.USAGE,
    );
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

beforeEach(() => {
  vi.useFakeTimers();
  stdout = "";
  stderr = "";
  mocks.length = 0;
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
    if (vi.isFakeTimers()) expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

describe("legacy deploy mutation metadata", () => {
  test.each([
    ...CREATE_COMMANDS,
    { name: "scale", command: deployScale },
    { name: "delete", command: deployDelete },
  ])("$name requires high-risk confirmation in both languages", ({ command }) => {
    expect(command.risk).toMatchObject({
      level: "high",
      message: { "en-US": expect.any(String), "zh-CN": expect.any(String) },
    });
    expect(command.flags).not.toHaveProperty("yes");
  });

  test("first create exposes wait but never an idempotency request-id flag", () => {
    expect(deployTextCreate.flags).toHaveProperty("wait");
    expect(deployTextCreate.flags).not.toHaveProperty("requestId");
    expect(deployTextCreate.flags?.displayName).not.toHaveProperty("required", true);
    expect(deployTextCreate.flags?.autoRenewal.type).toBe("boolean");
  });
});

describe.each(CREATE_COMMANDS)("$name create", ({ command }) => {
  test("PTU dry-run accepts no display name and performs no catalog or write request", async () => {
    const mock = mockClient();
    await run(command, PTU_CREATE, mock.client, { dryRun: true });
    expect(mock.requestJson).not.toHaveBeenCalled();
    const result = JSON.parse(stdout);
    expect(result).toMatchObject({
      action: "deploy.create",
      body: {
        model_name: "base-model",
        plan: "ptu",
        charge_type: "post_paid",
        ptu_capacity: { input_tpm: 10, output_tpm: 1 },
      },
    });
    expect(result.body).not.toHaveProperty("name");
    expect(result.body).not.toHaveProperty("pre_paid_info");
  });

  test("MU dry-run skips automatic catalog lookup", async () => {
    const mock = mockClient();
    await run(
      command,
      { modelName: "base-model", displayName: "display", plan: "mu" },
      mock.client,
      { dryRun: true },
    );
    expect(mock.requestJson).not.toHaveBeenCalled();
    expect(JSON.parse(stdout).body).toMatchObject({
      plan: "mu",
      name: "display",
      capacity: 1,
      billing_method: "POST_PAY",
    });
  });

  test("PTU prepaid flags build the purchase body and preserve quiet operation output", async () => {
    const response = {
      request_id: "server-request",
      output: { deployed_model: MODEL_CODE, operation_id: "123", status: "WAIT_TO_DEPLOY" },
    };
    const mock = mockClient(response);
    await run(
      command,
      {
        ...PTU_CREATE,
        chargeType: "pre_paid",
        serviceTier: "ptu_default",
        suffix: "custom",
        duration: 30,
        autoRenewal: false,
      },
      mock.client,
    );
    expect(requests(mock)).toHaveLength(1);
    expect(requests(mock)[0]).toMatchObject({
      method: "POST",
      path: "/api/v1/deployments",
      body: {
        charge_type: "pre_paid",
        service_tier: "ptu_default",
        suffix: "custom",
        ptu_capacity: { input_tpm: 10, output_tpm: 1 },
        pre_paid_info: { duration: 30, auto_renewal: false },
      },
    });
    expect(JSON.parse(stdout)).toEqual(response);
    expect(requests(mock)[0].body).not.toHaveProperty("request_id");
  });

  test("initial create transport timeout is propagated without a retry", async () => {
    const failure = new BailianError("original timeout", ExitCode.TIMEOUT);
    const mock = mockClient(failure);
    await expect(run(command, PTU_CREATE, mock.client)).rejects.toBe(failure);
    expect(requests(mock)).toHaveLength(1);
  });

  test("PTU rejects thinking-output rather than ignoring it", async () => {
    expect(await validate(command, { ...PTU_CREATE, thinkingOutputTpm: 0 })).toMatch(
      /thinking-output-tpm/,
    );
  });

  test.each(["lora", "mu"])("%s requires display-name", async (plan) => {
    expect(await validate(command, { modelName: "base-model", plan })).toMatch(/--display-name/);
  });

  test.each([true, false])(
    "MU explicit input/output stays compatible with quiet=%s",
    async (quiet) => {
      const response = {
        output: { deployed_model: MODEL_CODE, capacity: 2 },
        request_id: "legacy-request",
      };
      const mock = mockClient(response);
      await run(
        command,
        {
          modelName: "base-model",
          displayName: "display",
          plan: "mu",
          deploySpec: "MU1",
          capacity: 2,
          billingMethod: "POST_PAY",
        },
        mock.client,
        { quiet },
      );
      expect(requests(mock)).toHaveLength(1);
      expect(requests(mock)[0]).toMatchObject({ method: "POST", path: "/api/v1/deployments" });
      expect(requests(mock)[0].body).toEqual({
        model_name: "base-model",
        name: "display",
        plan: "mu",
        deploy_spec: "MU1",
        capacity: 2,
        billing_method: "POST_PAY",
      });
      if (quiet) expect(stdout.trim()).toBe(MODEL_CODE);
      else expect(JSON.parse(stdout)).toEqual(response);
    },
  );
});

describe("create plan isolation", () => {
  test.each([
    { chargeType: "post_paid" },
    { serviceTier: "ptu_fast" },
    { suffix: "suffix" },
    { duration: 30 },
    { autoRenewal: false },
    { autoRenewalDuration: 30 },
    { autoRenewalCycle: "Day" },
    { wait: true },
    { interval: 2 },
    { pollTimeout: 30 },
  ])("non-PTU rejects new PTU option %j", async (flags) => {
    for (const plan of ["mu", "lora"]) {
      expect(
        await validate(deployTextCreate, {
          modelName: "base-model",
          displayName: "display",
          plan,
          ...flags,
        }),
      ).toMatch(/PTU/);
    }
  });

  test.each([
    { chargeType: undefined },
    { chargeType: "post_paid", serviceTier: "ptu_default" },
    { chargeType: "post_paid", duration: 30, autoRenewal: false },
    { chargeType: "pre_paid", duration: 30 },
    { chargeType: "pre_paid", duration: 0, autoRenewal: false },
    { chargeType: "pre_paid", duration: 30, autoRenewal: true },
    { inputTpm: -1 },
    { outputTpm: 1.5 },
    { inputTpm: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects invalid PTU purchase %j before any request", async (flags) => {
    const mock = mockClient();
    await expect(
      run(deployTextCreate, { ...PTU_CREATE, ...flags }, mock.client),
    ).rejects.toMatchObject({
      exitCode: ExitCode.USAGE,
    });
    expect(mock.requestJson).not.toHaveBeenCalled();
  });

  test.each([true, false])("legacy LORA output is preserved with quiet=%s", async (quiet) => {
    const response = { output: { deployed_model: MODEL_CODE } };
    const mock = mockClient(response);
    await run(deployTextCreate, { modelName: "base-model", displayName: "display" }, mock.client, {
      quiet,
    });
    expect(requests(mock)[0].body).toEqual({
      model_name: "base-model",
      name: "display",
      plan: "lora",
      capacity: 1,
    });
    if (quiet) expect(stdout.trim()).toBe(MODEL_CODE);
    else expect(JSON.parse(stdout)).toEqual(response);
  });
});

describe("scale capacity validation and dry-run", () => {
  test.each([
    {},
    { inputTpm: 1 },
    { outputTpm: 1 },
    { capacity: 1, inputTpm: 1, outputTpm: 1 },
    { capacity: -1 },
    { capacity: 0.5 },
    { capacity: Infinity },
    { capacity: Number.MAX_SAFE_INTEGER + 1 },
    { inputTpm: -1, outputTpm: 0 },
    { inputTpm: 0, outputTpm: NaN },
    { capacity: 1, instanceId: INSTANCE_ID },
    { capacity: 1, orderType: "UPGRADE" },
    { capacity: 1, duration: 30, autoRenewal: false },
    { capacity: 1, autoRenewal: false },
    { capacity: 1, wait: true },
    { capacity: 1, requestId: REQUEST_ID },
    { capacity: 1, interval: 2 },
    { capacity: 1, pollTimeout: 30 },
    { inputTpm: 1, outputTpm: 1, instanceId: " " },
  ])("rejects invalid flags %j locally", async (flags) => {
    const mock = mockClient();
    await expect(
      run(deployScale, { deployedModel: MODEL_CODE, ...flags }, mock.client),
    ).rejects.toMatchObject({ exitCode: ExitCode.USAGE });
    expect(mock.requestJson).not.toHaveBeenCalled();
  });

  test.each([undefined, INSTANCE_ID])(
    "PTU dry-run with instanceId=%s never resolves it",
    async (instanceId) => {
      const mock = mockClient();
      await run(deployScale, { ...PTU_SCALE, instanceId }, mock.client, { dryRun: true });
      expect(mock.requestJson).not.toHaveBeenCalled();
      const result = JSON.parse(stdout);
      expect(result.body).toMatchObject({ ptu_capacity: { input_tpm: 0, output_tpm: 0 } });
      expect(result).not.toHaveProperty("client_request_id");
      if (instanceId) expect(result.body.instance_id).toBe(instanceId);
      else {
        expect(result.body).not.toHaveProperty("instance_id");
        expect(result.instance_resolution).toMatch(/--instance-id/);
      }
    },
  );

  test.each([true, false])("MU body and output remain compatible with quiet=%s", async (quiet) => {
    const response = { output: { deployed_model: MODEL_CODE, capacity: 0 } };
    const mock = mockClient(response);
    await run(deployScale, { deployedModel: MODEL_CODE, capacity: 0 }, mock.client, { quiet });
    expect(requests(mock)).toHaveLength(1);
    expect(requests(mock)[0]).toMatchObject({
      method: "PUT",
      path: `${DEPLOYMENT_PATH}/scale`,
      body: { capacity: 0 },
    });
    expect(requests(mock)[0].body).toEqual({ capacity: 0 });
    if (quiet) expect(stdout.trim()).toBe(MODEL_CODE);
    else expect(JSON.parse(stdout)).toEqual(response);
  });
});

describe.each(["output", "data"] as const)("PTU scale %s envelope", (envelope) => {
  test("explicit ID checks detail, writes nested absolute capacity once and preserves request ID", async () => {
    const response = { request_id: "server-request", [envelope]: { operation_id: "123" } };
    const mock = mockClient({ [envelope]: INSTANCE }, response);
    await run(deployScale, { ...PTU_SCALE, requestId: REQUEST_ID }, mock.client);
    expect(requests(mock).map(({ method, path }) => ({ method, path }))).toEqual([
      { method: "GET", path: INSTANCE_PATH },
      { method: "PUT", path: `${DEPLOYMENT_PATH}/scale` },
    ]);
    expect(requests(mock)[1].body).toEqual({
      instance_id: INSTANCE_ID,
      ptu_capacity: { input_tpm: 0, output_tpm: 0 },
    });
    expect(requests(mock)[1].headers).toEqual({
      "x-acs-req-uuid": REQUEST_ID,
      "X-DashScope-RequestId": REQUEST_ID,
    });
    expect(JSON.parse(stdout)).toEqual({ ...response, client_request_id: REQUEST_ID });
  });

  test("omitted ID resolves a unique page then rechecks detail and generates one UUID", async () => {
    const mock = mockClient(
      { [envelope]: { records: [INSTANCE], items: 1, page: 1, itemsPerPage: 2, pageCount: 1 } },
      { [envelope]: INSTANCE },
      { [envelope]: { operation_id: "123" } },
    );
    await run(deployScale, { ...PTU_SCALE, instanceId: undefined }, mock.client);
    expect(requests(mock)[0].path).toBe(
      `${DEPLOYMENT_PATH}/capacity-instances?page_no=1&page_size=2&include_deleted=false`,
    );
    expect(requests(mock)[1].path).toBe(INSTANCE_PATH);
    expect(requests(mock)[2].body).toHaveProperty("instance_id", INSTANCE_ID);
    expect(JSON.parse(stdout).client_request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  test("prepaid change includes order type and explicit false auto-renewal", async () => {
    const mock = mockClient(
      { [envelope]: { ...INSTANCE, charge_type: "pre_paid" } },
      { [envelope]: { operation_id: "123" } },
    );
    await run(
      deployScale,
      { ...PTU_SCALE, duration: 30, autoRenewal: false, orderType: "DOWNGRADE" },
      mock.client,
    );
    expect(requests(mock)[1].body).toMatchObject({
      order_type: "DOWNGRADE",
      pre_paid_info: { duration: 30, auto_renewal: false },
    });
  });
});

describe("PTU scale prechecks", () => {
  test.each([
    {},
    { records: [] },
    { records: [], items: 0 },
    { records: [INSTANCE] },
    { records: [INSTANCE], items: 2 },
    { records: [INSTANCE, { instance_id: "second" }], items: 2 },
    { records: [INSTANCE], items: 1, page: 2 },
    { records: [INSTANCE], items: 1, pageCount: 2 },
    { records: [{ deleted: false }], items: 1 },
    { records: [{ ...INSTANCE, deleted: true }], items: 1 },
  ])("never blindly selects an instance from %j", async (page) => {
    const mock = mockClient({ output: page });
    await expect(
      run(deployScale, { ...PTU_SCALE, instanceId: undefined }, mock.client),
    ).rejects.toMatchObject({
      exitCode: ExitCode.USAGE,
      message: expect.stringContaining("--instance-id"),
    });
    expect(requests(mock)).toHaveLength(1);
    expect(requests(mock)[0].method).toBe("GET");
  });

  test.each([
    { ...INSTANCE, can_scale: false },
    { ...INSTANCE, can_scale: undefined },
    { ...INSTANCE, deleted: true },
  ])("rejects unavailable/deleted instance %j", async (instance) => {
    const mock = mockClient({ output: instance });
    await expect(run(deployScale, PTU_SCALE, mock.client)).rejects.toBeInstanceOf(BailianError);
    expect(requests(mock)).toHaveLength(1);
  });

  test("rejects prepaid changes for a postpaid instance", async () => {
    const mock = mockClient({ output: INSTANCE });
    await expect(
      run(deployScale, { ...PTU_SCALE, duration: 30, autoRenewal: false }, mock.client),
    ).rejects.toMatchObject({
      exitCode: ExitCode.USAGE,
      message: expect.stringContaining("Postpaid"),
    });
    expect(requests(mock)).toHaveLength(1);
  });

  test.each([{ charge_type: undefined }, { charge_type: "unknown" }, { charge_type: "" }])(
    "fails closed on unknown billing type %j before writing",
    async (override) => {
      const mock = mockClient({ output: { ...INSTANCE, ...override } });
      await expect(run(deployScale, PTU_SCALE, mock.client)).rejects.toMatchObject({
        exitCode: ExitCode.USAGE,
        message: expect.stringContaining("Unknown instance billing type"),
      });
      expect(requests(mock)).toHaveLength(1);
      expect(requests(mock)[0].method).toBe("GET");
    },
  );

  test("write failure is propagated without retrying or issuing another write", async () => {
    const failure = new Error("transport failure");
    const mock = mockClient({ output: INSTANCE }, failure);
    await expect(run(deployScale, PTU_SCALE, mock.client)).rejects.toBe(failure);
    expect(requests(mock).map(({ method }) => method)).toEqual(["GET", "PUT"]);
  });
});

describe("PTU asynchronous write handling", () => {
  test.each([
    { name: "create", command: deployTextCreate, flags: PTU_CREATE },
    { name: "scale", command: deployScale, flags: PTU_SCALE },
  ])("$name treats HTTP-success FAILED as failure", async ({ name, command, flags }) => {
    const response = {
      request_id: "server-request",
      output: {
        operation_id: "123",
        operation_status: "FAILED",
        error_message: "Original server failure",
      },
    };
    const mock =
      name === "scale" ? mockClient({ output: INSTANCE }, response) : mockClient(response);
    await expect(run(command, flags, mock.client)).rejects.toMatchObject({
      message: "Original server failure",
      exitCode: ExitCode.GENERAL,
    });
    expect(requests(mock).filter(({ method }) => method !== "GET")).toHaveLength(1);
  });

  test("wait after legacy scale polls the returned operation without reissuing the write", async () => {
    const mock = mockClient(
      { output: INSTANCE },
      {
        output: { deployed_model: MODEL_CODE, operation_id: "123", operation_status: "PROCESSING" },
      },
      { output: { operation_id: "123", operation_status: "SUCCEEDED" } },
      { output: { deployed_model: MODEL_CODE } },
    );
    const result = run(
      deployScale,
      { ...PTU_SCALE, wait: true, requestId: REQUEST_ID },
      mock.client,
    );
    await Promise.all([
      expect(result).resolves.toBeUndefined(),
      vi.advanceTimersByTimeAsync(10_000),
    ]);
    expect(requests(mock).filter(({ method }) => method !== "GET")).toHaveLength(1);
    expect(requests(mock)[1]).toMatchObject({ method: "PUT", path: `${DEPLOYMENT_PATH}/scale` });
    expect(
      requests(mock)
        .slice(2)
        .every(({ method }) => method === "GET"),
    ).toBe(true);
    expect(requests(mock).map(({ path }) => path)).toContain(
      `${DEPLOYMENT_PATH}/capacity-operations/123`,
    );
    expect(JSON.parse(stdout)).toMatchObject({
      output: { operation_id: "123" },
      client_request_id: REQUEST_ID,
    });
    expect(JSON.parse(stderr)).toEqual({
      submitted: true,
      deployed_model: MODEL_CODE,
      operation_id: "123",
      client_request_id: REQUEST_ID,
    });
  });

  test("create wait with a missing operation ID fails without resubmitting creation", async () => {
    const mock = mockClient({ output: { deployed_model: MODEL_CODE } });
    await expect(
      run(deployTextCreate, { ...PTU_CREATE, wait: true }, mock.client),
    ).rejects.toBeInstanceOf(BailianError);
    expect(requests(mock)).toHaveLength(1);
  });
});

describe("delete safety", () => {
  test.each([false, true])(
    "dry-run with skipPrecheck=%s sends no GET or DELETE",
    async (skipPrecheck) => {
      const mock = mockClient();
      await run(deployDelete, { deployedModel: MODEL_CODE, skipPrecheck }, mock.client, {
        dryRun: true,
      });
      expect(mock.requestJson).not.toHaveBeenCalled();
      expect(JSON.parse(stdout)).toEqual({ action: "deploy.delete", deployed_model: MODEL_CODE });
    },
  );

  test.each([
    { plan: "ptu" },
    { plan: "ptu_v2" },
    { ptu_capacity: { input_tpm: 0, output_tpm: 0 } },
    { ptu_service_tier: "ptu_fast" },
  ])("recognizes PTU from %j and refuses FAILED", async (feature) => {
    const mock = mockClient({ output: { ...feature, status: "FAILED" } });
    await expect(
      run(deployDelete, { deployedModel: MODEL_CODE }, mock.client),
    ).rejects.toMatchObject({
      exitCode: ExitCode.USAGE,
      message: expect.stringContaining("STOPPED"),
    });
    expect(requests(mock)).toHaveLength(1);
  });

  test.each([
    { records: [INSTANCE], items: 1 },
    { records: [{ ...INSTANCE, status: "STOPPED" }], items: 1 },
    { records: [], items: 1 },
    { records: [], items: 0, total: 1 },
    {},
    { records: [] },
    { items: 0 },
    { records: [], items: "0" },
    { records: [], items: 0, page: 2 },
    { records: [], items: 0, pageCount: 2 },
  ])("fails closed for nonempty or unreliable capacity response %j", async (page) => {
    const mock = mockClient({ output: { plan: "ptu", status: "STOPPED" } }, { output: page });
    await expect(
      run(deployDelete, { deployedModel: MODEL_CODE }, mock.client),
    ).rejects.toMatchObject({
      exitCode: ExitCode.USAGE,
    });
    expect(requests(mock).map(({ method }) => method)).toEqual(["GET", "GET"]);
  });

  test.each(["output", "data"] as const)(
    "deletes an empty STOPPED PTU using %s envelope",
    async (envelope) => {
      const response = { [envelope]: { deployed_model: MODEL_CODE, deleted: true } };
      const mock = mockClient(
        { [envelope]: { plan: "ptu", status: "STOPPED" } },
        { [envelope]: EMPTY_PAGE },
        response,
      );
      await run(deployDelete, { deployedModel: MODEL_CODE }, mock.client, { quiet: false });
      expect(requests(mock).map(({ method, path }) => ({ method, path }))).toEqual([
        { method: "GET", path: DEPLOYMENT_PATH },
        {
          method: "GET",
          path: `${DEPLOYMENT_PATH}/capacity-instances?page_no=1&page_size=1&include_deleted=false`,
        },
        { method: "DELETE", path: DEPLOYMENT_PATH },
      ]);
      expect(JSON.parse(stdout)).toEqual(response);
    },
  );

  test.each(["PROCESSING", undefined, "FUTURE_STATE"])(
    "blocks returned operation status=%s",
    async (operationStatus) => {
      const mock = mockClient(
        { output: { plan: "ptu", status: "STOPPED", operation_id: "123" } },
        { output: EMPTY_PAGE },
        { output: { operation_status: operationStatus } },
      );
      await expect(
        run(deployDelete, { deployedModel: MODEL_CODE }, mock.client),
      ).rejects.toMatchObject({
        exitCode: ExitCode.USAGE,
      });
      expect(requests(mock).map(({ method }) => method)).toEqual(["GET", "GET", "GET"]);
      expect(requests(mock)[2].path).toBe(`${DEPLOYMENT_PATH}/capacity-operations/123`);
    },
  );

  test.each(["SUCCEEDED", "FAILED"])(
    "terminal returned operation %s defers final decision to service",
    async (operationStatus) => {
      const failure = new BailianError("Server reports another queued operation", ExitCode.GENERAL);
      const mock = mockClient(
        { output: { plan: "ptu", status: "STOPPED", operation_id: "123" } },
        { output: EMPTY_PAGE },
        { output: { operation_status: operationStatus } },
        failure,
      );
      await expect(run(deployDelete, { deployedModel: MODEL_CODE }, mock.client)).rejects.toBe(
        failure,
      );
      expect(requests(mock).map(({ method }) => method)).toEqual(["GET", "GET", "GET", "DELETE"]);
    },
  );

  test.each(["STOPPED", "FAILED"])(
    "non-PTU %s keeps the original quiet deletion flow",
    async (status) => {
      const mock = mockClient({ output: { plan: "mu", status } }, { output: { deleted: true } });
      await run(deployDelete, { deployedModel: MODEL_CODE }, mock.client);
      expect(requests(mock).map(({ method }) => method)).toEqual(["GET", "DELETE"]);
      expect(stdout.trim()).toBe(MODEL_CODE);
    },
  );

  test("skip-precheck skips only local checks and preserves server rejection", async () => {
    const failure = new BailianError("Server original rejection", ExitCode.GENERAL);
    const mock = mockClient(failure);
    await expect(
      run(deployDelete, { deployedModel: MODEL_CODE, skipPrecheck: true }, mock.client),
    ).rejects.toBe(failure);
    expect(requests(mock).map(({ method }) => method)).toEqual(["DELETE"]);
  });

  test.each(["deployment", "instances", "operation"])(
    "does not swallow %s precheck network failures",
    async (phase) => {
      const failure = new Error("network unavailable");
      const responses: unknown[] = [];
      if (phase !== "deployment")
        responses.push({ output: { plan: "ptu", status: "STOPPED", operation_id: "123" } });
      if (phase === "operation") responses.push({ output: EMPTY_PAGE });
      const mock = mockClient(...responses, failure);
      await expect(run(deployDelete, { deployedModel: MODEL_CODE }, mock.client)).rejects.toBe(
        failure,
      );
      expect(requests(mock).every(({ method }) => method === "GET")).toBe(true);
    },
  );
});
