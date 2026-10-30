import {
  defineCommand,
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
  type CommandContext,
} from "bailian-cli-core";

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

    if (settings.dryRun) {
      ctx.output.result({
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
      });
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
    const gateway = effectiveConsoleGatewayConfig(settings);
    const tokenResp = await generateCLIAccessToken({
      identity: ctx.identity,
      settings: { ...settings, consoleRegion: gateway.consoleRegion },
      debug: (diagnostic) => ctx.output.debug(diagnostic),
      baseUrl: ctx.client.baseUrl,
      accessKeyId,
      accessKeySecret,
      securityToken,
    });
    const accessToken: string | undefined = tokenResp.cliAccessToken;
    if (!accessToken) {
      throw new BailianError("Failed to generate CLI access token from AK/SK.", ExitCode.GENERAL);
    }

    const target: ConsoleGatewayTarget = {
      region: gateway.consoleRegion,
      site: gateway.consoleSite,
      ...(gateway.consoleSwitchAgent != null ? { switchAgent: gateway.consoleSwitchAgent } : {}),
      token: accessToken,
    };

    const callApi = (api: string, data: Record<string, unknown> = {}) =>
      callConsoleGateway(
        target,
        settings.timeout,
        { api, data },
        { debug: (diagnostic) => ctx.output.debug(diagnostic) },
      );

    // Step 1: Check login info
    ctx.output.info({
      "en-US": "Checking workspace status...",
      "zh-CN": "正在检查工作空间状态...",
    });
    const loginResp = await callApi(API.loginInfo);
    const loginData = extractData(loginResp);
    const spaceInited = loginData?.spaceInited === true;

    // Step 2: Init space if needed
    if (!spaceInited) {
      ctx.output.info({ "en-US": "Initializing workspace...", "zh-CN": "正在初始化工作空间..." });
      await callApi(API.initSpace);
      ctx.output.info({ "en-US": "Workspace initialized.", "zh-CN": "工作空间已初始化。" });
    } else {
      ctx.output.info({ "en-US": "Workspace already initialized.", "zh-CN": "工作空间已初始化。" });
    }

    // Step 3: Create console user via BailianControl OpenAPI (AK/SK signed)
    const uid = loginData?.aliyun?.uid;
    if (typeof uid !== "string" || uid.length === 0) {
      throw new BailianError("Console login info did not include aliyun.uid.", ExitCode.GENERAL);
    }
    const bailianControlAuth = {
      identity: ctx.identity,
      settings,
      debug: (diagnostic: Parameters<typeof ctx.output.debug>[0]) => ctx.output.debug(diagnostic),
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
    } catch (error) {
      // Re-running workspace init is idempotent: an already-existing user is
      // not fatal, so swallow it and continue with the remaining steps.
      if (!(error instanceof BailianError) || !/already exists/i.test(error.message)) {
        throw error;
      }
      ctx.output.info({
        "en-US": "Console user already exists, continuing.",
        "zh-CN": "控制台用户已存在，继续执行。",
      });
    }

    // Step 4-5: Resolve the workspace agent id, then authorize user permissions.
    ctx.output.info({
      "en-US": "Resolving workspace agent...",
      "zh-CN": "正在解析工作空间身份...",
    });
    const workspacesResp = await listBailianControlWorkspaces(bailianControlAuth);
    const agentId = extractAgentId(workspacesResp);
    if (agentId == null) {
      throw new BailianError(
        "Could not resolve agentId from ListWorkspaces response.",
        ExitCode.GENERAL,
        ctx.localize({
          "en-US":
            "Check that the workspace is accessible and has a tenantId. Use --verbose for request diagnostics.",
          "zh-CN": "请检查工作空间访问权限及其 tenantId，使用 --verbose 查看请求诊断。",
        }),
      );
    }

    ctx.output.info({ "en-US": "Authorizing user permissions...", "zh-CN": "正在配置用户权限..." });
    await resetBailianControlPolicies4Agent({
      ...bailianControlAuth,
      outerKey: uid,
      agentId,
      policyIndexList: [1],
    });

    // Step 6-8: Order & commodity flow
    ctx.output.result(await ensureCommoditiesActive(callApi, ctx));
  },
});

