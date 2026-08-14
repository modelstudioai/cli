import {
  defineCommand,
  detectOutputFormat,
  BailianError,
  ExitCode,
  generateCLIAccessToken,
  callConsoleGateway,
  effectiveConsoleGatewayConfig,
  createBailianControlUser,
  listBailianControlWorkspaces,
  resetBailianControlPolicies4Agent,
  type ConsoleGatewayTarget,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const API = {
  loginInfo: "zeldaEasy.cornerstone-portal.cs-console.loginInfo",
  initSpace: "zeldaEasy.bailian-dash-workspace.space.initSpace",
  queryBuyResult: "zeldaEasy.bailian-commerce.bill.queryBuyPostpaidResult",
  commodityOrderInfo: "zeldaEasy.bailian-commerce.bill.postpaidCommodityOrderInfo",
  buyCommodity: "zeldaEasy.bailian-commerce.bill.buyPostpaidCommodity",
} as const;

const FLAGS = {
  accessKeyId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Alibaba Cloud Access Key ID", "zh-CN": "阿里云 Access Key ID" },
  },
  accessKeySecret: {
    type: "string",
    valueHint: "<secret>",
    description: {
      "en-US": "Alibaba Cloud Access Key Secret",
      "zh-CN": "阿里云 Access Key Secret",
    },
  },
  securityToken: {
    type: "string",
    valueHint: "<token>",
    description: {
      "en-US": "Alibaba Cloud STS Security Token (optional)",
      "zh-CN": "阿里云 STS Security Token（可选）",
    },
  },
} satisfies FlagsDef;

const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 20;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractData(resp: any): any {
  return resp?.data?.DataV2?.data?.data;
}

/**
 * Resolve the agent id from a ListWorkspaces response. Workspaces live under
 * `data.data`; the agent id is the workspace's `tenantId`. Prefer the default
 * workspace (`defaultAgent`), else fall back to the first one.
 */
function extractAgentId(resp: any): number | undefined {
  const workspaces = resp?.data?.data;
  if (!Array.isArray(workspaces) || workspaces.length === 0) return undefined;
  const chosen = workspaces.find((workspace) => workspace?.defaultAgent === true) ?? workspaces[0];
  const tenantId = chosen?.tenantId;
  const agentId = typeof tenantId === "string" ? Number(tenantId) : tenantId;
  return typeof agentId === "number" && Number.isFinite(agentId) ? agentId : undefined;
}

interface CommodityItem {
  commodityCode?: string;
  status?: number;
}

