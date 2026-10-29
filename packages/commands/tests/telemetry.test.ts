import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import {
  Client,
  UsageError,
  buildSettings,
  httpTransport,
  type AnyCommand,
  type Settings,
} from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import { loadRouteCommands } from "./e2e/harness/routes.ts";
import { ALERT_ROUTES, LOG_ROUTES, MONITOR_ROUTES } from "./e2e/topic-routes.ts";
import {
  autoStep,
  buildTelemetryFilters,
  ensureTelemetryRegionSupported,
  resolveTimeRange,
} from "../src/commands/shared/telemetry.ts";
import {
  buildAlertRuleReqDTO,
  parseCondition,
  validateAlertRuleFlags,
  validateTemplateConditions,
  NO_SILENCE,
} from "../src/commands/alert/shared.ts";

const telemetryCommands = await loadRouteCommands({
  ...ALERT_ROUTES,
  ...MONITOR_ROUTES,
  ...LOG_ROUTES,
});
const workspaceApi = "zeldaEasy.bailian-dash-workspace.space.listWorkspaces";
const workspaceId = "ws-telemetry-test";
const mappedAgent = 87654321;
const originalAgent = 12345678;
const identity = {
  binName: "bl",
  version: "test",
  clientName: "bailian-cli",
  npmPackage: "bailian-cli",
};
interface GatewayRequest {
  Api: string;
  Data: { reqDTO?: Record<string, unknown>; cornerstoneParam: { switchAgent?: number } };
}
let requests: GatewayRequest[] = [];
let stdoutChunks: string[] = [];

function makeTelemetryContext(
  overrides: Partial<Settings> = {},
  flags: Record<string, unknown> = {},
) {
  const settings = {
    ...buildSettings({ flags: {}, file: {}, env: {} }),
    workspaceId,
    consoleSwitchAgent: originalAgent,
    quiet: true,
    telemetry: false,
    ...overrides,
  };
  const client = new Client({
    identity,
    settings,
    baseUrl: "https://dashscope.aliyuncs.com",
    consoleCred: {
      token: "test-console-token",
      source: "config",
      region: "cn-beijing",
      site: "domestic",
      switchAgent: originalAgent,
    },
  });
  return {
    identity,
    settings,
    client,
    flags,
    localize: (text: string | Record<"en-US" | "zh-CN", string>) =>
      typeof text === "string" ? text : text["en-US"],
  };
}

function mockTelemetryGateway(
  respond: (request: GatewayRequest) => unknown = () => ({ list: [], totalCount: 0 }),
  workspaces: unknown[] = [{ workspaceId, tenantId: String(mappedAgent) }],
) {
  requests = [];
  stdoutChunks = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdoutChunks.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  return vi.spyOn(httpTransport, "fetch").mockImplementation(async (_url, init) => {
    if (typeof init?.body !== "string") throw new Error("Expected gateway form body");
    const request: GatewayRequest = JSON.parse(
      new URLSearchParams(init.body).get("params") ?? "{}",
    );
    requests.push(request);
    const payload = request.Api === workspaceApi ? { data: workspaces } : respond(request);
    return new Response(JSON.stringify({ data: { DataV2: { data: { data: payload } } } }));
  });
}

async function runTelemetry(command: AnyCommand, ctx: ReturnType<typeof makeTelemetryContext>) {
  const settings = { ...ctx.settings };
  if (command.defaultOutput !== undefined) {
    if (settings.outputSource !== "flag" && settings.outputSource !== "env") {
      settings.output = command.defaultOutput;
    }
    settings.outputExplicit = true;
  }
  const output = createOutputReporter({ settings, localize: ctx.localize }).output;
  await command.run({ ...ctx, settings, output } as never);
  return stdoutChunks.join("");
}

function assertScopedRequests() {
  expect(requests.filter((request) => request.Api === workspaceApi)).toHaveLength(1);
  expect(requests[0].Data.cornerstoneParam.switchAgent).toBe(originalAgent);
  const businessRequests = requests.filter((request) => request.Api !== workspaceApi);
  expect(businessRequests.length).toBeGreaterThan(0);
  for (const request of businessRequests)
    expect(request.Data.cornerstoneParam.switchAgent, request.Api).toBe(mappedAgent);
}

