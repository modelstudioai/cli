import { defineCommand, detectOutputFormat, BailianError, ExitCode } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const API = {
  loginInfo: "zeldaEasy.cornerstone-portal.cs-console.loginInfo",
  initSpace: "zeldaEasy.bailian-dash-workspace.space.initSpace",
  queryBuyResult: "zeldaEasy.broadscope-bailian.bill.queryBuyPostpaidResult",
  commodityOrderInfo: "zeldaEasy.broadscope-bailian.bill.postpaidCommodityOrderInfo",
  buyCommodity: "zeldaEasy.broadscope-bailian.bill.buyPostpaidCommodity",
} as const;

const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface CommodityItem {
  commodity?: string;
  status?: number;
  startDate?: string;
}

export default defineCommand({
  description: "Initialize Bailian workspace and activate postpaid services",
  auth: "console",
  usageArgs: "",
  flags: {},
  exampleArgs: [],
  async run(ctx) {
    const { settings } = ctx;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(
        {
          apis: [
            { step: 1, api: API.loginInfo, description: "Check login & workspace status" },
            { step: 2, api: API.initSpace, description: "Initialize workspace (if needed)" },
            { step: 3, api: API.queryBuyResult, description: "Query postpaid order status" },
            {
              step: 4,
              api: API.commodityOrderInfo,
              description: "Query commodity activation status",
            },
            {
              step: 5,
              api: API.buyCommodity,
              description: "Activate postpaid commodities (if needed)",
            },
          ],
        },
        format,
      );
      return;
    }

    const verbose = settings.verbose;
    const callApi = async (api: string) => {
      if (verbose) process.stderr.write(`> ${api}\n`);
      const resp = await ctx.client.console<any>(api, {});
      if (verbose) process.stderr.write(`< ${JSON.stringify(resp)}\n`);
      return resp;
    };

    // Step 1: Check login info
    emitBare("Checking workspace status...");
    const loginInfo = await callApi(API.loginInfo);
    const spaceInited = loginInfo?.spaceInited === true;

    // Step 2: Init space if needed
    if (!spaceInited) {
      emitBare("Initializing workspace...");
      await callApi(API.initSpace);
      emitBare("Workspace initialized.");
    } else {
      emitBare("Workspace already initialized.");
    }

    // Step 3-5: Order & commodity flow
    await ensureCommoditiesActive(callApi, format);
  },
});

type ApiCall = (api: string) => Promise<any>;

async function ensureCommoditiesActive(call: ApiCall, format: "text" | "json"): Promise<void> {
  emitBare("Checking service activation status...");
  let buyResult: string | undefined;
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const resp = await call(API.queryBuyResult);
    buyResult = resp?.result;
    if (buyResult !== "buying") break;
    if (i === 0) emitBare("Service activation in progress, polling...");
    await sleep(POLL_INTERVAL_MS);
  }

  if (buyResult === "fail") {
    throw new BailianError("Service activation failed.", ExitCode.GENERAL);
  }

  if (buyResult === "success") {
    await pollCommoditiesUntilActive(call, format);
    return;
  }

  await checkAndActivateCommodities(call, format);
}

async function checkAndActivateCommodities(call: ApiCall, format: "text" | "json"): Promise<void> {
  const resp = await call(API.commodityOrderInfo);
  const items: CommodityItem[] = resp?.result ?? [];

  const overdue = items.filter((c) => c.status === 11);
  if (overdue.length > 0) {
    emitBare("Warning: Some services are overdue:");
    for (const c of overdue) emitBare(`  - ${c.commodity}`);
  }

  const notActivated = items.filter((c) => c.status === 1);
  if (notActivated.length > 0) {
    emitBare("Activating postpaid services...");
    await call(API.buyCommodity);
    await pollCommoditiesUntilActive(call, format);
    return;
  }

  const active = items.filter((c) => c.status === 10);
  emitResult({ status: "ready", activeServices: active.map((c) => c.commodity) }, format);
}

async function pollCommoditiesUntilActive(call: ApiCall, format: "text" | "json"): Promise<void> {
  emitBare("Waiting for services to activate...");
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const resp = await call(API.commodityOrderInfo);
    const items: CommodityItem[] = resp?.result ?? [];

    const pending = items.filter((c) => c.status !== 10 && c.status !== 11);
    if (pending.length === 0) {
      const overdue = items.filter((c) => c.status === 11);
      if (overdue.length > 0) {
        emitBare("Warning: Some services are overdue:");
        for (const c of overdue) emitBare(`  - ${c.commodity}`);
      }
      const active = items.filter((c) => c.status === 10);
      emitResult({ status: "ready", activeServices: active.map((c) => c.commodity) }, format);
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new BailianError("Timed out waiting for services to activate.", ExitCode.TIMEOUT);
}
