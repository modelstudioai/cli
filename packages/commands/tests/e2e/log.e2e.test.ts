import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { Client, ExitCode, httpTransport, type AnyCommand, type Settings } from "bailian-cli-core";
import auditList from "../../src/commands/log/audit-list.ts";
import auditGet from "../../src/commands/log/audit-get.ts";
import auditCount from "../../src/commands/log/audit-count.ts";
import inferenceCount from "../../src/commands/log/inference-count.ts";
import inferenceList from "../../src/commands/log/inference-list.ts";
import workspaceList from "../../src/commands/workspace/list.ts";
import { parseStdoutJson, runCommandE2e, runCommandInProcess } from "./helpers.ts";
import { LOG_ROUTES } from "./topic-routes.ts";

describe("审计与推理日志请求与响应契约", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const originLog = {
    request_id: "00000000-0000-0000-0000-000000000001",
    model: "test-model",
    start_unix_timestamp: "1793145600000",
    status_code: "200",
    duration: "759",
    workspace_id: "ws-audit-test",
    apikey_id: "test-key-id",
    usage: '{"input_tokens":23,"output_tokens":7,"total_tokens":30}',
  };
  const rawEntry = { originLog, channel: "default", source: "model" };
  const workspaceApi = "zeldaEasy.bailian-dash-workspace.space.listWorkspaces";
  const mappedAgent = 87654321;
  let stdoutChunks: string[] = [];
  let requests: {
    Api: string;
    Data: { reqDTO: Record<string, unknown>; cornerstoneParam: Record<string, unknown> };
  }[] = [];

  async function runAudit(
    command: AnyCommand,
    list: unknown[],
    overrides: Partial<Settings> = {},
    flags: Record<string, unknown> = {},
    language: "en-US" | "zh-CN" = "en-US",
    mockOptions: {
      workspaces?: unknown[];
      async?: boolean | "never";
      workspaceError?: string;
      listError?: string;
      listPayload?: unknown;
      workspaceEnvelope?: "bare" | "direct";
      countPayload?: unknown;
    } = {},
  ) {
    const settings: Settings = {
      output: "json",
      outputExplicit: true,
      timeout: 30,
      watermark: true,
      verbose: false,
      quiet: true,
      dryRun: false,
      telemetry: false,
      ...overrides,
    };
    const identity = {
      binName: "bl",
      version: "test",
      clientName: "bailian-cli",
      npmPackage: "bailian-cli",
    };
    requests = [];
    vi.spyOn(httpTransport, "fetch").mockImplementation(async (_url, init) => {
      if (typeof init?.body !== "string") throw new Error("Expected a console gateway form body.");
      const body = new URLSearchParams(init.body);
      const request = JSON.parse(body.get("params") ?? "{}");
      requests.push(request);
      let payload: unknown;
      if (request.Api === workspaceApi) {
        if (mockOptions.workspaceError) {
          return new Response(
            JSON.stringify({
              data: { success: false, errorCode: mockOptions.workspaceError },
            }),
          );
        }
        const workspaces = mockOptions.workspaces ?? [
          { workspaceId: "ws-default", tenantId: "12345678", defaultAgent: true },
          {
            workspaceId: settings.workspaceId ?? "ws-audit-test",
            tenantId: String(mappedAgent),
            agentName: "测试空间",
            defaultAgent: false,
          },
        ];
        payload = { data: workspaces, totalCount: workspaces.length };
        if (mockOptions.workspaceEnvelope) {
          return new Response(
            JSON.stringify(mockOptions.workspaceEnvelope === "bare" ? payload : { data: payload }),
          );
        }
      } else if (request.Api === "zeldaEasy.bailian-telemetry.model.countModelLogs") {
        // 旧计数接口与两类列表总数不一致，用差异化响应锁住计数口径回归。
        payload = "countPayload" in mockOptions ? mockOptions.countPayload : { totalCount: 0 };
      } else if (mockOptions.listError) {
        return new Response(
          JSON.stringify({
            data: { success: false, errorCode: mockOptions.listError },
          }),
        );
      } else if (
        mockOptions.async &&
        (mockOptions.async === "never" || !request.Data.reqDTO.asyncTaskId)
      ) {
        payload = { taskId: "test-audit-task" };
      } else {
        payload =
          "listPayload" in mockOptions
            ? typeof mockOptions.listPayload === "function"
              ? mockOptions.listPayload(request.Data.reqDTO)
              : mockOptions.listPayload
            : { list, totalCount: list.length, nextToken: "next-page" };
      }
      return new Response(JSON.stringify({ data: { DataV2: { data: { data: payload } } } }));
    });
    stdoutChunks = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
    const client = new Client({
      identity,
      settings,
      baseUrl: "https://dashscope.aliyuncs.com",
      consoleCred: {
        token: "test-console-credential",
        source: "config",
        region: "cn-beijing",
        site: "domestic",
        switchAgent: settings.consoleSwitchAgent,
      },
    });
    await command.run({
      identity,
      settings,
      flags,
      client,
      localize: (text: string | Record<"en-US" | "zh-CN", string>) =>
        typeof text === "string" ? text : text[language],
    } as never);
    return {
      stdout: stdoutChunks.join(""),
      request: requests.at(-1) ?? { Api: "", Data: { reqDTO: {}, cornerstoneParam: {} } },
      requests,
      settings,
    };
  }

  test("审计列表从 originLog 映射调用元数据，保留原始记录与分页信息", async () => {
    const result = await runAudit(auditList, [rawEntry], { workspaceId: "ws-audit-test" });
    const data = parseStdoutJson<{
      list: Record<string, unknown>[];
      totalCount: number;
      nextToken: string;
    }>(result.stdout);
    expect(data.list[0]).toMatchObject({
      modelRequestId: originLog.request_id,
      model: originLog.model,
      startTime: 1793145600000,
      httpStatusCode: 200,
      callDuration: 759,
      workspaceId: originLog.workspace_id,
      apikeyId: originLog.apikey_id,
      originLog,
    });
    expect(data.totalCount).toBe(1);
    expect(data.nextToken).toBe("next-page");
  });

  test("审计列表文本不再出现 NaN 或缺失调用元数据", async () => {
    const result = await runAudit(auditList, [rawEntry], { output: "text" });
    expect(result.stdout).not.toContain("NaN");
    expect(result.stdout).toContain(originLog.request_id);
    expect(result.stdout).toContain("test-model");
    expect(result.stdout).toContain("759 ms");
    expect(result.stdout).toContain("23/7");
  });

  test("无效或缺失时间显示占位符", async () => {
    const result = await runAudit(
      auditList,
      [{ originLog: { start_unix_timestamp: "not-a-number" } }, { originLog: {} }],
      { output: "text" },
    );
    expect(result.stdout).not.toContain("NaN");
  });

  test("已规范化字段优先于 originLog，保留合法零值", async () => {
    const result = await runAudit(auditList, [
      {
        ...rawEntry,
        modelRequestId: "normalized-request",
        model: "normalized-model",
        startTime: 0,
        httpStatusCode: 0,
        callDuration: 0,
        usage: { input_tokens: "0", output_tokens: "0" },
      },
    ]);
    const data = parseStdoutJson<{ list: Record<string, unknown>[] }>(result.stdout);
    expect(data.list[0]).toMatchObject({
      modelRequestId: "normalized-request",
      model: "normalized-model",
      startTime: 0,
      httpStatusCode: 0,
      callDuration: 0,
      usage: { input_tokens: "0", output_tokens: "0" },
    });
  });

  test.each([auditList, auditGet, auditCount])(
    "空间不一致时拒绝输出其他空间的记录",
    async (command) => {
      await expect(
        runAudit(
          command,
          [rawEntry],
          { workspaceId: "ws-requested" },
          {
            requestId: originLog.request_id,
          },
        ),
      ).rejects.toMatchObject({
        exitCode: ExitCode.GENERAL,
        message: expect.stringContaining("workspace"),
        hint: expect.stringContaining("--workspace-id"),
      });
      expect(stdoutChunks).toEqual([]);
    },
  );

  test("混合空间的整页结果不被静默过滤或输出", async () => {
    await expect(
      runAudit(
        auditList,
        [
          rawEntry,
          {
            originLog: { ...originLog, workspace_id: "ws-other" },
          },
        ],
        { workspaceId: "ws-audit-test" },
      ),
    ).rejects.toMatchObject({ exitCode: ExitCode.GENERAL });
    expect(stdoutChunks).toEqual([]);
  });

  test("请求指定空间但记录无法验证空间时拒绝输出", async () => {
    await expect(
      runAudit(auditList, [{ model: "test-model" }], {
        workspaceId: "ws-audit-test",
      }),
    ).rejects.toMatchObject({ exitCode: ExitCode.GENERAL });
    expect(stdoutChunks).toEqual([]);
  });

  test("空间校验错误支持中文", async () => {
    await expect(
      runAudit(auditList, [rawEntry], { workspaceId: "ws-requested" }, {}, "zh-CN"),
    ).rejects.toMatchObject({ message: expect.stringContaining("工作空间") });
  });

  test("空结果不误判为空间错配", async () => {
    const result = await runAudit(auditList, [], { workspaceId: "ws-audit-test" });
    expect(parseStdoutJson<{ list: unknown[] }>(result.stdout).list).toEqual([]);
  });

  test("审计详情同样映射 originLog", async () => {
    const result = await runAudit(
      auditGet,
      [rawEntry],
      { workspaceId: "ws-audit-test" },
      {
        requestId: originLog.request_id,
      },
    );
    expect(parseStdoutJson(result.stdout)).toMatchObject({
      modelRequestId: originLog.request_id,
      model: originLog.model,
      startTime: 1793145600000,
      originLog,
    });
  });

  test("144 小时保持为六天，Offline 过滤不被覆盖", async () => {
    const result = await runAudit(
      auditList,
      [],
      {},
      {
        hours: 144,
        endTime: "1793145600000",
        callSource: "Offline",
      },
    );
    expect(result.request.Data.reqDTO).toMatchObject({
      startTime: 1792627200000,
      endTime: 1793145600000,
      modelCallSource: "Offline",
    });
  });

  test("请求同时对齐空间过滤与 cornerstoneParam 查询身份", async () => {
    const result = await runAudit(
      auditList,
      [],
      {
        workspaceId: "ws-audit-test",
        consoleSwitchAgent: 12345678,
      },
      {
        startTime: "1793134609661",
        endTime: "1793156209661",
        maxResults: 10,
        callSource: "Online",
      },
    );
    expect(result.request.Api).toBe("zeldaEasy.bailian-telemetry.platform-model.listModelLogs");
    expect(result.request.Data.reqDTO).toMatchObject({
      workspaceId: "ws-audit-test",
      filterWorkspaceId: "ws-audit-test",
      startTime: 1793134609661,
      endTime: 1793156209661,
      maxResults: 10,
      skip: 0,
      modelCallSource: "Online",
      needFullContent: false,
    });
    expect(result.request.Data.cornerstoneParam.switchAgent).toBe(mappedAgent);
  });

  test.each([auditList, auditGet, auditCount])(
    "指定空间自动解析身份，不修改原配置",
    async (command) => {
      const result = await runAudit(
        command,
        [rawEntry],
        { workspaceId: "ws-audit-test", consoleSwitchAgent: 12345678 },
        { requestId: originLog.request_id },
      );
      expect(result.requests.map((request) => request.Api)).toEqual([
        workspaceApi,
        "zeldaEasy.bailian-telemetry.platform-model.listModelLogs",
      ]);
      expect(result.request.Data.cornerstoneParam.switchAgent).toBe(mappedAgent);
      expect(result.request.Data.reqDTO).toMatchObject({
        workspaceId: "ws-audit-test",
        filterWorkspaceId: "ws-audit-test",
      });
      expect(result.settings.consoleSwitchAgent).toBe(12345678);
    },
  );

  test.each([auditList, auditGet, auditCount])(
    "异步审计轮询始终携带解析后的身份",
    async (command) => {
      const result = await runAudit(
        command,
        [rawEntry],
        { workspaceId: "ws-audit-test", consoleSwitchAgent: 12345678 },
        { requestId: originLog.request_id },
        "en-US",
        { async: true },
      );
      expect(result.requests).toHaveLength(3);
      for (const request of result.requests.slice(1)) {
        expect(request.Data.cornerstoneParam.switchAgent).toBe(mappedAgent);
        expect(request.Data.reqDTO.workspaceId).toBe("ws-audit-test");
      }
      expect(result.request.Data.reqDTO.asyncTaskId).toBe("test-audit-task");
    },
  );

  test.each([auditList, auditGet, auditCount])("找不到空间时不发日志查询", async (command) => {
    await expect(
      runAudit(command, [], { workspaceId: "ws-missing" }, {}, "en-US", { workspaces: [] }),
    ).rejects.toMatchObject({
      exitCode: ExitCode.GENERAL,
      message: expect.stringContaining("workspace"),
    });
    expect(requests.map((request) => request.Api)).toEqual([workspaceApi]);
    expect(stdoutChunks).toEqual([]);
  });

  test.each([undefined, "", "invalid", "12.5", 0, -1, true, "9007199254740992"])(
    "无效 tenantId %s 不回退默认查询身份",
    async (tenantId) => {
      await expect(
        runAudit(auditList, [], { workspaceId: "ws-audit-test" }, {}, "en-US", {
          workspaces: [{ workspaceId: "ws-audit-test", tenantId }],
        }),
      ).rejects.toMatchObject({ exitCode: ExitCode.GENERAL });
      expect(requests.map((request) => request.Api)).toEqual([workspaceApi]);
    },
  );

  test("重复空间映射拒绝猜测查询身份", async () => {
    await expect(
      runAudit(auditList, [], { workspaceId: "ws-audit-test" }, {}, "zh-CN", {
        workspaces: [
          { workspaceId: "ws-audit-test", tenantId: 11111111 },
          { workspaceId: "ws-audit-test", tenantId: 22222222 },
        ],
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining("工作空间") });
    expect(requests).toHaveLength(1);
  });

  test("空间接口错误原样透传，不发审计查询", async () => {
    await expect(
      runAudit(auditList, [], { workspaceId: "ws-audit-test" }, {}, "en-US", {
        workspaceError: "Workspace access denied by service",
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("Workspace access denied by service"),
    });
    expect(requests).toHaveLength(1);
  });

  test.each([auditList, auditGet, auditCount])(
    "指定空间 dry-run 展示身份解析计划且零网络请求",
    async (command) => {
      const result = await runAudit(
        command,
        [],
        { dryRun: true, workspaceId: "ws-audit-test", consoleSwitchAgent: 12345678 },
        { requestId: originLog.request_id },
      );
      expect(result.requests).toEqual([]);
      expect(parseStdoutJson(result.stdout)).toMatchObject({
        workspaceIdentity: {
          api: workspaceApi,
          workspaceId: "ws-audit-test",
          switchAgentFrom: "tenantId",
        },
      });
    },
  );

  test("审计计数与列表同窗口一致，不使用推理计数或当前页长度", async () => {
    const flags = { hours: 144, endTime: "1793160000000" };
    const settings = { workspaceId: "ws-audit-test", consoleSwitchAgent: 12345678 };
    const mockOptions = {
      listPayload: { list: [rawEntry], totalCount: 3, nextToken: "next-page" },
      countPayload: { totalCount: 0 },
    };
    const listed = await runAudit(auditList, [rawEntry], settings, flags, "en-US", mockOptions);
    const totalCount = parseStdoutJson<{ totalCount: number }>(listed.stdout).totalCount;
    vi.restoreAllMocks();
    const counted = await runAudit(auditCount, [rawEntry], settings, flags, "en-US", mockOptions);
    expect(parseStdoutJson(counted.stdout)).toMatchObject({ kind: "audit", count: totalCount });
    expect(totalCount).toBe(3);
    expect(counted.requests.map((request) => request.Api)).toEqual([
      workspaceApi,
      "zeldaEasy.bailian-telemetry.platform-model.listModelLogs",
    ]);
    expect(counted.request.Data.reqDTO).toMatchObject({
      workspaceId: "ws-audit-test",
      filterWorkspaceId: "ws-audit-test",
      startTime: 1792641600000,
      endTime: 1793160000000,
      maxResults: 1,
      skip: 0,
      needFullContent: false,
    });
    expect(counted.request.Data.reqDTO.telemetryType).toBeUndefined();
    expect(counted.request.Data.cornerstoneParam.switchAgent).toBe(mappedAgent);
  });

  test("审计计数保留模型和 API Key 过滤", async () => {
    const result = await runAudit(
      auditCount,
      [],
      {},
      {
        model: "test-model,other-model",
        apiKeyId: "test-key,other-key",
      },
    );
    expect(result.request.Data.reqDTO).toMatchObject({
      models: ["test-model", "other-model"],
      apikeyIds: ["test-key", "other-key"],
      maxResults: 1,
    });
  });

  test("审计计数服务端错误原样透传，不回退推理计数", async () => {
    await expect(
      runAudit(auditCount, [], {}, {}, "en-US", {
        listError: "Audit count access denied",
      }),
    ).rejects.toThrow("Audit count access denied");
    expect(requests.map((request) => request.Api)).toEqual([
      "zeldaEasy.bailian-telemetry.platform-model.listModelLogs",
    ]);
    expect(stdoutChunks).toEqual([]);
  });

  test("审计计数异步超时不输出零值", async () => {
    vi.useFakeTimers();
    const pending = runAudit(auditCount, [], {}, {}, "en-US", { async: "never" });
    const assertion = expect(pending).rejects.toMatchObject({ exitCode: ExitCode.TIMEOUT });
    await vi.runAllTimersAsync();
    await assertion;
    expect(stdoutChunks).toEqual([]);
  });

  test("审计计数解包服务端 totalCount，输出数值而非对象", async () => {
    const result = await runAudit(auditCount, [rawEntry], { workspaceId: "ws-audit-test" });
    expect(parseStdoutJson(result.stdout)).toMatchObject({ count: 1 });
  });

  test("审计计数文本显示正确数值", async () => {
    const result = await runAudit(auditCount, [rawEntry], {
      workspaceId: "ws-audit-test",
      output: "text",
    });
    expect(result.stdout).toContain("Audit logs: 1");
    expect(result.stdout).not.toContain("[object Object]");
  });

  test.each([{}, { model: "test-model", apiKeyId: "test-key" }])(
    "推理计数与非空列表同窗口同过滤一致 %j",
    async (filters) => {
      const flags = { hours: 144, endTime: "1793160000000", ...filters };
      const settings = { workspaceId: "ws-audit-test", consoleSwitchAgent: 12345678 };
      const mockOptions = {
        listPayload: { list: [{ model: "test-model" }], totalCount: 23, nextToken: "next-page" },
        countPayload: { totalCount: 0 },
      };
      const listed = await runAudit(inferenceList, [], settings, flags, "en-US", mockOptions);
      const totalCount = parseStdoutJson<{ totalCount: number }>(listed.stdout).totalCount;
      const listRequest = listed.request.Data.reqDTO;
      vi.restoreAllMocks();
      const counted = await runAudit(inferenceCount, [], settings, flags, "en-US", mockOptions);
      expect(parseStdoutJson(counted.stdout)).toMatchObject({
        kind: "inference",
        count: totalCount,
      });
      expect(totalCount).toBe(23);
      expect(counted.requests.map((request) => request.Api)).toEqual([
        workspaceApi,
        "zeldaEasy.bailian-telemetry.model.listModelLogs",
      ]);
      expect(counted.request.Data.reqDTO).toMatchObject({
        workspaceId: "ws-audit-test",
        filterWorkspaceId: "ws-audit-test",
        startTime: "1792641600000",
        endTime: "1793160000000",
        maxResults: 1,
        skip: 0,
        needFullContent: false,
      });
      expect(counted.request.Data.reqDTO.model).toBe(listRequest.model);
      expect(counted.request.Data.reqDTO.apikeyId).toBe(listRequest.apikeyId);
      expect(counted.request.Data.reqDTO.models).toBeUndefined();
      expect(counted.request.Data.reqDTO.apikeyIds).toBeUndefined();
      expect(counted.request.Data.reqDTO.telemetryType).toBeUndefined();
      expect(counted.request.Data.cornerstoneParam.switchAgent).toBe(mappedAgent);
      expect(counted.settings.consoleSwitchAgent).toBe(12345678);
    },
  );

  test.each([
    { flags: { model: " test-model,other-model,test-model " }, combinations: 2, count: 20 },
    { flags: { apiKeyId: " test-key,other-key,test-key " }, combinations: 2, count: 18 },
    {
      flags: {
        model: "test-model,other-model,test-model",
        apiKeyId: "test-key,other-key,test-key",
      },
      combinations: 4,
      count: 48,
    },
  ])("推理多值过滤去重后按单值组合汇总 %j", async ({ flags, combinations, count }) => {
    const result = await runAudit(
      inferenceCount,
      [],
      { workspaceId: "ws-audit-test", consoleSwitchAgent: 12345678 },
      { hours: 144, endTime: "1793160000000", ...flags },
      "en-US",
      {
        listPayload: (reqDTO: Record<string, unknown>) => ({
          list: [],
          totalCount:
            (reqDTO.model === "other-model" ? 13 : 7) + (reqDTO.apikeyId === "other-key" ? 4 : 0),
        }),
      },
    );
    expect(parseStdoutJson(result.stdout)).toMatchObject({ count });
    expect(result.requests.filter((request) => request.Api === workspaceApi)).toHaveLength(1);
    const businessRequests = result.requests.slice(1);
    expect(businessRequests).toHaveLength(combinations);
    for (const request of businessRequests) {
      expect(request.Api).toBe("zeldaEasy.bailian-telemetry.model.listModelLogs");
      expect(request.Data.reqDTO).toMatchObject({
        startTime: "1792641600000",
        endTime: "1793160000000",
        maxResults: 1,
        skip: 0,
        needFullContent: false,
      });
      expect(request.Data.reqDTO.models).toBeUndefined();
      expect(request.Data.reqDTO.apikeyIds).toBeUndefined();
      expect(request.Data.cornerstoneParam.switchAgent).toBe(mappedAgent);
    }
  });

  test("推理计数的每个过滤组合独立轮询并共享空间身份", async () => {
    vi.useFakeTimers();
    const pending = runAudit(
      inferenceCount,
      [],
      { workspaceId: "ws-audit-test", consoleSwitchAgent: 12345678 },
      { model: "test-model,other-model" },
      "en-US",
      { async: true, listPayload: { list: [], totalCount: 9 } },
    );
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(parseStdoutJson(result.stdout)).toMatchObject({ count: 18 });
    expect(result.requests).toHaveLength(5);
    expect(result.requests.slice(1).map((request) => request.Data.reqDTO.model)).toEqual([
      "test-model",
      "test-model",
      "other-model",
      "other-model",
    ]);
    expect(result.requests.slice(1).map((request) => request.Data.reqDTO.asyncTaskId)).toEqual([
      undefined,
      "test-audit-task",
      undefined,
      "test-audit-task",
    ]);
    for (const request of result.requests.slice(1)) {
      expect(request.Data.cornerstoneParam.switchAgent).toBe(mappedAgent);
      expect(request.Data.reqDTO.workspaceId).toBe("ws-audit-test");
    }
  });

  test("推理计数服务端错误原样透传，不回退旧计数接口", async () => {
    await expect(
      runAudit(inferenceCount, [], {}, {}, "en-US", {
        listError: "Inference count access denied",
      }),
    ).rejects.toThrow("Inference count access denied");
    expect(requests.map((request) => request.Api)).toEqual([
      "zeldaEasy.bailian-telemetry.model.listModelLogs",
    ]);
    expect(stdoutChunks).toEqual([]);
  });

  test("推理计数异步超时不输出零值", async () => {
    vi.useFakeTimers();
    const pending = runAudit(inferenceCount, [], {}, {}, "en-US", { async: "never" });
    const assertion = expect(pending).rejects.toMatchObject({ exitCode: ExitCode.TIMEOUT });
    await vi.runAllTimersAsync();
    await assertion;
    expect(stdoutChunks).toEqual([]);
  });

  test.each([0, 17, Number.MAX_SAFE_INTEGER])(
    "推理计数取列表 totalCount，空页不替代总数 %s",
    async (totalCount) => {
      const result = await runAudit(inferenceCount, [], {}, {}, "en-US", {
        listPayload: { list: [], totalCount },
      });
      expect(parseStdoutJson(result.stdout)).toMatchObject({ count: totalCount });
    },
  );

  test.each([
    {},
    null,
    17,
    { list: [] },
    { totalCount: -1 },
    { totalCount: "3" },
    { totalCount: 1.5 },
    { totalCount: Number.MAX_SAFE_INTEGER + 1 },
  ])("无效推理列表总数不输出零值 %j", async (listPayload) => {
    await expect(
      runAudit(inferenceCount, [], {}, {}, "zh-CN", { listPayload }),
    ).rejects.toMatchObject({
      exitCode: ExitCode.GENERAL,
      message: expect.stringContaining("记录数"),
    });
    expect(stdoutChunks).toEqual([]);
  });

  test("推理计数后续组合无效或汇总溢出时不输出部分总数", async () => {
    for (const lastCount of [-1, 1]) {
      await expect(
        runAudit(inferenceCount, [], {}, { model: "test-model,other-model" }, "en-US", {
          listPayload: (reqDTO: Record<string, unknown>) => ({
            list: [],
            totalCount: reqDTO.model === "test-model" ? Number.MAX_SAFE_INTEGER : lastCount,
          }),
        }),
      ).rejects.toMatchObject({ exitCode: ExitCode.GENERAL });
      expect(stdoutChunks).toEqual([]);
      vi.restoreAllMocks();
    }
  });

  test("推理计数文本显示列表总数", async () => {
    const result = await runAudit(inferenceCount, [], { output: "text" }, {}, "en-US", {
      listPayload: { list: [], totalCount: 23 },
    });
    expect(result.stdout).toContain("Inference logs: 23");
  });

  test("推理计数多值 dry-run 展示全部单值组合且零网络", async () => {
    const result = await runAudit(
      inferenceCount,
      [],
      { dryRun: true, workspaceId: "ws-audit-test" },
      {
        model: "test-model,other-model,test-model",
        apiKeyId: "test-key,other-key",
      },
    );
    expect(result.requests).toEqual([]);
    const preview = parseStdoutJson<{
      api: string;
      data: { reqDTOs: Record<string, unknown>[] };
    }>(result.stdout);
    expect(preview.api).toBe("zeldaEasy.bailian-telemetry.model.listModelLogs");
    expect(preview.data.reqDTOs.map((reqDTO) => [reqDTO.model, reqDTO.apikeyId])).toEqual([
      ["test-model", "test-key"],
      ["test-model", "other-key"],
      ["other-model", "test-key"],
      ["other-model", "other-key"],
    ]);
  });

  test.each([0, 3])("审计计数采用列表总数 %s，空页不替代 totalCount", async (totalCount) => {
    const result = await runAudit(auditCount, [], {}, {}, "en-US", {
      listPayload: { list: [], totalCount },
    });
    expect(parseStdoutJson(result.stdout)).toMatchObject({ count: totalCount });
  });

  test.each([{}, null, { list: [] }, { totalCount: -1 }, { totalCount: "3" }, { totalCount: 1.5 }])(
    "无效审计列表总数不输出零值 %s",
    async (listPayload) => {
      await expect(
        runAudit(auditCount, [], {}, {}, "zh-CN", { listPayload }),
      ).rejects.toMatchObject({
        exitCode: ExitCode.GENERAL,
        message: expect.stringContaining("记录数"),
      });
      expect(stdoutChunks).toEqual([]);
    },
  );

  test("未指定空间时保留显式查询身份，不增加空间预查询", async () => {
    const result = await runAudit(auditList, [], { consoleSwitchAgent: 12345678 });
    expect(result.requests).toHaveLength(1);
    expect(result.request.Data.cornerstoneParam.switchAgent).toBe(12345678);
  });

  test("共享空间查询保留 workspace list 原有 JSON 输出契约", async () => {
    const result = await runAudit(workspaceList, [], {}, {}, "en-US", {
      workspaces: [
        {
          workspaceId: "ws-audit-test",
          tenantId: mappedAgent,
          agentName: "测试空间",
          defaultAgent: false,
        },
      ],
    });
    expect(JSON.parse(result.stdout)).toEqual([
      { workspaceId: "ws-audit-test", name: "测试空间", default: false },
    ]);
  });

  test.each(["bare", "direct"] as const)(
    "兼容空间列表的 %s 简化响应及数字 tenantId",
    async (workspaceEnvelope) => {
      const result = await runAudit(
        auditList,
        [rawEntry],
        { workspaceId: "ws-audit-test" },
        {},
        "en-US",
        {
          workspaces: [{ workspaceId: "ws-audit-test", tenantId: mappedAgent }],
          workspaceEnvelope,
        },
      );
      expect(result.request.Data.cornerstoneParam.switchAgent).toBe(mappedAgent);
    },
  );
});

// 只覆盖 help / 参数校验 / dry-run；真实调用依赖 console 凭证与已开启的日志投递。
describe("e2e: log", () => {
  test("log audit list --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(LOG_ROUTES, [
      "log",
      "audit",
      "list",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--model");
    expect(stderr).toContain("--hours");
    expect(stderr).toContain("--status-code");
  });

  test("log audit list 非法状态码类型报错", async () => {
    const { stderr, exitCode } = await runCommandE2e(LOG_ROUTES, [
      "log",
      "audit",
      "list",
      "--status-code",
      "2xx",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Unknown status code type");
  });

  test("log audit list --dry-run 输出审计口径查询参数", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(LOG_ROUTES, [
      "log",
      "audit",
      "list",
      "--model",
      "qwen3.6-plus",
      "--status-code",
      "SERVER_ERROR",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: {
        reqDTO?: {
          models?: string[];
          statusCodeTypes?: string[];
          needFullContent?: boolean;
        };
      };
    }>(stdout);
    expect(data.api).toBe("zeldaEasy.bailian-telemetry.platform-model.listModelLogs");
    expect(data.data?.reqDTO?.models).toEqual(["qwen3.6-plus"]);
    expect(data.data?.reqDTO?.statusCodeTypes).toEqual(["SERVER_ERROR"]);
    expect(data.data?.reqDTO?.needFullContent).toBe(false);
  });

  test("log audit get 缺少 --request-id 报错", async () => {
    const { stderr, exitCode } = await runCommandE2e(LOG_ROUTES, [
      "log",
      "audit",
      "get",
      "--hours",
      "2",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--request-id");
  });

  test("log audit get --request-id 长度非法报错", async () => {
    const { stderr, exitCode } = await runCommandE2e(LOG_ROUTES, [
      "log",
      "audit",
      "get",
      "--request-id",
      "short",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--request-id must be 32-36 characters");
  });

  test("log audit count --dry-run 输出审计列表总数查询", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(LOG_ROUTES, [
      "log",
      "audit",
      "count",
      "--hours",
      "24",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: { reqDTO?: { telemetryType?: string } };
    }>(stdout);
    expect(data.api).toBe("zeldaEasy.bailian-telemetry.platform-model.listModelLogs");
    expect(data.data?.reqDTO).toMatchObject({ maxResults: 1, skip: 0, needFullContent: false });
    expect(data.data?.reqDTO?.telemetryType).toBeUndefined();
  });

  test("log audit enable --dry-run 输出 AuditLog 开通链路", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(LOG_ROUTES, [
      "log",
      "audit",
      "enable",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      apis?: string[];
      data?: { reqDTO?: { telemetryType?: string; resourceId?: string } };
    }>(stdout);
    expect(data.apis).toContain("zeldaEasy.bailian-telemetry.activate.createTelemetrySlr");
    expect(data.apis).toContain("zeldaEasy.bailian-telemetry.activate.initTelemetryStoreInstance");
    expect(data.apis).toContain("zeldaEasy.bailian-telemetry.telemetryGroup.enableTelemetryGroup");
    expect(data.data?.reqDTO?.telemetryType).toBe("AuditLog");
    expect(data.data?.reqDTO?.resourceId).toBe("all");
  });

  test("log audit disable --dry-run 输出 AuditLog 关闭请求", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(LOG_ROUTES, [
      "log",
      "audit",
      "disable",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: { reqDTO?: { telemetryType?: string } };
    }>(stdout);
    expect(data.api).toBe("zeldaEasy.bailian-telemetry.telemetryGroup.disableTelemetryGroup");
    expect(data.data?.reqDTO?.telemetryType).toBe("AuditLog");
  });

  test("log inference list --dry-run 输出推理口径查询参数", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(LOG_ROUTES, [
      "log",
      "inference",
      "list",
      "--model",
      "qwen3.6-plus",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: { reqDTO?: { model?: string; startTime?: string; needFullContent?: boolean } };
    }>(stdout);
    expect(data.api).toBe("zeldaEasy.bailian-telemetry.model.listModelLogs");
    expect(data.data?.reqDTO?.model).toBe("qwen3.6-plus");
    expect(typeof data.data?.reqDTO?.startTime).toBe("string");
    expect(data.data?.reqDTO?.needFullContent).toBe(false);
  });

  test("log inference get 缺少 --request-id 报错", async () => {
    const { stderr, exitCode } = await runCommandE2e(LOG_ROUTES, [
      "log",
      "inference",
      "get",
      "--hours",
      "2",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--request-id");
  });

  test("log inference get --dry-run 输出列表 + 回捞两段请求", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(LOG_ROUTES, [
      "log",
      "inference",
      "get",
      "--request-id",
      "6f6b2f1e-0000-0000-0000-000000000000",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ apis?: string[] }>(stdout);
    expect(data.apis).toContain("zeldaEasy.bailian-telemetry.model.listModelLogs");
    expect(data.apis).toContain("zeldaEasy.bailian-telemetry.model.getModelOriginLog");
  });

  test("log inference count --dry-run 输出推理列表总数查询", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(LOG_ROUTES, [
      "log",
      "inference",
      "count",
      "--hours",
      "24",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: { reqDTO?: { telemetryType?: string } };
    }>(stdout);
    expect(data.api).toBe("zeldaEasy.bailian-telemetry.model.listModelLogs");
    expect(data.data?.reqDTO).toMatchObject({ maxResults: 1, skip: 0, needFullContent: false });
    expect(data.data?.reqDTO?.telemetryType).toBeUndefined();
  });

  test.each(["model", "api-key-id"])("推理计数空过滤 --%s 不扩大查询范围", async (flagName) => {
    const result = await runCommandInProcess(LOG_ROUTES, [
      "log",
      "inference",
      "count",
      `--${flagName}`,
      " , , ",
      "--dry-run",
      "--quiet",
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(`--${flagName}`);
    expect(result.stdout).toBe("");
  });

  test("log inference enable --dry-run 输出 InferenceLog 开通链路", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(LOG_ROUTES, [
      "log",
      "inference",
      "enable",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      apis?: string[];
      data?: { reqDTO?: { telemetryType?: string; resourceId?: string } };
    }>(stdout);
    expect(data.apis).toContain("zeldaEasy.bailian-telemetry.activate.createTelemetrySlr");
    expect(data.apis).toContain("zeldaEasy.bailian-telemetry.activate.initTelemetryStoreInstance");
    expect(data.apis).toContain("zeldaEasy.bailian-telemetry.telemetryGroup.enableTelemetryGroup");
    expect(data.data?.reqDTO?.telemetryType).toBe("InferenceLog");
    expect(data.data?.reqDTO?.resourceId).toBe("all");
  });

  test("log inference disable --dry-run 输出 InferenceLog 关闭请求", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(LOG_ROUTES, [
      "log",
      "inference",
      "disable",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: { reqDTO?: { telemetryType?: string } };
    }>(stdout);
    expect(data.api).toBe("zeldaEasy.bailian-telemetry.telemetryGroup.disableTelemetryGroup");
    expect(data.data?.reqDTO?.telemetryType).toBe("InferenceLog");
  });

  test("log trace list 缺少 --resource-id 报错", async () => {
    const { stderr, exitCode } = await runCommandE2e(LOG_ROUTES, [
      "log",
      "trace",
      "list",
      "--hours",
      "2",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--resource-id");
  });

  test("log trace list --dry-run 输出 trace 查询", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(LOG_ROUTES, [
      "log",
      "trace",
      "list",
      "--resource-id",
      "qwen3.6-plus",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api?: string;
      data?: { reqDTO?: { resourceId?: string; resourceType?: string } };
    }>(stdout);
    expect(data.api).toBe("zeldaEasy.bailian-telemetry.trace.listTracesWithOss");
    expect(data.data?.reqDTO?.resourceId).toBe("qwen3.6-plus");
    expect(data.data?.reqDTO?.resourceType).toBe("model");
  });

  test("log trace get 缺少 --trace-id 报错", async () => {
    const { stderr, exitCode } = await runCommandE2e(LOG_ROUTES, [
      "log",
      "trace",
      "get",
      "--hours",
      "2",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--trace-id");
  });

  test("log trace stats --dry-run 输出统计 API", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(LOG_ROUTES, [
      "log",
      "trace",
      "stats",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ api?: string }>(stdout);
    expect(data.api).toBe("zeldaEasy.bailian-telemetry.trace.getTraceStatistic");
  });
});
