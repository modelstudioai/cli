import type { Client } from "../client/client.ts";
import { unwrapConsoleResponse } from "../console/response.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

export const CONSOLE_DEPLOY_INSTANCES_API =
  "zeldaEasy.broadscope-platform.modelInstance.listIndependentDeployedModel.m_efm";

export interface ListConsoleDeploymentInstancesParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  modelServiceId?: string;
}

/** One raw page of independent deployment services, not capacity instances or replicas. */
export interface ConsoleDeploymentInstancesPage {
  records: Record<string, unknown>[];
  /** Total number of matching services, not the records array. */
  items: number;
  itemsPerPage: number;
  page: number;
  pageCount: number;
  [key: string]: unknown;
}

export function buildConsoleDeploymentInstancesRequest(
  params: ListConsoleDeploymentInstancesParams = {},
) {
  return {
    input: {
      page: params.page ?? 1,
      itemsPerPage: params.pageSize ?? 10,
      ...(params.keyword !== undefined ? { searchNameKeyword: params.keyword } : {}),
      ...(params.modelServiceId !== undefined ? { modelServiceId: params.modelServiceId } : {}),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeIntegerAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

function isInstancesPage(value: unknown): value is ConsoleDeploymentInstancesPage {
  return (
    isRecord(value) &&
    Array.isArray(value.records) &&
    value.records.every(isRecord) &&
    isSafeIntegerAtLeast(value.items, 0) &&
    isSafeIntegerAtLeast(value.itemsPerPage, 1) &&
    isSafeIntegerAtLeast(value.page, 1) &&
    isSafeIntegerAtLeast(value.pageCount, 0)
  );
}

/** Fetch only the requested page and preserve every business-response field verbatim. */
export async function listConsoleDeploymentInstances(
  client: Pick<Client, "console">,
  params: ListConsoleDeploymentInstancesParams = {},
): Promise<ConsoleDeploymentInstancesPage> {
  const raw = await client.console<unknown>(
    CONSOLE_DEPLOY_INSTANCES_API,
    buildConsoleDeploymentInstancesRequest(params),
  );
  const response = unwrapConsoleResponse(raw);
  if (!isInstancesPage(response)) {
    throw new BailianError(
      "Invalid Console deployment instances page: records must be an array of objects; items and pageCount must be non-negative safe integers; page and itemsPerPage must be positive safe integers. / Console 部署实例分页响应无效：records 必须为对象数组；items 和 pageCount 必须为非负安全整数；page 和 itemsPerPage 必须为正安全整数。",
      ExitCode.GENERAL,
    );
  }
  return response;
}
