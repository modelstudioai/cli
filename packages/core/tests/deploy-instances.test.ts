import { describe, expect, expectTypeOf, test, vi } from "vite-plus/test";
import type { Client } from "../src/client/client.ts";
import {
  CONSOLE_DEPLOY_INSTANCES_API,
  buildConsoleDeploymentInstancesRequest,
  listConsoleDeploymentInstances,
  type ConsoleDeploymentInstancesPage,
  type ListConsoleDeploymentInstancesParams,
} from "../src/deploy/instances.ts";
import { BailianError } from "../src/errors/base.ts";
import { ExitCode } from "../src/errors/codes.ts";

function makePage(): ConsoleDeploymentInstancesPage {
  return {
    records: [{ modelServiceId: "example-service-id", status: "FUTURE_STATE" }],
    items: 21,
    itemsPerPage: 10,
    page: 1,
    pageCount: 3,
  };
}

function consoleEnvelope(data: unknown) {
  return { data: { DataV2: { data: { data } } } };
}

function fakeClient(response: unknown = consoleEnvelope(makePage())) {
  const consoleCall = vi.fn<Client["console"]>().mockResolvedValue(response);
  const client: Pick<Client, "console"> = {
    console: async <Result>(api: string, data: Record<string, unknown>) =>
      (await consoleCall(api, data)) as Result,
  };
  return { client, consoleCall };
}

describe("Console deployment instances request", () => {
  test("uses the exact Console API with default pagination and no absent filters", async () => {
    const { client, consoleCall } = fakeClient();
    const result = await listConsoleDeploymentInstances(client);
    expectTypeOf(result).toEqualTypeOf<ConsoleDeploymentInstancesPage>();
    expect(CONSOLE_DEPLOY_INSTANCES_API).toBe(
      "zeldaEasy.broadscope-platform.modelInstance.listIndependentDeployedModel.m_efm",
    );
    expect(buildConsoleDeploymentInstancesRequest()).toStrictEqual({
      input: { page: 1, itemsPerPage: 10 },
    });
    expect(consoleCall).toHaveBeenCalledExactlyOnceWith(CONSOLE_DEPLOY_INSTANCES_API, {
      input: { page: 1, itemsPerPage: 10 },
    });
  });

  test("treats explicit undefined params as absent", async () => {
    const { client, consoleCall } = fakeClient();
    const params: ListConsoleDeploymentInstancesParams = {
      page: undefined,
      pageSize: undefined,
      keyword: undefined,
      modelServiceId: undefined,
    };
    await listConsoleDeploymentInstances(client, params);
    expect(buildConsoleDeploymentInstancesRequest(params)).toStrictEqual({
      input: { page: 1, itemsPerPage: 10 },
    });
    expect(consoleCall).toHaveBeenCalledExactlyOnceWith(CONSOLE_DEPLOY_INSTANCES_API, {
      input: { page: 1, itemsPerPage: 10 },
    });
  });

  test("fetches only the second page without following pageCount or imposing max 100", async () => {
    const page = { ...makePage(), items: 901, itemsPerPage: 101, page: 2, pageCount: 9 };
    const { client, consoleCall } = fakeClient(consoleEnvelope(page));
    const params = { page: 2, pageSize: 101 };
    expect(await listConsoleDeploymentInstances(client, params)).toBe(page);
    expect(buildConsoleDeploymentInstancesRequest(params)).toStrictEqual({
      input: { page: 2, itemsPerPage: 101 },
    });
    expect(consoleCall).toHaveBeenCalledExactlyOnceWith(CONSOLE_DEPLOY_INSTANCES_API, {
      input: { page: 2, itemsPerPage: 101 },
    });
  });

  test.each([
    {
      name: "keyword",
      params: { keyword: "example /?&+ 名称" },
      filters: { searchNameKeyword: "example /?&+ 名称" },
    },
    {
      name: "model service ID",
      params: { modelServiceId: "000900719925474099312345" },
      filters: { modelServiceId: "000900719925474099312345" },
    },
    {
      name: "intersection of keyword and model service ID",
      params: { keyword: "example", modelServiceId: "example-service-id" },
      filters: { searchNameKeyword: "example", modelServiceId: "example-service-id" },
    },
  ])("passes the $name filter to the API without local filtering", async ({ params, filters }) => {
    const page = makePage();
    const { client, consoleCall } = fakeClient(consoleEnvelope(page));
    const expectedRequest = { input: { page: 1, itemsPerPage: 10, ...filters } };
    expect(await listConsoleDeploymentInstances(client, params)).toBe(page);
    expect(buildConsoleDeploymentInstancesRequest(params)).toStrictEqual(expectedRequest);
    expect(consoleCall).toHaveBeenCalledExactlyOnceWith(
      CONSOLE_DEPLOY_INSTANCES_API,
      expectedRequest,
    );
  });
});