describe("遥测命令的空间身份与默认 JSON", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test.each(Object.entries(telemetryCommands))(
    "%s 默认 JSON、dry-run 展示解析计划且零网络",
    async (_path, command) => {
      const transport = mockTelemetryGateway();
      const ctx = makeTelemetryContext(
        { dryRun: true },
        {
          requestId: "00000000-0000-0000-0000-000000000001",
          traceId: "test-trace",
          ruleId: "test-rule",
          templateId: "test-template",
          name: "test",
          model: "test-model",
          metric: "model_call_count",
          condition: ["model_call_count:sum:>:1:60"],
          noWait: false,
        },
      );
      const result = JSON.parse(await runTelemetry(command, ctx));
      expect(result.workspaceIdentity).toEqual({
        api: workspaceApi,
        workspaceId,
        switchAgentFrom: "tenantId",
      });
      expect(result.consoleSwitchAgent).toBeUndefined();
      expect(transport).not.toHaveBeenCalled();
      expect(ctx.settings.output).toBe("text");
      expect(ctx.settings.consoleSwitchAgent).toBe(originalAgent);
    },
  );

  test.each([
    ["默认", {}, "json"],
    ["Profile 默认 text", { file: { output: "text" } }, "json"],
    ["显式 --output text", { flags: { output: "text" }, file: { output: "json" } }, "text"],
    ["环境变量 text", { env: { DASHSCOPE_OUTPUT: "text" }, file: { output: "json" } }, "text"],
  ] as const)("三组命令输出来源：%s", async (_label, sources, expectedFormat) => {
    for (const path of ["alert list", "monitor overview", "log inference count"]) {
      mockTelemetryGateway((request) =>
        request.Api.includes("getTelemetryServiceStatus")
          ? { openStatus: true }
          : { list: [], totalCount: 0, callCount: 0 },
      );
      const settings = buildSettings({ flags: {}, file: {}, env: {}, ...sources });
      const stdout = await runTelemetry(telemetryCommands[path], makeTelemetryContext(settings));
      if (expectedFormat === "json") expect(() => JSON.parse(stdout)).not.toThrow();
      else expect(() => JSON.parse(stdout)).toThrow();
      vi.restoreAllMocks();
    }
  });

  test("monitor overview 查询身份贯穿异步轮询且不修改原 Client", async () => {
    vi.useFakeTimers();
    mockTelemetryGateway((request) =>
      request.Data.reqDTO?.asyncTaskId ? { callCount: 0 } : { taskId: "test-task" },
    );
    const ctx = makeTelemetryContext();
    const promise = runTelemetry(telemetryCommands["monitor overview"], ctx);
    await vi.runAllTimersAsync();
    expect(JSON.parse(await promise)).toMatchObject({ callCount: 0 });
    assertScopedRequests();
    expect(requests.at(-1)?.Data.reqDTO?.asyncTaskId).toBe("test-task");
    await ctx.client.console("test-original-client", {});
    expect(requests.at(-1)?.Data.cornerstoneParam.switchAgent).toBe(originalAgent);
    expect(ctx.settings.consoleSwitchAgent).toBe(originalAgent);
  });

  test("alert list 的服务预检和主查询都使用目标身份", async () => {
    mockTelemetryGateway((request) =>
      request.Api.includes("getTelemetryServiceStatus")
        ? { openStatus: true }
        : { list: [{ ruleId: "target-rule" }], totalCount: 1 },
    );
    const stdout = await runTelemetry(telemetryCommands["alert list"], makeTelemetryContext());
    expect(JSON.parse(stdout).list[0].ruleId).toBe("target-rule");
    assertScopedRequests();
    expect(requests.map((request) => request.Api)).toEqual([
      workspaceApi,
      "zeldaEasy.bailian-telemetry.activate.getTelemetryServiceStatus",
      "zeldaEasy.bailian-telemetry.alertRule.listAlertRules",
    ]);
  });

  test("alert 模板复制的预检、源模板查询和写入保持同一身份", async () => {
    mockTelemetryGateway((request) => {
      if (request.Api.includes("getTelemetryServiceStatus")) return { openStatus: true };
      if (request.Api.includes("listAlertTemplates"))
        return { list: [{ conditions: [{ metricName: "model_call_count" }] }] };
      return { templateId: "new-template" };
    });
    await runTelemetry(
      telemetryCommands["alert template create"],
      makeTelemetryContext({}, { name: "test", from: "source-template" }),
    );
    assertScopedRequests();
    expect(requests.at(-1)?.Data.reqDTO?.conditions).toEqual([{ metricName: "model_call_count" }]);
    expect(requests.at(-1)?.Api).toContain("createAlertTemplate");
  });

  test("monitor 投递开通的并行预检、SLR、初始化、轮询与写入保持身份", async () => {
    vi.useFakeTimers();
    let serviceChecks = 0;
    let slrChecks = 0;
    mockTelemetryGateway((request) => {
      if (request.Api.includes("getTelemetryServiceStatus")) {
        serviceChecks += 1;
        return {
          openStatus: serviceChecks > 1,
          instanceStatus: serviceChecks > 2 ? "Ready" : "NotExist",
        };
      }
      if (request.Api.includes("getTelemetryGroupStatus")) return [];
      if (request.Api.includes("getTelemetrySlrStatus")) {
        slrChecks += 1;
        return { result: slrChecks > 1 };
      }
      if (request.Api.includes("initTelemetryStoreInstance") && !request.Data.reqDTO?.asyncTaskId)
        return { taskId: "store-task" };
      return { result: true };
    });
    const promise = runTelemetry(
      telemetryCommands["monitor delivery enable"],
      makeTelemetryContext({}, { noWait: false }),
    );
    await vi.runAllTimersAsync();
    expect(JSON.parse(await promise).activated).toBe(true);
    assertScopedRequests();
    for (const api of [
      "createTelemetrySlr",
      "initCmsService",
      "initTelemetryStoreInstance",
      "enableTelemetryGroup",
    ])
      expect(
        requests.some((request) => request.Api.endsWith(api)),
        api,
      ).toBe(true);
  });

  test("推理详情列表和原始内容回捞均使用目标身份", async () => {
    mockTelemetryGateway((request) =>
      request.Api.endsWith("getModelOriginLog")
        ? { originLog: { request: "request-body", response: "response-body" } }
        : { list: [{ modelRequestId: "test-request", taskUuid: "test-task" }] },
    );
    const stdout = await runTelemetry(
      telemetryCommands["log inference get"],
      makeTelemetryContext({}, { requestId: "test-request" }),
    );
    expect(JSON.parse(stdout)).toMatchObject({
      request: "request-body",
      response: "response-body",
    });
    assertScopedRequests();
    expect(requests.at(-1)?.Data.reqDTO?.taskUuid).toBe("test-task");
  });

  test("日志启用的共享 helper 继承目标身份", async () => {
    mockTelemetryGateway((request) =>
      request.Api.includes("getTelemetryServiceStatus")
        ? { openStatus: true, instanceStatus: "Ready" }
        : { result: true },
    );
    const stdout = await runTelemetry(
      telemetryCommands["log audit enable"],
      makeTelemetryContext({}, { noWait: true }),
    );
    expect(JSON.parse(stdout).enabled).toBe(true);
    assertScopedRequests();
    expect(requests.at(-1)?.Api).toContain("enableTelemetryGroup");
  });

  test.each([
    "alert list",
    "alert delete",
    "monitor overview",
    "monitor delivery enable",
    "log inference count",
  ])("%s 映射失败不发送业务读写", async (path) => {
    mockTelemetryGateway(
      () => ({ openStatus: true, instanceStatus: "Ready", result: true, totalCount: 0 }),
      [],
    );
    await expect(
      runTelemetry(telemetryCommands[path], makeTelemetryContext({}, { ruleId: "test-rule" })),
    ).rejects.toMatchObject({ exitCode: 1 });
    expect(requests.map((request) => request.Api)).toEqual([workspaceApi]);
    expect(stdoutChunks).toEqual([]);
  });

  test.each(["monitor delivery status", "log status"])(
    "%s 并行状态读取使用同一空间身份",
    async (path) => {
      mockTelemetryGateway((request) =>
        request.Api.includes("getTelemetryServiceStatus")
          ? { openStatus: true, instanceStatus: "Ready" }
          : { result: true },
      );
      const stdout = await runTelemetry(telemetryCommands[path], makeTelemetryContext());
      expect(() => JSON.parse(stdout)).not.toThrow();
      assertScopedRequests();
    },
  );

  test("未指定空间时保留原身份且不额外查询空间列表", async () => {
    mockTelemetryGateway(() => ({ callCount: 0 }));
    await runTelemetry(
      telemetryCommands["monitor overview"],
      makeTelemetryContext({ workspaceId: undefined }),
    );
    expect(requests).toHaveLength(1);
    expect(requests[0].Data.cornerstoneParam.switchAgent).toBe(originalAgent);
  });
});

