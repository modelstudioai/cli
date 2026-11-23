import { withCommandOutput } from "./output/command-context.ts";
import { httpTransport } from "bailian-cli-core";
import {
  BailianError,
  ExitCode,
  type AnyCommand,
  type Client,
  type Settings,
} from "bailian-cli-core";
import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from "vite-plus/test";
import deployRouterVersions from "../src/commands/deploy/router-versions.ts";
import deployRouterCreate from "../src/commands/deploy/router-create.ts";
import deployRouterList from "../src/commands/deploy/router-list.ts";
import deployRouterGet from "../src/commands/deploy/router-get.ts";
import deployRouterUpdate from "../src/commands/deploy/router-update.ts";
import deployRouterDelete from "../src/commands/deploy/router-delete.ts";

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

const DEPLOYED_MODEL = "router-test-id";
const REQUEST_ID = "fc9c0b75-7327-4a86-88e1-a3b7d093da89";
const VALID_CREATE_FLAGS = {
  name: "my-router",
  routeVersion: "v1",
  strategy: "EFFECT_FIRST" as const,
  candidates: "qwen-plus,qwen-turbo",
};
const VALID_UPDATE_FLAGS = {
  deployedModel: DEPLOYED_MODEL,
  routeVersion: "v1",
  strategy: "COST_FIRST" as const,
  candidates: "qwen-plus,qwen-turbo",
};

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
  const context = withCommandOutput({
    identity: {
      binName: "test-cli",
      version: "test",
      npmPackage: "test-cli",
      clientName: "test-cli",
    },
    settings: { ...SETTINGS, ...settings },
    flags,
    client,
  }) as Parameters<AnyCommand["run"]>[0];
  const preparation = await command.prepare?.(context);
  if (preparation && context.settings.dryRun) {
    context.output.result({
      plan: preparation.preview,
      risk: preparation.risk,
      notices: preparation.notices.map((notice) => ({
        ...notice,
        message: context.localize(notice.message),
      })),
    });
    return;
  }
  await command.run({ ...context, prepared: preparation?.data });
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
  vi.spyOn(httpTransport, "fetch").mockImplementation(
    vi.fn().mockRejectedValue(new Error("Real network is forbidden")),
  );
});

