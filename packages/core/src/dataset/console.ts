import type { Client } from "../client/client.ts";
import { unwrapConsoleResponse } from "../console/response.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

export const CONSOLE_DATASET_BY_ID_API =
  "zeldaEasy.broadscope-platform.dataset.queryByDatasetId.m_efm";
export const CONSOLE_DATASET_VERSIONS_API = "zeldaEasy.broadscope-platform.dataset.query.m_efm";
export const CONSOLE_DATASET_GROUPS_API = "zeldaEasy.broadscope-platform.datasetGroup.query.m_efm";

export interface ListConsoleDatasetGroupsParams {
  page?: number;
  pageSize?: number;
  name?: string;
}

export interface ConsoleDatasetGroupsPage extends Record<string, unknown> {
  records: Record<string, unknown>[];
  page: number;
  itemsPerPage: number;
  items: number;
}

export interface ConsoleDatasetVersionsResult extends Record<string, unknown> {
  result: Record<string, unknown>[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonblankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIntegerAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

export function buildConsoleDatasetGroupsRequest(params: ListConsoleDatasetGroupsParams = {}) {
  return {
    input: {
      datasetGroupPageNo: params.page ?? 1,
      datasetGroupPageSize: params.pageSize ?? 10,
      ...(params.name !== undefined ? { name: params.name } : {}),
      datasetPageSize: 1,
      datasetTaskTypeList: [0],
      datasetTaskPageSize: 1,
    },
  };
}

/** One page of Console groups with one embedded version preview per group. */
export async function listConsoleDatasetGroups(
  client: Pick<Client, "console">,
  params: ListConsoleDatasetGroupsParams = {},
): Promise<ConsoleDatasetGroupsPage> {
  const raw = await client.console<unknown>(
    CONSOLE_DATASET_GROUPS_API,
    buildConsoleDatasetGroupsRequest(params),
  );
  const response = unwrapConsoleResponse(raw);
  if (
    !isRecord(response) ||
    !Array.isArray(response.records) ||
    !response.records.every((group) => isRecord(group) && isNonblankString(group.datasetGroupId)) ||
    !isIntegerAtLeast(response.page, 1) ||
    !isIntegerAtLeast(response.itemsPerPage, 1) ||
    !isIntegerAtLeast(response.items, 0) ||
    (response.pageCount !== undefined && !isIntegerAtLeast(response.pageCount, 0))
  ) {
    throw new BailianError(
      "Invalid Console dataset groups page: expected records with datasetGroupId and valid page/itemsPerPage/items. / Console 数据集组分页响应无效：需要包含 datasetGroupId 的 records 以及有效的 page/itemsPerPage/items。",
      ExitCode.GENERAL,
    );
  }
  return response as ConsoleDatasetGroupsPage;
}

export function buildConsoleDatasetVersionsRequest(datasetGroupId: string) {
  return { input: { datasetGroupId, datasetTaskTypeList: [0], datasetTaskPageSize: 1 } };
}

function parseConsoleDatasetVersions(response: unknown): ConsoleDatasetVersionsResult {
  // The live Console API returns an array; frontend consumers also support result.
  const normalized = Array.isArray(response) ? { result: response } : response;
  if (
    !isRecord(normalized) ||
    !Array.isArray(normalized.result) ||
    !normalized.result.every(isRecord)
  ) {
    throw new BailianError(
      "Console dataset version response must be an object array or contain a result array of objects. / Console 数据集版本响应必须为对象数组或包含对象数组 result。",
      ExitCode.GENERAL,
    );
  }
  return normalized as ConsoleDatasetVersionsResult;
}

/** Query one group; expose version IDs without inventing pagination/completeness. */
export async function listConsoleDatasetVersions(
  client: Pick<Client, "console">,
  datasetGroupId: string,
): Promise<ConsoleDatasetVersionsResult> {
  const raw = await client.console<unknown>(
    CONSOLE_DATASET_VERSIONS_API,
    buildConsoleDatasetVersionsRequest(datasetGroupId),
  );
  const response = parseConsoleDatasetVersions(unwrapConsoleResponse(raw));
  if (
    !response.result.every(
      (version) =>
        isNonblankString(version.datasetId) &&
        (version.datasetGroupId === undefined || version.datasetGroupId === datasetGroupId),
    )
  ) {
    throw new BailianError(
      "Console dataset versions have missing version IDs or belong to another dataset group. / Console 数据集版本缺少版本 ID 或属于其他数据集组。",
      ExitCode.GENERAL,
    );
  }
  return response;
}

/** datasetId identifies a Console version, not an API-domain file. */
export async function getConsoleDatasetById(
  client: Pick<Client, "console">,
  datasetId: string,
): Promise<Record<string, unknown>> {
  const raw = await client.console<unknown>(CONSOLE_DATASET_BY_ID_API, { input: { datasetId } });
  const dataset = unwrapConsoleResponse(raw);
  if (
    !isRecord(dataset) ||
    ![dataset.datasetId, dataset.datasetGroupId, dataset.datasetName].some(
      (value) => typeof value === "string" && value.trim(),
    )
  ) {
    throw new BailianError(
      "Console dataset query returned no usable metadata. / Console 数据集查询未返回可用元信息。",
      ExitCode.GENERAL,
    );
  }
  if (dataset.datasetId !== undefined && dataset.datasetId !== datasetId) {
    throw new BailianError(
      "Console dataset response does not match the requested version ID. / Console 数据集响应与请求的版本 ID 不匹配。",
      ExitCode.GENERAL,
    );
  }
  return dataset;
}

export function buildConsoleDatasetVersionRequest(datasetId: string, datasetGroupId: string) {
  return {
    input: {
      datasetId,
      datasetGroupId,
      page: 1,
      itemsPerPage: 1,
      datasetTaskTypeList: [0],
      datasetTaskPageSize: 1,
    },
  };
}

/** Exact match only: never fall back to the first or a different version. */
export async function queryConsoleDatasetVersion(
  client: Pick<Client, "console">,
  datasetId: string,
  datasetGroupId: string,
): Promise<Record<string, unknown> | null> {
  const raw = await client.console<unknown>(
    CONSOLE_DATASET_VERSIONS_API,
    buildConsoleDatasetVersionRequest(datasetId, datasetGroupId),
  );
  const response = parseConsoleDatasetVersions(unwrapConsoleResponse(raw));
  const matches = response.result.filter((version) => version.datasetId === datasetId);
  if (matches.length > 1) {
    throw new BailianError(
      "Console dataset query returned multiple matches for one version ID. / Console 数据集查询为同一版本 ID 返回了多个匹配项。",
      ExitCode.GENERAL,
    );
  }
  const version = matches[0] ?? null;
  if (
    version &&
    version.datasetGroupId !== undefined &&
    version.datasetGroupId !== datasetGroupId
  ) {
    throw new BailianError(
      "Console dataset version belongs to a different dataset group. / Console 数据集版本所属组与查询目标不匹配。",
      ExitCode.GENERAL,
    );
  }
  return version;
}

/** A presence report, not a release, validation, or training-readiness decision. */
export function consoleDatasetStatusAvailability(version: Record<string, unknown> | null) {
  const task = version && isRecord(version.datasetTaskDTO) ? version.datasetTaskDTO : undefined;
  return {
    release_status: version?.releaseStatus != null ? "returned" : "missing",
    import_status: task?.taskStatus != null ? "returned" : "missing",
  };
}
