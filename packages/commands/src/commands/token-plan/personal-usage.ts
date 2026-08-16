import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

const USAGE_API = "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage";
const SUBSCRIPTION_API = "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/subscription";
const ADDON_API = "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/addon/summary";

const COMMODITY_CN = "sfm_tokenplansolo_public_cn";
const COMMODITY_INTL = "sfm_tokenplansolo_public_intl";
const ADDON_CN = "sfm_tokenplansoloaddon_public_cn";
const ADDON_INTL = "sfm_tokenplansoloaddon_public_intl";

function nested(obj: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const val = obj[key];
  return val && typeof val === "object" && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : undefined;
}

/** Unwrap the console gateway `data.DataV2.data.data` envelope to the business payload. */
function extract(result: Record<string, unknown>): Record<string, unknown> {
  const data = nested(result, "data");
  if (!data) return result;
  const dataV2 = nested(data, "DataV2");
  if (dataV2) {
    const inner = nested(dataV2, "data");
    const innerData = inner ? nested(inner, "data") : undefined;
    return innerData ?? inner ?? dataV2;
  }
  return nested(data, "data") ?? data;
}

export default defineCommand({
  description:
    "Query personal-edition TokenPlan usage (5h/1w percentage, subscription, addon credits)",
  auth: "console",
  usageArgs: "[flags]",
  flags: {},
  exampleArgs: [""],
  async run(ctx) {
    const { settings } = ctx;
    const format = detectOutputFormat(settings.output);
    const intl = settings.consoleSite === "international";

    const [usage, subscription, addon] = await Promise.all([
      ctx.client.console(USAGE_API, {}),
      ctx.client.console(SUBSCRIPTION_API, {
        queryInstanceInfoRequest: { commodityCode: intl ? COMMODITY_INTL : COMMODITY_CN },
      }),
      ctx.client.console(ADDON_API, { commodityCode: intl ? ADDON_INTL : ADDON_CN }),
    ]);

    emitResult(
      {
        usage: extract(usage as Record<string, unknown>),
        subscription: extract(subscription as Record<string, unknown>),
        addonSummary: extract(addon as Record<string, unknown>),
      },
      format,
    );
  },
});