describe("ensureTelemetryRegionSupported", () => {
  test("支持的 region 放行", () => {
    expect(() => ensureTelemetryRegionSupported({ consoleRegion: "cn-beijing" })).not.toThrow();
    expect(() => ensureTelemetryRegionSupported({ consoleRegion: "ap-southeast-1" })).not.toThrow();
  });

  test("未设置 region 时默认 cn-beijing 放行", () => {
    expect(() => ensureTelemetryRegionSupported({})).not.toThrow();
  });

  test("未部署遥测服务的 region 报 UsageError", () => {
    expect(() => ensureTelemetryRegionSupported({ consoleRegion: "cn-shanghai" })).toThrow(
      UsageError,
    );
    expect(() => ensureTelemetryRegionSupported({ consoleRegion: "us-east-1" })).toThrow(
      /not available in console region "us-east-1"/,
    );
  });
});

describe("resolveTimeRange", () => {
  test("默认按 days 向前推", () => {
    const { startTime, endTime } = resolveTimeRange({ days: 7 });
    expect(endTime - startTime).toBe(7 * 86_400_000);
  });

  test("hours 优先于 days", () => {
    const { startTime, endTime } = resolveTimeRange({ days: 7, hours: 2 });
    expect(endTime - startTime).toBe(2 * 3_600_000);
  });

  test("start-time/end-time 覆盖相对窗口", () => {
    const { startTime, endTime } = resolveTimeRange({
      startTime: "2026-08-01T00:00:00+08:00",
      endTime: "2026-08-02T00:00:00+08:00",
    });
    expect(endTime - startTime).toBe(86_400_000);
  });

  test("支持毫秒时间戳字符串", () => {
    const { startTime } = resolveTimeRange({
      startTime: "1754000000000",
      endTime: "1754100000000",
    });
    expect(startTime).toBe(1754000000000);
  });

  test("start 不早于 end 报错", () => {
    expect(() => resolveTimeRange({ startTime: "2026-08-02", endTime: "2026-08-01" })).toThrow(
      UsageError,
    );
  });

  test("非法时间格式报错", () => {
    expect(() => resolveTimeRange({ startTime: "昨天" })).toThrow(UsageError);
  });
});