type ApiCall = (api: string, data?: Record<string, unknown>) => Promise<any>;
type OutputContext = Pick<CommandContext, "output" | "localize" | "settings">;
interface ReadyResult {
  status: "ready";
  activeServices: (string | undefined)[];
}

async function ensureCommoditiesActive(
  call: ApiCall,
  context: OutputContext,
): Promise<ReadyResult> {
  context.output.info({
    "en-US": "Checking service activation status...",
    "zh-CN": "正在检查服务开通状态...",
  });
  let buyResult: string | undefined;
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const resp = await call(API.queryBuyResult);
    const data = extractData(resp);
    buyResult = typeof data === "string" ? data : data?.result;
    if (buyResult !== "buying") break;
    if (attempt === 0)
      context.output.info({
        "en-US": "Service activation in progress, polling...",
        "zh-CN": "服务正在开通，继续轮询...",
      });
    await sleep(POLL_INTERVAL_MS);
  }
  if (buyResult === "fail")
    throw new BailianError(
      context.localize({ "en-US": "Service activation failed.", "zh-CN": "服务开通失败。" }),
      ExitCode.GENERAL,
    );
  if (buyResult === "success") return pollCommoditiesUntilActive(call, context);
  return checkAndActivateCommodities(call, context);
}

function extractCommodities(resp: any): CommodityItem[] {
  const data = extractData(resp);
  return Array.isArray(data) ? data : [];
}

function warnOverdue(items: CommodityItem[], context: OutputContext): void {
  const services = items
    .filter((commodity) => commodity.status === 11)
    .map((commodity) => commodity.commodityCode);
  if (services.length === 0) return;
  const label = context.localize({
    "en-US": "Some services are overdue:",
    "zh-CN": "部分服务已欠费：",
  });
  context.output.warning({
    code: "WORKSPACE_SERVICES_OVERDUE",
    message:
      context.settings.output === "json"
        ? label
        : [label, ...services.map((commodity) => `  - ${commodity}`)].join("\n"),
    ...(context.settings.output === "json" ? { details: { services } } : {}),
  });
}

async function checkAndActivateCommodities(
  call: ApiCall,
  context: OutputContext,
): Promise<ReadyResult> {
  const resp = await call(API.commodityOrderInfo);
  const items = extractCommodities(resp);
  warnOverdue(items, context);
  const notActivated = items.filter((commodity) => commodity.status === 1);
  if (notActivated.length > 0) {
    context.output.info({
      "en-US": `Activating ${notActivated.length} postpaid services...`,
      "zh-CN": `正在开通 ${notActivated.length} 个后付费服务...`,
    });
    await call(API.buyCommodity);
    return pollCommoditiesUntilActive(call, context);
  }
  const active = items.filter((commodity) => commodity.status === 10);
  return { status: "ready", activeServices: active.map((commodity) => commodity.commodityCode) };
}

async function pollCommoditiesUntilActive(
  call: ApiCall,
  context: OutputContext,
): Promise<ReadyResult> {
  context.output.info({
    "en-US": "Waiting for services to activate...",
    "zh-CN": "正在等待服务开通...",
  });
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const resp = await call(API.commodityOrderInfo);
    const items = extractCommodities(resp);
    const pending = items.filter((commodity) => commodity.status !== 10 && commodity.status !== 11);
    if (pending.length === 0) {
      warnOverdue(items, context);
      const active = items.filter((commodity) => commodity.status === 10);
      return {
        status: "ready",
        activeServices: active.map((commodity) => commodity.commodityCode),
      };
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new BailianError(
    context.localize({
      "en-US": "Timed out waiting for services to activate.",
      "zh-CN": "等待服务开通超时。",
    }),
    ExitCode.TIMEOUT,
  );
}