describe("Console deployment instances response", () => {
  test("preserves complete raw pagination, records, false, zero, null and unknown fields", async () => {
    const record = {
      modelServiceId: "000900719925474099312345",
      deployedModel: "example-deployed-model",
      status: "FUTURE_STATE",
      enabled: false,
      capacity: 0,
      targetCapacity: null,
      data: { success: false, count: 0, value: null },
      futureField: [false, 0, null],
    };
    const page = {
      ...makePage(),
      records: [record],
      futureFlag: false,
      futureCount: 0,
      futureValue: null,
      metadata: { enabled: false, count: 0, value: null },
    };
    const { client } = fakeClient(consoleEnvelope(page));
    const result = await listConsoleDeploymentInstances(client);
    expect(result).toBe(page);
    expect(result).toStrictEqual(page);
    expect(result.records).toBe(page.records);
    expect(result.records[0]).toBe(record);
    expect(result.items).toBe(21);
    expect(result.records[0]).not.toHaveProperty("callable");
    expect(result).not.toHaveProperty("total");
  });

  test("accepts an empty page with zero items and zero pageCount", async () => {
    const page = { records: [], items: 0, itemsPerPage: 10, page: 1, pageCount: 0 };
    const { client } = fakeClient(consoleEnvelope(page));
    expect(await listConsoleDeploymentInstances(client)).toBe(page);
  });

  test.each([undefined, null, false, 0, "invalid page", []].map((response) => ({ response })))(
    "rejects a non-object business page: $response",
    async ({ response }) => {
      const { client } = fakeClient(consoleEnvelope(response));
      await expect(listConsoleDeploymentInstances(client)).rejects.toMatchObject({
        name: "BailianError",
        exitCode: ExitCode.GENERAL,
      });
    },
  );

  test.each(
    [
      undefined,
      null,
      false,
      0,
      "records",
      {},
      [null],
      [false],
      [0],
      ["record"],
      [[]],
      [{}, null],
    ].map((records) => ({ records })),
  )("rejects invalid records without fabricating an empty list: $records", async ({ records }) => {
    const { client } = fakeClient(consoleEnvelope({ ...makePage(), records }));
    await expect(listConsoleDeploymentInstances(client)).rejects.toMatchObject({
      name: "BailianError",
      exitCode: ExitCode.GENERAL,
      message: expect.stringMatching(/Invalid Console.*分页响应无效/),
    });
  });

  test.each(["records", "items", "itemsPerPage", "page", "pageCount"])(
    "rejects a missing required field: %s",
    async (field) => {
      const page = Object.fromEntries(
        Object.entries(makePage()).filter(([name]) => name !== field),
      );
      const { client } = fakeClient(consoleEnvelope(page));
      await expect(listConsoleDeploymentInstances(client)).rejects.toMatchObject({
        name: "BailianError",
        exitCode: ExitCode.GENERAL,
        message: expect.stringMatching(/Invalid Console.*分页响应无效/),
      });
    },
  );

  describe.each(["items", "itemsPerPage", "page", "pageCount"])("invalid %s", (field) => {
    test.each([
      undefined,
      null,
      false,
      "1",
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ])("rejects %s without coercion or a fallback number", async (value) => {
      const { client } = fakeClient(consoleEnvelope({ ...makePage(), [field]: value }));
      await expect(listConsoleDeploymentInstances(client)).rejects.toMatchObject({
        name: "BailianError",
        exitCode: ExitCode.GENERAL,
        message: expect.stringMatching(/Invalid Console.*分页响应无效/),
      });
    });
  });

  test.each(["page", "itemsPerPage"])("rejects zero for %s", async (field) => {
    const { client } = fakeClient(consoleEnvelope({ ...makePage(), [field]: 0 }));
    await expect(listConsoleDeploymentInstances(client)).rejects.toMatchObject({
      name: "BailianError",
      exitCode: ExitCode.GENERAL,
      message: expect.stringMatching(/Invalid Console.*分页响应无效/),
    });
  });

  test("preserves nested service error text before validating or unwrapping its data", async () => {
    const message = "Original service denial: 模型服务暂不可读; diagnostic=opaque";
    const response = consoleEnvelope({
      success: false,
      code: "Deployment.ReadDenied",
      message,
      data: makePage(),
    });
    const { client, consoleCall } = fakeClient(response);
    const request = listConsoleDeploymentInstances(client);
    await expect(request).rejects.toBeInstanceOf(BailianError);
    await expect(request).rejects.toMatchObject({
      exitCode: ExitCode.GENERAL,
      message: expect.stringContaining(message),
    });
    expect(consoleCall).toHaveBeenCalledTimes(1);
  });

  test("propagates client errors without replacing the message or retrying", async () => {
    const error = new BailianError("original console error", ExitCode.GENERAL);
    const { client, consoleCall } = fakeClient();
    consoleCall.mockRejectedValueOnce(error);
    await expect(listConsoleDeploymentInstances(client)).rejects.toBe(error);
    expect(consoleCall).toHaveBeenCalledTimes(1);
  });
});