export default defineCommand({
  description: {
    "en-US": "Initialize Bailian workspace and activate postpaid services",
    "zh-CN": "初始化百炼 Workspace 并开通后付费服务",
  },
  auth: "none",
  usageArgs: "--access-key-id <id> --access-key-secret <secret> [--security-token <token>]",
  flags: FLAGS,
  exampleArgs: ["--access-key-id LTAIxxxxx --access-key-secret xxxxx"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(
        {
          apis: [
            {
              step: 0,
              api: "GenerateCLIAccessToken",
              description: "Generate CLI access token from AK/SK",
            },
            {
              step: 1,
              api: API.loginInfo,
              description: "Check login & workspace status",
            },
            {
              step: 2,
              api: API.initSpace,
              description: "Initialize workspace (if needed)",
            },
            {
              step: 3,
              api: "CreateUser",
              description: "Create console user via BailianControl OpenAPI (CreateUser)",
            },
            {
              step: 4,
              api: "ListWorkspaces",
              description: "List workspaces to resolve agentId",
            },
            {
              step: 5,
              api: "ResetPolicies4Agent",
              description: "Authorize user permissions",
            },
            {
              step: 6,
              api: API.queryBuyResult,
              description: "Query postpaid order status",
            },
            {
              step: 7,
              api: API.commodityOrderInfo,
              description: "Query commodity activation status",
            },
            {
              step: 8,
              api: API.buyCommodity,
              description: "Activate postpaid commodities (if needed)",
            },
          ],
        },
        format,
      );
      return;
    }

    const { accessKeyId, accessKeySecret } = flags;
    if (!accessKeyId || !accessKeySecret) {
      throw new BailianError(
        "workspace init requires --access-key-id and --access-key-secret.",
        ExitCode.USAGE,
      );
    }
    const securityToken = flags.securityToken || undefined;

    // Step 0: Exchange AK/SK for a temporary CLI access token used by console calls.
    const tokenResp = await generateCLIAccessToken({
      identity: ctx.identity,
      settings,
      baseUrl: ctx.client.baseUrl,
      accessKeyId,
      accessKeySecret,
      securityToken,
    });
    const accessToken: string | undefined = tokenResp.cliAccessToken;
    if (!accessToken) {
      throw new BailianError("Failed to generate CLI access token from AK/SK.", ExitCode.GENERAL);
    }

    const gateway = effectiveConsoleGatewayConfig(settings);
    const target: ConsoleGatewayTarget = {
      region: gateway.consoleRegion,
      site: gateway.consoleSite,
      ...(gateway.consoleSwitchAgent != null ? { switchAgent: gateway.consoleSwitchAgent } : {}),
      token: accessToken,
    };

    const verbose = settings.verbose;
    const callApi = async (api: string, data: Record<string, unknown> = {}) => {
      if (verbose) process.stderr.write(`> ${api}\n`);
      try {
        const resp = await callConsoleGateway(target, settings.timeout, { api, data }, settings);
        if (verbose) process.stderr.write(`< ${JSON.stringify(resp)}\n`);
        return resp;
      } catch (err) {
        if (verbose) {
          const message =
            err instanceof BailianError ? (err.rawResponse ?? err.message) : String(err);
          process.stderr.write(`< ERROR: ${message}\n`);
        }
        throw err;
      }
    };

    // Step 1: Check login info
    emitBare("Checking workspace status...");
    const loginResp = await callApi(API.loginInfo);
    const loginData = extractData(loginResp);
    const spaceInited = loginData?.spaceInited === true;

    // Step 2: Init space if needed
    if (!spaceInited) {
      emitBare("Initializing workspace...");
      await callApi(API.initSpace);
      emitBare("Workspace initialized.");
    } else {
      emitBare("Workspace already initialized.");
    }

    // Step 3: Create console user via BailianControl OpenAPI (AK/SK signed)
    const uid = loginData?.aliyun?.uid;
    if (typeof uid !== "string" || uid.length === 0) {
      throw new BailianError("Console login info did not include aliyun.uid.", ExitCode.GENERAL);
    }
    const bailianControlAuth = {
      identity: ctx.identity,
      settings,
      baseUrl: ctx.client.baseUrl,
      regionId: gateway.consoleRegion,
      accessKeyId,
      accessKeySecret,
      securityToken,
    };

    try {
      await createBailianControlUser({
        ...bailianControlAuth,
        reqDTO: {
          outerKey: uid,
          nickName: uid,
          userName: uid,
        },
      });
    } catch (err) {
      // Re-running workspace init is idempotent: an already-existing user is
      // not fatal, so swallow it and continue with the remaining steps.
      if (!(err instanceof BailianError) || !/already exists/i.test(err.message)) {
        throw err;
      }
      emitBare("Console user already exists, continuing.");
    }

    // Step 4-5: Resolve the workspace agent id, then authorize user permissions.
    emitBare("Resolving workspace agent...");
    const workspacesResp = await listBailianControlWorkspaces(bailianControlAuth);
    const agentId = extractAgentId(workspacesResp);
    if (agentId == null) {
      throw new BailianError(
        "Could not resolve agentId from ListWorkspaces response.",
        ExitCode.GENERAL,
        "Re-run with --verbose to inspect the ListWorkspaces response body.",
      );
    }

    emitBare("Authorizing user permissions...");
    await resetBailianControlPolicies4Agent({
      ...bailianControlAuth,
      outerKey: uid,
      agentId,
      policyIndexList: [1],
    });

    // Step 6-8: Order & commodity flow
    await ensureCommoditiesActive(callApi, format);
  },
});

type ApiCall = (api: string, data?: Record<string, unknown>) => Promise<any>;

async function ensureCommoditiesActive(call: ApiCall, format: "text" | "json"): Promise<void> {
  emitBare("Checking service activation status...");
  let buyResult: string | undefined;
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const resp = await call(API.queryBuyResult);
    const data = extractData(resp);
    buyResult = typeof data === "string" ? data : data?.result;
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

function extractCommodities(resp: any): CommodityItem[] {
  const data = extractData(resp);
  return Array.isArray(data) ? data : [];
}

async function checkAndActivateCommodities(call: ApiCall, format: "text" | "json"): Promise<void> {
  const resp = await call(API.commodityOrderInfo);
  const items = extractCommodities(resp);

  const overdue = items.filter((c) => c.status === 11);
  if (overdue.length > 0) {
    emitBare("Warning: Some services are overdue:");
    for (const c of overdue) emitBare(`  - ${c.commodityCode}`);
  }

  const notActivated = items.filter((c) => c.status === 1);
  if (notActivated.length > 0) {
    emitBare(`Activating ${notActivated.length} postpaid services...`);
    await call(API.buyCommodity);
    await pollCommoditiesUntilActive(call, format);
    return;
  }

  const active = items.filter((c) => c.status === 10);
  emitResult({ status: "ready", activeServices: active.map((c) => c.commodityCode) }, format);
}

async function pollCommoditiesUntilActive(call: ApiCall, format: "text" | "json"): Promise<void> {
  emitBare("Waiting for services to activate...");
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const resp = await call(API.commodityOrderInfo);
    const items = extractCommodities(resp);

    const pending = items.filter((c) => c.status !== 10 && c.status !== 11);
    if (pending.length === 0) {
      const overdue = items.filter((c) => c.status === 11);
      if (overdue.length > 0) {
        emitBare("Warning: Some services are overdue:");
        for (const c of overdue) emitBare(`  - ${c.commodityCode}`);
      }
      const active = items.filter((c) => c.status === 10);
      emitResult({ status: "ready", activeServices: active.map((c) => c.commodityCode) }, format);
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new BailianError("Timed out waiting for services to activate.", ExitCode.TIMEOUT);
}
