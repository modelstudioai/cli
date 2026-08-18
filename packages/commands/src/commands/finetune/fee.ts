/**
 * Best-effort actual training fee calculation using the model catalog's
 * "ft" (fine-tune) price entry. Pure API-key domain — no console auth needed.
 *
 * The model catalog (`listFoundationModels` via public gateway) returns a
 * `prices[]` array **only when `queryPrice: true` is passed** (the same flag
 * `fetchModelDetail` uses). Combined with the job's `output.usage` (actual
 * consumed tokens, present on SUCCEEDED / CANCELED), this gives the exact
 * training cost without any console-domain login.
 */
import {
  callConsoleGateway,
  effectiveConsoleGatewayConfig,
  unwrapResponse,
  MODEL_LIST_API,
  type Settings,
  type ModelPriceInfo,
} from "bailian-cli-core";

export interface ActualFee {
  cost: number;
  unitPrice: number;
  priceUnit: string;
}

/**
 * Fetch the model's training price from the public catalog gateway.
 * Uses the same anonymous gateway path as `fetchModelCapability` (no console
 * token required), but adds `queryPrice: true` to include the prices array.
 */
async function fetchTrainingPrice(
  settings: Settings,
  model: string,
): Promise<ModelPriceInfo | null> {
  const eff = effectiveConsoleGatewayConfig(settings);
  const result = await callConsoleGateway(
    { region: eff.consoleRegion, site: eff.consoleSite, switchAgent: eff.consoleSwitchAgent },
    settings.timeout,
    {
      api: MODEL_LIST_API,
      data: {
        input: {
          pageNo: 1,
          pageSize: 10,
          group: true,
          model,
          queryPrice: true,
          querySampleCode: false,
          queryGroupByModel: true,
          queryQuota: false,
          queryQpmInfo: false,
          queryApplyStatus: false,
          queryPermissions: false,
          queryActivationStatus: false,
        },
      },
    },
  );
  const responseData = unwrapResponse(result as Record<string, unknown>);
  const list = (responseData.list as Record<string, unknown>[]) ?? [];
  // The response is grouped; find the exact model in items.
  for (const group of list) {
    const items = (group.items as Record<string, unknown>[]) ?? [];
    for (const item of items) {
      if (item.model === model) {
        const prices = (item.prices as ModelPriceInfo[]) ?? [];
        return prices.find((entry) => entry.type === "ft") ?? null;
      }
    }
    // Flat response fallback (no items nesting).
    if (group.model === model) {
      const prices = (group.prices as ModelPriceInfo[]) ?? [];
      return prices.find((entry) => entry.type === "ft") ?? null;
    }
  }
  return null;
}

/**
 * Compute the actual training fee from the model catalog's "ft" price entry.
 * Returns null when the price is unavailable (network error, model not in
 * catalog, or no "ft" entry). Never throws.
 *
 * Only uses the public model catalog (model metadata) — does NOT call
 * console-domain pricing APIs (modelCenter.getModelPrice). Models whose
 * catalog entry lacks a "ft" price (e.g. CosyVoice) will simply omit the
 * training_cost field until the platform adds it to the catalog.
 */
export async function computeActualFee(
  settings: Settings,
  model: string,
  usageTokens: number,
): Promise<ActualFee | null> {
  try {
    const ftEntry = await fetchTrainingPrice(settings, model);
    const unitPrice = Number(ftEntry?.price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null;
    const priceUnit = ftEntry?.priceUnit ?? "每百万tokens";
    // Catalog price is yuan per million tokens.
    const cost = (usageTokens / 1_000_000) * unitPrice;
    return { cost: Number(cost.toFixed(4)), unitPrice, priceUnit };
  } catch {
    return null;
  }
}
