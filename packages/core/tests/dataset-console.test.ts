import { describe, expect, test, vi } from "vite-plus/test";
import type { Client } from "../src/client/client.ts";
import {
  CONSOLE_DATASET_BY_ID_API,
  CONSOLE_DATASET_VERSIONS_API,
  CONSOLE_DATASET_GROUPS_API,
  buildConsoleDatasetGroupsRequest,
  listConsoleDatasetGroups,
  buildConsoleDatasetVersionsRequest,
  listConsoleDatasetVersions,
  getConsoleDatasetById,
  queryConsoleDatasetVersion,
  consoleDatasetStatusAvailability,
} from "../src/dataset/console.ts";

function fixtureClient(payload: unknown) {
  const consoleCall = vi
    .fn<Client["console"]>()
    .mockResolvedValue({ data: { DataV2: { data: { data: payload } } } });
  const client: Pick<Client, "console"> = {
    console: async <Result>(api: string, data: Record<string, unknown>) =>
      (await consoleCall(api, data)) as Result,
  };
  return { client, consoleCall };
}

describe("Console dataset versions", () => {
  test("live array payload also supports exact status lookup without taking another version", async () => {
    const version = {
      datasetId: "version-test",
      datasetGroupId: "group-test",
      releaseStatus: 0,
      fileId: "file-test",
    };
    const { client } = fixtureClient([{ datasetId: "other-version" }, version]);
    expect(await queryConsoleDatasetVersion(client, "version-test", "group-test")).toBe(version);
    expect(await queryConsoleDatasetVersion(client, "absent-version", "group-test")).toBeNull();
  });
  test("builds group requests without frontend-only type restrictions or reload counts", async () => {
    expect(buildConsoleDatasetGroupsRequest()).toEqual({
      input: {
        datasetGroupPageNo: 1,
        datasetGroupPageSize: 10,
        datasetPageSize: 1,
        datasetTaskTypeList: [0],
        datasetTaskPageSize: 1,
      },
    });
    const page = {
      records: [
        {
          datasetGroupId: "group-test",
          datasets: [{ datasetId: "version-test", fileId: "file-test" }],
        },
      ],
      page: 2,
      itemsPerPage: 3,
      items: 7,
      pageCount: 3,
      metadata: { enabled: false, value: null },
    };
    const { client, consoleCall } = fixtureClient(page);
    expect(
      await listConsoleDatasetGroups(client, { page: 2, pageSize: 3, name: "fixture name" }),
    ).toBe(page);
    expect(consoleCall).toHaveBeenCalledExactlyOnceWith(CONSOLE_DATASET_GROUPS_API, {
      input: {
        datasetGroupPageNo: 2,
        datasetGroupPageSize: 3,
        name: "fixture name",
        datasetPageSize: 1,
        datasetTaskTypeList: [0],
        datasetTaskPageSize: 1,
      },
    });
  });
  test("empty group page remains a page, not an API failure", async () => {
    const page = { records: [], page: 1, itemsPerPage: 10, items: 0, pageCount: 0 };
    const { client } = fixtureClient(page);
    expect(await listConsoleDatasetGroups(client)).toBe(page);
  });
  test.each([
    null,
    {},
    { records: [] },
    { records: [{ name: "missing id" }], page: 1, itemsPerPage: 10, items: 1 },
    { records: [], page: 0, itemsPerPage: 10, items: 0 },
    { records: [], page: 1, itemsPerPage: 0, items: 0 },
    { records: [], page: 1, itemsPerPage: 10, items: "0" },
    { records: [], page: 1, itemsPerPage: 10, items: 0, pageCount: -1 },
  ])("rejects malformed group pages without fabricating IDs or empty success %j", async (page) => {
    const { client } = fixtureClient(page);
    await expect(listConsoleDatasetGroups(client)).rejects.toMatchObject({ exitCode: 1 });
  });
  test("normalizes real version arrays and retains version/file binding without coercion", async () => {
    const versions = [
      {
        datasetId: "0000123",
        datasetGroupId: "group-test",
        fileId: "file-test",
        datasetVersion: 0,
        releaseStatus: 3,
        data: null,
        enabled: false,
      },
      { datasetId: "second-version", datasetGroupId: "group-test" },
    ];
    const { client, consoleCall } = fixtureClient(versions);
    const result = await listConsoleDatasetVersions(client, "group-test");
    expect(result.result).toBe(versions);
    expect(result.result[1]).not.toHaveProperty("fileId");
    expect(buildConsoleDatasetVersionsRequest("group-test")).toEqual({
      input: { datasetGroupId: "group-test", datasetTaskTypeList: [0], datasetTaskPageSize: 1 },
    });
    expect(consoleCall).toHaveBeenCalledExactlyOnceWith(
      CONSOLE_DATASET_VERSIONS_API,
      buildConsoleDatasetVersionsRequest("group-test"),
    );
  });
  test.each([
    { result: [], next: null, total: 0 },
    { result: [{ datasetId: "version-test", fileId: null }], future: [false, 0, null] },
  ])("preserves result-object metadata %j", async (payload) => {
    const { client } = fixtureClient(payload);
    expect(await listConsoleDatasetVersions(client, "group-test")).toBe(payload);
  });
  test("empty array normalizes to an empty result", async () => {
    const { client } = fixtureClient([]);
    await expect(listConsoleDatasetVersions(client, "group-test")).resolves.toEqual({ result: [] });
  });
  test.each([
    null,
    {},
    { result: null },
    { result: [null] },
    { result: [{ fileId: "not-a-version" }] },
    { result: [{ datasetId: 123 }] },
    { result: [{ datasetId: "   " }] },
    { result: [{ datasetId: "version-test", datasetGroupId: "other-group" }] },
  ])("rejects unusable version lists or cross-group records %j", async (payload) => {
    const { client } = fixtureClient(payload);
    await expect(listConsoleDatasetVersions(client, "group-test")).rejects.toMatchObject({
      exitCode: 1,
    });
  });
  test("list operations retain nested service errors rather than treating them as empty lists", async () => {
    const { client } = fixtureClient({
      success: false,
      code: "Denied",
      message: "original rejection",
      data: null,
    });
    await expect(listConsoleDatasetGroups(client)).rejects.toThrow("original rejection");
    await expect(listConsoleDatasetVersions(client, "group-test")).rejects.toThrow(
      "original rejection",
    );
  });
  test("metadata uses the exact version ID and preserves unknown fields", async () => {
    const datasetId = "000900719925474099312345";
    const payload = { datasetId, datasetGroupId: "group-test", data: null, extra: [false, 0] };
    const { client, consoleCall } = fixtureClient(payload);
    expect(await getConsoleDatasetById(client, datasetId)).toBe(payload);
    expect(consoleCall).toHaveBeenCalledExactlyOnceWith(CONSOLE_DATASET_BY_ID_API, {
      input: { datasetId },
    });
  });
  test.each(
    [null, false, 0, [], {}, { taskId: "pending-task" }, { datasetId: "wrong-id" }].map(
      (payload) => ({ payload }),
    ),
  )("rejects missing or mismatched metadata $payload", async ({ payload }) => {
    const { client } = fixtureClient(payload);
    await expect(getConsoleDatasetById(client, "version-test")).rejects.toMatchObject({
      exitCode: 1,
    });
  });
  test("requests one import task for the exact version and keeps all returned state", async () => {
    const version = {
      datasetId: "version-test",
      datasetGroupId: "group-test",
      releaseStatus: 3,
      fileId: "file-test",
      datasetTaskDTO: { taskStatus: 23, detail: null },
      extra: [0, false],
    };
    const { client, consoleCall } = fixtureClient({ result: [version] });
    expect(await queryConsoleDatasetVersion(client, "version-test", "group-test")).toBe(version);
    expect(consoleCall).toHaveBeenCalledExactlyOnceWith(CONSOLE_DATASET_VERSIONS_API, {
      input: {
        datasetId: "version-test",
        datasetGroupId: "group-test",
        page: 1,
        itemsPerPage: 1,
        datasetTaskTypeList: [0],
        datasetTaskPageSize: 1,
      },
    });
  });
  test.each(
    [[], [{ datasetId: "other-version" }], [{ fileId: "version-test" }]].map((result) => ({
      result,
    })),
  )("never falls back to a nonmatching record $result", async ({ result }) => {
    const { client } = fixtureClient({ result });
    expect(await queryConsoleDatasetVersion(client, "version-test", "group-test")).toBeNull();
  });
  test.each([
    null,
    {},
    { result: null },
    { result: [null] },
    { result: [{ datasetId: "version-test" }, { datasetId: "version-test" }] },
    { result: [{ datasetId: "version-test", datasetGroupId: "wrong-group" }] },
  ])("rejects malformed, ambiguous or wrong-group responses %j", async (payload) => {
    const { client } = fixtureClient(payload);
    await expect(
      queryConsoleDatasetVersion(client, "version-test", "group-test"),
    ).rejects.toMatchObject({ exitCode: 1 });
  });
  test("status availability is presence only, including zero and unknown future codes", () => {
    expect(
      consoleDatasetStatusAvailability({ releaseStatus: 0, datasetTaskDTO: { taskStatus: 99 } }),
    ).toEqual({ release_status: "returned", import_status: "returned" });
    expect(consoleDatasetStatusAvailability({ releaseStatus: null, datasetTaskDTO: null })).toEqual(
      { release_status: "missing", import_status: "missing" },
    );
    expect(consoleDatasetStatusAvailability(null)).toEqual({
      release_status: "missing",
      import_status: "missing",
    });
  });
  test("both reads propagate service failures without retry", async () => {
    const { client, consoleCall } = fixtureClient({
      success: false,
      errorCode: "ReadDenied",
      errorMsg: "original server denial",
      data: null,
    });
    await expect(getConsoleDatasetById(client, "version-test")).rejects.toThrow(
      "original server denial",
    );
    await expect(queryConsoleDatasetVersion(client, "version-test", "group-test")).rejects.toThrow(
      "original server denial",
    );
    expect(consoleCall).toHaveBeenCalledTimes(2);
  });
});