afterEach(() => {
  try {
    expect(httpTransport.fetch).not.toHaveBeenCalled();
    for (const mock of mocks) expect(mock.request).not.toHaveBeenCalled();
    if (vi.isFakeTimers()) expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

// ---------------------------------------------------------------------------
// 1. Metadata
// ---------------------------------------------------------------------------

describe("router command metadata", () => {
  const ALL_COMMANDS = [
    { name: "versions", command: deployRouterVersions },
    { name: "create", command: deployRouterCreate },
    { name: "list", command: deployRouterList },
    { name: "get", command: deployRouterGet },
    { name: "update", command: deployRouterUpdate },
    { name: "delete", command: deployRouterDelete },
  ];

  test.each(ALL_COMMANDS)("$name uses auth apiKey and defaultOutput json", ({ command }) => {
    expect(command.auth).toBe("apiKey");
    expect(command.defaultOutput).toBe("json");
  });

  test.each(ALL_COMMANDS)("$name has bilingual descriptions", ({ command }) => {
    expect(command.description).toMatchObject({
      "en-US": expect.any(String),
      "zh-CN": expect.any(String),
    });
  });

  test("create declares high risk with billing reason", () => {
    expect(deployRouterCreate.risk).toMatchObject({
      level: "high",
      reason: "billing",
    });
  });

  test("delete declares high risk with destructive reason", () => {
    expect(deployRouterDelete.risk).toMatchObject({
      level: "high",
      reason: "destructive",
    });
  });

  test.each([
    { name: "versions", command: deployRouterVersions },
    { name: "list", command: deployRouterList },
    { name: "get", command: deployRouterGet },
    { name: "update", command: deployRouterUpdate },
  ])("$name has no risk declaration", ({ command }) => {
    expect(command.risk).toBeUndefined();
  });

  test.each(ALL_COMMANDS)(
    "$name does not declare a --yes flag (runtime injects it)",
    ({ command }) => {
      expect(command.flags).not.toHaveProperty("yes");
    },
  );
});

// ---------------------------------------------------------------------------
// 2. Validation
// ---------------------------------------------------------------------------

describe("router validation", () => {
  describe("validateRouterName", () => {
    test("accepts a valid name", async () => {
      expect(await validate(deployRouterCreate, VALID_CREATE_FLAGS)).toBeUndefined();
    });

    test("rejects empty name", async () => {
      expect(await validate(deployRouterCreate, { ...VALID_CREATE_FLAGS, name: "" })).toMatch(
        /--name/,
      );
    });

    test("rejects name longer than 64 characters", async () => {
      const longName = "a".repeat(65);
      expect(await validate(deployRouterCreate, { ...VALID_CREATE_FLAGS, name: longName })).toMatch(
        /--name/,
      );
    });

    test("rejects name with underscore", async () => {
      expect(
        await validate(deployRouterCreate, { ...VALID_CREATE_FLAGS, name: "my_router" }),
      ).toMatch(/--name/);
    });

    test("rejects name with space", async () => {
      expect(
        await validate(deployRouterCreate, { ...VALID_CREATE_FLAGS, name: "my router" }),
      ).toMatch(/--name/);
    });
  });

  describe("validateRouterConfig", () => {
    test("rejects empty --route-version", async () => {
      expect(
        await validate(deployRouterCreate, { ...VALID_CREATE_FLAGS, routeVersion: "  " }),
      ).toMatch(/--route-version/);
    });

    test.each(["qwen-plus, ", "qwen-plus,,qwen-turbo", " ", ""])(
      "rejects empty candidate in %j",
      async (candidates) => {
        expect(await validate(deployRouterCreate, { ...VALID_CREATE_FLAGS, candidates })).toMatch(
          /--candidates/,
        );
      },
    );

    test("accepts valid config", async () => {
      expect(await validate(deployRouterCreate, VALID_CREATE_FLAGS)).toBeUndefined();
    });
  });

  describe("validateRouterUpdate", () => {
    test("requires at least one configuration field", async () => {
      expect(await validate(deployRouterUpdate, { deployedModel: DEPLOYED_MODEL })).toMatch(
        /--route-version.*--strategy.*--candidates/,
      );
    });

    test.each([
      { routeVersion: "v2" },
      { strategy: "COST_FIRST" as const },
      { candidates: "qwen-plus,qwen-turbo" },
    ])("accepts one provided configuration field: %j", async (update) => {
      expect(
        await validate(deployRouterUpdate, { deployedModel: DEPLOYED_MODEL, ...update }),
      ).toBeUndefined();
    });

    test("rejects an explicitly empty route version", async () => {
      expect(
        await validate(deployRouterUpdate, {
          deployedModel: DEPLOYED_MODEL,
          routeVersion: "  ",
        }),
      ).toMatch(/--route-version/);
    });

    test.each(["", " ", "qwen-plus,", ",qwen-plus", "qwen-plus,,qwen-turbo"])(
      "rejects invalid explicit candidates %j",
      async (candidates) => {
        expect(
          await validate(deployRouterUpdate, { deployedModel: DEPLOYED_MODEL, candidates }),
        ).toMatch(/--candidates/);
      },
    );
  });

  describe("validateRouterVersionsPagination", () => {
    test("rejects page=0", async () => {
      expect(await validate(deployRouterVersions, { page: 0 })).toMatch(/--page/);
    });

    test("rejects page-size=0", async () => {
      expect(await validate(deployRouterVersions, { pageSize: 0 })).toMatch(/--page-size/);
    });

    test("rejects page-size=1001", async () => {
      expect(await validate(deployRouterVersions, { pageSize: 1001 })).toMatch(/--page-size/);
    });

    test("accepts page-size=1000", async () => {
      expect(await validate(deployRouterVersions, { pageSize: 1000 })).toBeUndefined();
    });
  });

  describe("validateRouterListPagination", () => {
    test("rejects page-size > 100", async () => {
      expect(await validate(deployRouterList, { pageSize: 101 })).toMatch(/--page-size/);
    });

    test("accepts page-size=100", async () => {
      expect(await validate(deployRouterList, { pageSize: 100 })).toBeUndefined();
    });
  });

  describe("validateRouterResource", () => {
    test("rejects empty --deployed-model", async () => {
      expect(await validate(deployRouterGet, { deployedModel: "   " })).toMatch(/--deployed-model/);
    });

    test("accepts valid deployed-model", async () => {
      expect(await validate(deployRouterGet, { deployedModel: DEPLOYED_MODEL })).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Dry-run (zero network)
// ---------------------------------------------------------------------------

describe("router dry-run (zero network)", () => {
  test("router-create dry-run outputs action, body with plan=mr and charge_type=post_paid", async () => {
    const mock = mockClient();
    await run(deployRouterCreate, VALID_CREATE_FLAGS, mock.client, { dryRun: true });
    expect(mock.requestJson).not.toHaveBeenCalled();
    const result = JSON.parse(stdout);
    expect(result).toMatchObject({
      action: "deploy.router.create",
      body: {
        name: "my-router",
        plan: "mr",
        charge_type: "post_paid",
        routing_config: {
          route_model_version: "v1",
          strategy: "EFFECT_FIRST",
          candidate_model_ids: ["qwen-plus", "qwen-turbo"],
        },
      },
    });
  });

  test("router-update complete dry-run stays offline and previews the full request", async () => {
    const mock = mockClient();
    await run(deployRouterUpdate, VALID_UPDATE_FLAGS, mock.client, { dryRun: true });
    expect(mock.requestJson).not.toHaveBeenCalled();
    const result = JSON.parse(stdout);
    expect(result).toEqual({
      plan: {
        action: "deploy.router.update",
        deployed_model: DEPLOYED_MODEL,
        body: {
          routing_config: {
            route_model_version: "v1",
            strategy: "COST_FIRST",
            candidate_model_ids: ["qwen-plus", "qwen-turbo"],
          },
        },
      },
      risk: null,
      notices: [],
    });
  });

  test("router-update partial dry-run only reads and previews the merged request", async () => {
    const mock = mockClient({
      data: {
        plan: "mr",
        status: "RUNNING",
        routing_config: {
          route_model_version: "v1",
          strategy: "EFFECT_FIRST",
          candidate_model_ids: ["qwen-plus", "qwen-turbo"],
          offline_model_ids: ["qwen-offline"],
          future_field: { enabled: true },
        },
      },
    });
    await run(
      deployRouterUpdate,
      { deployedModel: DEPLOYED_MODEL, strategy: "COST_FIRST" },
      mock.client,
      { dryRun: true },
    );
    expect(requests(mock).map(({ method }) => method)).toEqual(["GET"]);
    expect(JSON.parse(stdout)).toMatchObject({
      plan: {
        action: "deploy.router.update",
        deployed_model: DEPLOYED_MODEL,
        body: {
          routing_config: {
            route_model_version: "v1",
            strategy: "COST_FIRST",
            candidate_model_ids: ["qwen-plus", "qwen-turbo"],
            offline_model_ids: ["qwen-offline"],
            future_field: { enabled: true },
          },
        },
      },
      risk: null,
      notices: [],
    });
  });

  test("router-delete dry-run outputs action and deployed_model", async () => {
    const mock = mockClient();
    await run(deployRouterDelete, { deployedModel: DEPLOYED_MODEL }, mock.client, { dryRun: true });
    expect(mock.requestJson).not.toHaveBeenCalled();
    const result = JSON.parse(stdout);
    expect(result).toEqual({
      action: "deploy.router.delete",
      deployed_model: DEPLOYED_MODEL,
    });
  });

  test("router-versions dry-run outputs action with pagination defaults", async () => {
    const mock = mockClient();
    await run(deployRouterVersions, {}, mock.client, { dryRun: true });
    expect(mock.requestJson).not.toHaveBeenCalled();
    const result = JSON.parse(stdout);
    expect(result).toEqual({
      action: "deploy.router.versions",
      page: 1,
      page_size: 50,
    });
  });

  test("router-list dry-run outputs action with pagination and fixed plan=mr", async () => {
    const mock = mockClient();
    await run(deployRouterList, {}, mock.client, { dryRun: true });
    expect(mock.requestJson).not.toHaveBeenCalled();
    const result = JSON.parse(stdout);
    expect(result).toEqual({
      action: "deploy.router.list",
      page: 1,
      page_size: 10,
      plan: "mr",
    });
  });

  test("router-get dry-run outputs action and deployed_model", async () => {
    const mock = mockClient();
    await run(deployRouterGet, { deployedModel: DEPLOYED_MODEL }, mock.client, { dryRun: true });
    expect(mock.requestJson).not.toHaveBeenCalled();
    const result = JSON.parse(stdout);
    expect(result).toEqual({
      action: "deploy.router.get",
      deployed_model: DEPLOYED_MODEL,
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Runtime behavior
// ---------------------------------------------------------------------------

describe("router-create runtime", () => {
  test("successful create returns server response", async () => {
    const response = {
      request_id: REQUEST_ID,
      output: { deployed_model: DEPLOYED_MODEL, status: "RUNNING" },
    };
    const mock = mockClient(response);
    await run(deployRouterCreate, VALID_CREATE_FLAGS, mock.client);
    expect(requests(mock)).toHaveLength(1);
    expect(JSON.parse(stdout)).toEqual(response);
  });

  test("POST body has fixed plan=mr and charge_type=post_paid", async () => {
    const response = { output: { deployed_model: DEPLOYED_MODEL } };
    const mock = mockClient(response);
    await run(deployRouterCreate, VALID_CREATE_FLAGS, mock.client);
    expect(requests(mock)[0]).toMatchObject({
      method: "POST",
      body: {
        plan: "mr",
        charge_type: "post_paid",
      },
    });
  });

  test("comma-separated candidates are trimmed and deduplicated", async () => {
    const response = { output: { deployed_model: DEPLOYED_MODEL } };
    const mock = mockClient(response);
    await run(
      deployRouterCreate,
      { ...VALID_CREATE_FLAGS, candidates: " qwen-plus , qwen-plus,qwen-turbo " },
      mock.client,
    );
    const body = requests(mock)[0].body as {
      routing_config: { candidate_model_ids: string[] };
    };
    expect(body.routing_config.candidate_model_ids).toEqual(["qwen-plus", "qwen-turbo"]);
  });
});

describe("router-get runtime", () => {
  test.each(["output", "data"] as const)(
    "successful get via %s envelope returns deployment with request_id",
    async (envelope) => {
      const deployment = { plan: "mr", status: "RUNNING", deployed_model: DEPLOYED_MODEL };
      const response = { request_id: REQUEST_ID, [envelope]: deployment };
      const mock = mockClient(response);
      await run(deployRouterGet, { deployedModel: DEPLOYED_MODEL }, mock.client);
      expect(requests(mock)).toHaveLength(1);
      const result = JSON.parse(stdout);
      expect(result).toMatchObject({ plan: "mr", request_id: REQUEST_ID });
    },
  );

  test("rejects non-mr deployment", async () => {
    const response = { request_id: REQUEST_ID, output: { plan: "lora" } };
    const mock = mockClient(response);
    await expect(
      run(deployRouterGet, { deployedModel: DEPLOYED_MODEL }, mock.client),
    ).rejects.toMatchObject({
      exitCode: ExitCode.USAGE,
      message: expect.stringContaining("not a model router"),
    });
    expect(requests(mock)).toHaveLength(1);
  });
});

describe("router-update runtime", () => {
  test("successful update: GET confirms plan=mr + RUNNING then PUT", async () => {
    const getResponse = {
      output: { plan: "mr", status: "RUNNING", deployed_model: DEPLOYED_MODEL },
    };
    const putResponse = { request_id: REQUEST_ID, output: { deployed_model: DEPLOYED_MODEL } };
    const mock = mockClient(getResponse, putResponse);
    await run(deployRouterUpdate, VALID_UPDATE_FLAGS, mock.client);
    expect(requests(mock)).toHaveLength(2);
    expect(requests(mock).map(({ method }) => method)).toEqual(["GET", "PUT"]);
    expect(JSON.parse(stdout)).toEqual(putResponse);
  });

  test("rejects non-RUNNING router", async () => {
    const getResponse = { output: { plan: "mr", status: "STOPPED" } };
    const mock = mockClient(getResponse);
    await expect(run(deployRouterUpdate, VALID_UPDATE_FLAGS, mock.client)).rejects.toMatchObject({
      exitCode: ExitCode.USAGE,
      message: expect.stringContaining("RUNNING"),
    });
    expect(requests(mock)).toHaveLength(1);
  });

  test("rejects non-mr deployment", async () => {
    const getResponse = { output: { plan: "lora", status: "RUNNING" } };
    const mock = mockClient(getResponse);
    await expect(run(deployRouterUpdate, VALID_UPDATE_FLAGS, mock.client)).rejects.toMatchObject({
      exitCode: ExitCode.USAGE,
      message: expect.stringContaining("not a model router"),
    });
    expect(requests(mock)).toHaveLength(1);
  });

  test.each(["output", "data"] as const)(
    "partial update merges the %s envelope and preserves unmodified fields",
    async (envelope) => {
      const currentConfig = {
        route_model_version: "v1",
        strategy: "EFFECT_FIRST",
        candidate_model_ids: ["qwen-plus", "qwen-turbo"],
        offline_model_ids: ["qwen-offline"],
        future_field: { enabled: true },
      };
      const mock = mockClient(
        { [envelope]: { plan: "mr", status: "RUNNING", routing_config: currentConfig } },
        { output: { deployed_model: DEPLOYED_MODEL } },
      );
      await run(
        deployRouterUpdate,
        { deployedModel: DEPLOYED_MODEL, routeVersion: "v2" },
        mock.client,
      );
      expect(requests(mock).map(({ method }) => method)).toEqual(["GET", "PUT"]);
      expect(requests(mock)[1].body).toEqual({
        routing_config: {
          ...currentConfig,
          route_model_version: "v2",
        },
      });
    },
  );

  test("provided candidates replace the full existing list", async () => {
    const mock = mockClient(
      {
        output: {
          plan: "mr",
          status: "RUNNING",
          routing_config: {
            route_model_version: "v1",
            strategy: "EFFECT_FIRST",
            candidate_model_ids: ["old-a", "old-b"],
          },
        },
      },
      { output: { deployed_model: DEPLOYED_MODEL } },
    );
    await run(
      deployRouterUpdate,
      { deployedModel: DEPLOYED_MODEL, candidates: " new-a, new-a,new-b " },
      mock.client,
    );
    expect(requests(mock)[1].body).toMatchObject({
      routing_config: { candidate_model_ids: ["new-a", "new-b"] },
    });
  });

  test("does not PUT when the current routing config is incomplete", async () => {
    const mock = mockClient({
      output: {
        plan: "mr",
        status: "RUNNING",
        routing_config: { strategy: "EFFECT_FIRST", candidate_model_ids: ["a", "b"] },
      },
    });
    await expect(
      run(
        deployRouterUpdate,
        { deployedModel: DEPLOYED_MODEL, strategy: "COST_FIRST" },
        mock.client,
      ),
    ).rejects.toMatchObject({
      exitCode: ExitCode.GENERAL,
      message: expect.stringContaining("routing_config"),
    });
    expect(requests(mock).map(({ method }) => method)).toEqual(["GET"]);
  });

  test("GET and PUT failures are propagated as-is without retry", async () => {
    const getFailure = new BailianError("GET rejected", ExitCode.GENERAL);
    const getMock = mockClient(getFailure);
    await expect(
      run(
        deployRouterUpdate,
        { deployedModel: DEPLOYED_MODEL, strategy: "COST_FIRST" },
        getMock.client,
      ),
    ).rejects.toBe(getFailure);
    expect(requests(getMock).map(({ method }) => method)).toEqual(["GET"]);

    const putFailure = new BailianError("PUT rejected", ExitCode.GENERAL);
    const putMock = mockClient({ output: { plan: "mr", status: "RUNNING" } }, putFailure);
    await expect(run(deployRouterUpdate, VALID_UPDATE_FLAGS, putMock.client)).rejects.toBe(
      putFailure,
    );
    expect(requests(putMock).map(({ method }) => method)).toEqual(["GET", "PUT"]);
  });
});

describe("router-delete runtime", () => {
  test("successful delete: GET confirms plan=mr then DELETE", async () => {
    const deleteResponse = { output: { deployed_model: DEPLOYED_MODEL, deleted: true } };
    const mock = mockClient({ output: { plan: "mr", status: "STOPPED" } }, deleteResponse);
    await run(deployRouterDelete, { deployedModel: DEPLOYED_MODEL }, mock.client);
    expect(requests(mock).map(({ method }) => method)).toEqual(["GET", "DELETE"]);
    expect(JSON.parse(stdout)).toEqual(deleteResponse);
  });

  test("RUNNING state is allowed for model router deletion", async () => {
    const deleteResponse = { output: { deployed_model: DEPLOYED_MODEL, deleted: true } };
    const mock = mockClient({ output: { plan: "mr", status: "RUNNING" } }, deleteResponse);
    await run(deployRouterDelete, { deployedModel: DEPLOYED_MODEL }, mock.client);
    expect(requests(mock).map(({ method }) => method)).toEqual(["GET", "DELETE"]);
    expect(JSON.parse(stdout)).toEqual(deleteResponse);
  });

  test("rejects non-mr deployment", async () => {
    const mock = mockClient({ output: { plan: "ptu" } });
    await expect(
      run(deployRouterDelete, { deployedModel: DEPLOYED_MODEL }, mock.client),
    ).rejects.toMatchObject({
      exitCode: ExitCode.USAGE,
      message: expect.stringContaining("not a model router"),
    });
    expect(requests(mock)).toHaveLength(1);
  });

  test("server error on DELETE is propagated as-is", async () => {
    const failure = new BailianError("Server rejection", ExitCode.GENERAL);
    const mock = mockClient({ output: { plan: "mr", status: "RUNNING" } }, failure);
    await expect(
      run(deployRouterDelete, { deployedModel: DEPLOYED_MODEL }, mock.client),
    ).rejects.toBe(failure);
    expect(requests(mock).map(({ method }) => method)).toEqual(["GET", "DELETE"]);
  });
});

describe("router-list runtime", () => {
  test("passes plan=mr as query parameter with default pagination", async () => {
    const response = {
      request_id: REQUEST_ID,
      output: {
        deployments: [{ deployed_model: DEPLOYED_MODEL }],
        total: 1,
        page_no: 1,
        page_size: 10,
      },
    };
    const mock = mockClient(response);
    await run(deployRouterList, {}, mock.client);
    expect(requests(mock)).toHaveLength(1);
    expect(requests(mock)[0]).toMatchObject({
      method: "GET",
    });
    const result = JSON.parse(stdout);
    expect(result).toMatchObject({
      items: [{ deployed_model: DEPLOYED_MODEL }],
      total: 1,
      page_no: 1,
      page_size: 10,
      request_id: REQUEST_ID,
    });
  });

  test("custom pagination is forwarded", async () => {
    const response = {
      request_id: REQUEST_ID,
      output: { deployments: [], total: 0, page_no: 3, page_size: 20 },
    };
    const mock = mockClient(response);
    await run(deployRouterList, { page: 3, pageSize: 20 }, mock.client);
    expect(requests(mock)).toHaveLength(1);
    const result = JSON.parse(stdout);
    expect(result.page_no).toBe(3);
    expect(result.page_size).toBe(20);
  });
});

describe("router-versions runtime", () => {
  test("default pagination is page=1, pageSize=50", async () => {
    const response = {
      request_id: REQUEST_ID,
      output: {
        route_model_versions: [{ version: "v1" }],
        total: 1,
        total_page: 1,
        page_no: 1,
        page_size: 50,
      },
    };
    const mock = mockClient(response);
    await run(deployRouterVersions, {}, mock.client);
    expect(requests(mock)).toHaveLength(1);
    const result = JSON.parse(stdout);
    expect(result).toMatchObject({
      items: [{ version: "v1" }],
      total: 1,
      total_page: 1,
      page_no: 1,
      page_size: 50,
      request_id: REQUEST_ID,
    });
  });

  test("custom pagination is forwarded to API", async () => {
    const response = {
      request_id: REQUEST_ID,
      output: {
        route_model_versions: [],
        total: 0,
        total_page: 0,
        page_no: 2,
        page_size: 100,
      },
    };
    const mock = mockClient(response);
    await run(deployRouterVersions, { page: 2, pageSize: 100 }, mock.client);
    expect(requests(mock)).toHaveLength(1);
    const result = JSON.parse(stdout);
    expect(result.page_no).toBe(2);
    expect(result.page_size).toBe(100);
  });
});