describe("autoStep", () => {
  const hoursAgo = (hours: number) => ({ startTime: 0, endTime: hours * 3_600_000 });

  test("按时间范围选档", () => {
    expect(autoStep(0, hoursAgo(12).endTime)).toBe(60);
    expect(autoStep(0, hoursAgo(24).endTime)).toBe(3600);
    expect(autoStep(0, hoursAgo(48).endTime)).toBe(3600);
    expect(autoStep(0, hoursAgo(96).endTime)).toBe(3600);
    expect(autoStep(0, hoursAgo(24 * 30).endTime)).toBe(86400);
  });
});

describe("buildTelemetryFilters", () => {
  test("逗号列表拆分并映射字段名", () => {
    const filters = buildTelemetryFilters(
      { model: "a, b ,a", apiKeyId: "k1", callSource: "Online" },
      "ws-1",
    );
    expect(filters).toEqual({
      workspaceId: "ws-1",
      models: ["a", "b"],
      apikeyIds: ["k1"],
      channels: undefined,
      sources: undefined,
      modelCallSource: "Online",
    });
  });
});

describe("validateAlertRuleFlags", () => {
  test("合法配置通过", () => {
    expect(
      validateAlertRuleFlags({ notifyWindow: "09:00-18:00", notifyDays: "1,2,3", silence: 600 }),
    ).toBeUndefined();
  });

  test("notify-window 格式非法", () => {
    expect(validateAlertRuleFlags({ notifyWindow: "9点-18点" })).toContain("--notify-window");
  });

  test("notify-days 超出 1-7", () => {
    expect(validateAlertRuleFlags({ notifyDays: "1,8" })).toContain("--notify-days");
  });

  test("gmt-offset 格式非法", () => {
    expect(validateAlertRuleFlags({ gmtOffset: "8" })).toContain("--gmt-offset");
  });
});

