/**
 * Deployment lifecycle operations via the **console gateway**.
 *
 * Unlike the DashScope REST endpoints in `api.ts`, start/stop/list-independent
 * are console-domain APIs (`zeldaEasy.broadscope-platform.modelInstance.*`).
 * Commands using these must declare `auth: "console"`.
 */
import type { Client } from "../client/client.ts";
import { unwrapResponse } from "../console/models.ts";

// ---------------------------------------------------------------------------
// API names
// ---------------------------------------------------------------------------

export const DEPLOY_START_API = "zeldaEasy.broadscope-platform.modelInstance.startModelService";
export const DEPLOY_STOP_API = "zeldaEasy.broadscope-platform.modelInstance.stopModelService";
export const DEPLOY_LIST_INDEPENDENT_API =
  "zeldaEasy.broadscope-platform.modelInstance.listIndependentDeployedModel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModelServiceEntry {
  modelServiceId?: string;
  deployedModel?: string;
  deployed_model?: string;
  status?: string;
  modelName?: string;
  model_name?: string;
  plan?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// API wrappers
// ---------------------------------------------------------------------------

/** Start (bring online) a stopped deployment. */
export async function startModelService(
  client: Client,
  modelServiceId: string,
): Promise<Record<string, unknown>> {
  const raw = await client.console<Record<string, unknown>>(DEPLOY_START_API, {
    input: { modelServiceId },
  });
  return unwrapResponse(raw);
}

/** Stop (take offline) a running deployment. Stops billing for mu/ptu plans. */
export async function stopModelService(
  client: Client,
  modelServiceId: string,
): Promise<Record<string, unknown>> {
  const raw = await client.console<Record<string, unknown>>(DEPLOY_STOP_API, {
    input: { modelServiceId },
  });
  return unwrapResponse(raw);
}

/**
 * List independently deployed models (console domain).
 * Used for precheck status verification and ID mapping.
 * Paginates internally to return all entries.
 */
export async function listIndependentDeployedModels(client: Client): Promise<ModelServiceEntry[]> {
  const allEntries: ModelServiceEntry[] = [];
  let page = 1;

  while (true) {
    const raw = await client.console<Record<string, unknown>>(DEPLOY_LIST_INDEPENDENT_API, {
      input: { pageNo: page, pageSize: 50 },
    });
    const resp = unwrapResponse(raw);
    const records = (resp.records ?? []) as ModelServiceEntry[];
    allEntries.push(...records);
    const pageCount = (resp.pageCount as number) ?? 1;
    if (page >= pageCount || records.length === 0) break;
    page++;
  }

  return allEntries;
}

/**
 * Find a deployment entry by its identifier in the console-domain list.
 * Matches against `modelServiceId`, `deployedModel`, or `deployed_model`.
 */
export function findDeploymentEntry(
  entries: ModelServiceEntry[],
  deployedModel: string,
): ModelServiceEntry | undefined {
  return entries.find(
    (entry) =>
      entry.modelServiceId === deployedModel ||
      entry.deployedModel === deployedModel ||
      entry.deployed_model === deployedModel,
  );
}
