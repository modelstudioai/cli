/**
 * Console-domain import catalog: base models that support OSS import.
 *
 * The frontend page calls the same zelda API for its "base model" picker.
 * The gateway layer injects `cornerstoneParam` (protocol/console/productCode/
 * switchUserType/consoleSite) and the console access token; the business data
 * payload is empty.
 */
import type { Client } from "../client/client.ts";
import { unwrapResponse } from "../console/models.ts";
import type { SupportImportModel, SupportImportModelsResult } from "./types.ts";

export const LIST_SUPPORT_IMPORT_MODELS_API =
  "zeldaEasy.broadscope-platform.customModel.listSupportImportModels";

/**
 * List base models that currently support custom-model import.
 *
 * Requires a console credential (`client.console` throws AUTH without one);
 * callers that treat this as an optional precheck must catch that error.
 */
export async function listSupportImportModels(client: Client): Promise<SupportImportModelsResult> {
  const raw = await client.console<Record<string, unknown>>(LIST_SUPPORT_IMPORT_MODELS_API, {});
  const response = unwrapResponse(raw) as {
    total?: number;
    pageNo?: number;
    pageSize?: number;
    list?: SupportImportModel[];
  };
  return {
    total: response.total,
    pageNo: response.pageNo,
    pageSize: response.pageSize,
    list: response.list ?? [],
  };
}

/** Exact (case-insensitive) match on the catalog `model` ID. */
export function findSupportImportModel(
  models: readonly SupportImportModel[],
  baseModel: string,
): SupportImportModel | undefined {
  const target = baseModel.trim().toLowerCase();
  return models.find((entry) => String(entry.model ?? "").toLowerCase() === target);
}

/**
 * Console train type required by an import weight type.
 *
 * The catalog's `supportTrainTypes` uses the fine-tune vocabulary: `sft`
 * (full-parameter) and `efficient_sft` (LoRA). Mapping the import
 * `weight_type` onto that vocabulary lets callers reject unsupported
 * combinations before the service answers with its opaque
 * "No import access for base model" error.
 */
export function requiredTrainTypeForWeightType(weightType: string): "sft" | "efficient_sft" {
  return weightType === "lora" ? "efficient_sft" : "sft";
}