describe("buildAlertRuleReqDTO", () => {
  const base = { name: "n", templateId: "t1", model: "qwen3.6-plus,qwen-turbo" };

  test("默认值与控制台一致", () => {
    const reqDTO = buildAlertRuleReqDTO(base) as {
      resourceIds: string[];
      level: string;
      interval: number;
      notification: {
        startTime: string;
        endTime: string;
        gmtOffset: string;
        dayOfWeek: number[];
        silenceTime: number;
      };
    };
    expect(reqDTO.resourceIds).toEqual(["qwen3.6-plus", "qwen-turbo"]);
    expect(reqDTO.level).toBe("INFO");
    expect(reqDTO.interval).toBe(60);
    expect(reqDTO.notification.startTime).toBe("00:00");
    expect(reqDTO.notification.endTime).toBe("23:59");
    expect(reqDTO.notification.gmtOffset).toBe("+0800");
    expect(reqDTO.notification.dayOfWeek).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(reqDTO.notification.silenceTime).toBe(NO_SILENCE);
  });

  test("通知窗口与静默时间映射", () => {
    const reqDTO = buildAlertRuleReqDTO({
      ...base,
      notifyWindow: "09:00-18:00",
      notifyDays: "6,7",
      silence: 1800,
      contactGroup: "g1,g2",
    }) as {
      notification: {
        startTime: string;
        endTime: string;
        dayOfWeek: number[];
        silenceTime: number;
        contactGroups: string[];
      };
    };
    expect(reqDTO.notification.startTime).toBe("09:00");
    expect(reqDTO.notification.endTime).toBe("18:00");
    expect(reqDTO.notification.dayOfWeek).toEqual([6, 7]);
    expect(reqDTO.notification.silenceTime).toBe(1800);
    expect(reqDTO.notification.contactGroups).toEqual(["g1", "g2"]);
  });
});

describe("parseCondition", () => {
  test("解析五段式条件", () => {
    expect(parseCondition("model_call_failed_count:sum:>:10:60")).toEqual({
      metricName: "model_call_failed_count",
      aggregator: "sum",
      compareType: ">",
      compareValue: "10",
      period: 60,
    });
  });

  test("段数不对报错", () => {
    expect(() => parseCondition("bad-format")).toThrow(UsageError);
  });

  test("非法比较符报错", () => {
    expect(() => parseCondition("m:sum:<>:10:60")).toThrow(UsageError);
  });

  test("period 非正数报错", () => {
    expect(() => parseCondition("m:sum:>:10:0")).toThrow(UsageError);
  });
});

describe("validateTemplateConditions", () => {
  test("无条件且无 --from 报错", () => {
    expect(validateTemplateConditions(undefined, false)).toContain("--condition");
  });

  test("无条件但有 --from 放行", () => {
    expect(validateTemplateConditions(undefined, true)).toBeUndefined();
  });

  test("超过 10 条报错", () => {
    const conditions = Array.from({ length: 11 }, () => "m:sum:>:1:60");
    expect(validateTemplateConditions(conditions, false)).toContain("At most 10");
  });

  test("条件格式错误透传解析报错", () => {
    expect(validateTemplateConditions(["bad"], false)).toContain("Invalid --condition");
  });
});
