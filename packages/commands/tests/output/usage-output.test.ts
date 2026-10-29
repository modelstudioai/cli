import { beforeEach, afterEach, expect, test, vi } from "vite-plus/test";
import {
  BailianError,
  buildSettings,
  ExitCode,
  MODEL_LIST_API,
  REGIONS,
  type AnyCommand,
  type LocalizedText,
} from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import * as commands from "bailian-cli-commands";
const now = new Date(2026, 0, 8).getTime();
const batch = { success: true, failureModels: [] };
const quota = {
  model: "qwen-test",
  quotaInitTotal: 1000,
  quotaTotal: 750,
  quotaValidityPeriod: 0,
  quotaStatus: "VALID",
};
const stat = { modelCount: 1, callSuccessCount: 3, usages: [] };
const seat = {
  SeatId: "seat-test",
  SpecType: "pro",
  Status: "NORMAL",
  AssignedStatus: "ASSIGNED",
  AccountId: "account-test",
};
const seatsResponse = { Success: true, Data: { Items: [seat], Total: 9, PageNo: 2, PageSize: 3 } };
const keyResponse = {
  Success: true,
  Data: {
    ApiKeyId: "key-test",
    MaskedApiKey: "placeholder-***",
    PlainApiKey: "placeholder-one-time-key",
    Description: "Test key",
  },
};
const memberResponse = {
  Success: true,
  RequestId: "request-test",
  Data: { AccountId: "account-test", SeatAssigned: true },
};
const assignmentResponse = { Success: true, Code: "OK", Message: "Assigned" };
interface Scenario {
  name: string;
  command: AnyCommand;
  flags: Record<string, unknown>;
  want: unknown;
  text: string;
  response?: unknown;
}
const cases: Scenario[] = [
  {
    name: "usage free",
    command: commands.usageFree,
    flags: { model: "qwen-test" },
    want: [
      {
        model: "qwen-test",
        type: "Text",
        remaining: 750,
        total: 1000,
        usagePercent: 25,
        remainingPercent: 75,
        expires: null,
        autoStop: true,
      },
    ],
    text: "qwen-test",
  },
  {
    name: "usage freetier",
    command: commands.usageFreetier,
    flags: { model: "qwen-test" },
    want: [batch],
    text: 'Enabled auto-stop for "qwen-test".',
  },
  {
    name: "usage stats",
    command: commands.usageStats,
    flags: { days: "7" },
    want: {
      period: { start: "2026-01-01", end: "2026-01-08", days: 7 },
      modelsCalled: 1,
      successfulCalls: 3,
      usages: [],
    },
    text: "Successful Calls",
  },
  {
    name: "usage summary",
    command: commands.usageSummary,
    flags: { days: "7" },
    want: {
      period: { start: "2026-01-01", end: "2026-01-08", days: 7 },
      freeTier: [
        {
          model: "qwen-test",
          type: "Text",
          remaining: 750,
          total: 1000,
          remainingPercent: 75,
          expires: null,
        },
      ],
      usage: { modelsCalled: 1, successfulCalls: 3, usages: [] },
    },
    text: "Usage Summary",
  },
  {
    name: "usage token-plan",
    command: commands.usageTokenPlan,
    flags: {},
    want: { per1MonthPercentage: 0.25, per1MonthResetTime: now + 3600000 },
    text: "25% used",
  },
  {
    name: "usage coding-plan",
    command: commands.usageCodingPlan,
    flags: {},
    want: {
      instanceType: "pro",
      per5Hour: { usedQuota: 25, totalQuota: 100, percentage: 0.25 },
      perWeek: {},
      perBillMonth: {},
    },
    text: "Coding Plan Usage (pro)",
  },
  {
    name: "token-plan list-seats",
    command: commands.tokenPlanListSeats,
    flags: { pageNo: 2, pageSize: 3, status: ["NORMAL"], queryAssigned: "true" },
    response: seatsResponse,
    want: seatsResponse,
    text: "Total: 9 | Page: 2 | PageSize: 3",
  },
  {
    name: "token-plan create-key",
    command: commands.tokenPlanCreateKey,
    flags: { accountId: "account-test", workspaceId: "ws-test", description: "Test key" },
    response: keyResponse,
    want: keyResponse,
    text: "PlainApiKey (shown once): placeholder-one-time-key",
  },
  {
    name: "token-plan assign-seats",
    command: commands.tokenPlanAssignSeats,
    flags: { workspaceId: "ws-test", seatType: "pro", accountId: ["one", "two"] },
    response: assignmentResponse,
    want: assignmentResponse,
    text: "Seats assigned successfully.",
  },
  {
    name: "token-plan add-member",
    command: commands.tokenPlanAddMember,
    flags: { accountName: "Demo", orgId: "org-test", specType: "pro" },
    response: memberResponse,
    want: memberResponse,
    text: "account-test",
  },
  {
    name: "token-plan harness-quota",
    command: commands.tokenPlanHarnessQuota,
    flags: { type: "official_tool" },
    want: {
      generatedAt: now,
      items: [
        {
          planCode: "code-test",
          title: "Test harness",
          type: "official_tool",
          status: "issuing",
          quotaUnit: "requests",
        },
      ],
    },
    text: "Quota is being issued",
  },
];
let calls: Array<{ api: string; data: Record<string, unknown> }> = [];
let openCalls: Record<string, unknown>[] = [];
let failure = false;
let alreadyOff = false;
let batchResult: unknown = batch;
let overviewResult: unknown = stat;
let modelRows: unknown[] = [
  { model: "qwen-test", callSuccessCount: 3, usage: { input_tokens: 2 } },
];
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  calls = [];
  openCalls = [];
  failure = false;
  alreadyOff = false;
  batchResult = batch;
  overviewResult = stat;
  modelRows = [{ model: "qwen-test", callSuccessCount: 3, usage: { input_tokens: 2 } }];
});
async function invoke(
  scenario: Scenario,
  display: { format: "text" | "json"; quiet?: boolean; verbose?: boolean; dryRun?: boolean },
) {
  let stdout = "",
    stderr = "",
    strayOut = "",
    strayErr = "";
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    strayOut += String(chunk);
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    strayErr += String(chunk);
    return true;
  });
  const settings = buildSettings({
    flags: {
      output: display.format,
      quiet: display.quiet,
      verbose: display.verbose,
      dryRun: display.dryRun,
    },
    env: {},
    file: { workspace_id: "ws-test" },
    configPath: "/tmp/usage-output/config.json",
  });
  const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
  const reporter = createOutputReporter({
    settings,
    localize,
    stdout: {
      write(chunk) {
        stdout += chunk;
      },
    },
    stderr: {
      write(chunk) {
        stderr += chunk;
      },
    },
  });
  const client = {
    baseUrl: REGIONS.cn,
    console: async (api: string, data: Record<string, unknown>) => {
      calls.push({ api, data: structuredClone(data) });
      if (failure) throw new BailianError("Original console failure", ExitCode.GENERAL);
      if (api === MODEL_LIST_API)
        return { list: [{ model: "qwen-test", capabilities: ["TG"] }], total: 1 };
      if (api.includes("queryFreeTierQuota"))
        return { data: { data: { freeTierQuotas: [quota] } } };
      if (api.includes("queryFreeTierOnlyStatus"))
        return {
          data: {
            data: { freeTierOnlyStatuses: [{ model: "qwen-test", freeTierOnly: !alreadyOff }] },
          },
        };
      if (api.includes("batchActivateFreeTierOnly") || api.includes("batchDeactivateFreeTierOnly"))
        return structuredClone(batchResult);
      if (api.includes("getModelUsageStatistic")) return structuredClone(overviewResult);
      if (api.includes("listModelUsageStatisticData"))
        return { list: structuredClone(modelRows), totalCount: modelRows.length };
      if (api.endsWith("/usage"))
        return { per1MonthPercentage: 0.25, per1MonthResetTime: now + 3600000 };
      if (api.includes("queryCodingPlanInstanceInfoV2"))
        return {
          codingPlanInstanceInfos: [
            {
              status: "VALID",
              instanceType: "pro",
              codingPlanQuotaInfo: { per5HourUsedQuota: 25, per5HourTotalQuota: 100 },
            },
          ],
        };
      if (api.endsWith("token-plan.detail"))
        return {
          items: [
            {
              type: "official_tool",
              hasResourcePack: true,
              planCodes: ["code-test"],
              title: "Test harness",
              quotaUnit: "requests",
            },
          ],
        };
      if (api.includes("queryTokenPlanEquityInfo")) return { tokenPlanEquityInfos: [] };
      throw new Error(`Unexpected API: ${api}`);
    },
    openApiQueryJson: async (options: Record<string, unknown>) => {
      openCalls.push(structuredClone(options));
      if (failure) throw new BailianError("Original OpenAPI failure", ExitCode.GENERAL);
      return structuredClone(scenario.response);
    },
  };
  let exitCode = 0;
  try {
    try {
      await scenario.command.run({
        settings,
        flags: scenario.flags,
        client,
        localize,
        output: reporter.output,
        identity: { binName: "bl", version: "test", clientName: "test", npmPackage: "test" },
      } as never);
    } catch (error) {
      exitCode = reporter.error(error);
    }
    return { stdout, stderr, strayOut, strayErr, exitCode };
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  }
}
const matrix = cases.flatMap((scenario) =>
  (["text", "json"] as const).flatMap((format) =>
    [false, true].flatMap((quiet) =>
      [false, true].map((verbose) => ({ scenario, name: scenario.name, format, quiet, verbose })),
    ),
  ),
);
test.each(matrix)(
  "$name complete result channel: $format q=$quiet v=$verbose",
  async ({ scenario, ...display }) => {
    const result = await invoke(scenario, display);
    expect(result.exitCode, result.stderr + result.strayErr).toBe(0);
    expect(result.strayOut).toBe("");
    expect(result.strayErr).toBe("");
    if (display.format === "json") expect(JSON.parse(result.stdout)).toEqual(scenario.want);
    else expect(result.stdout).toContain(scenario.text);
    expect(result.stderr).not.toContain("placeholder-one-time-key");
    expect(calls.length + openCalls.length).toBeGreaterThan(0);
  },
);
test.each(cases)("$name dry-run is one JSON result without API calls", async (scenario) => {
  const result = await invoke(scenario, { format: "json", quiet: true, dryRun: true });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.strayOut).toBe("");
  expect(result.strayErr).toBe("");
  expect(JSON.parse(result.stdout)).toBeTypeOf("object");
  expect(calls).toEqual([]);
  expect(openCalls).toEqual([]);
});
test.each(cases)("$name failure is one structured error", async (scenario) => {
  failure = true;
  const result = await invoke(scenario, { format: "json", quiet: true });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.strayOut).toBe("");
  expect(result.strayErr).toBe("");
  expect(JSON.parse(result.stderr).error.message).toContain(
    scenario.command.auth === "openapi" ? "Original OpenAPI" : "Original console",
  );
});
test.each([false, true])(
  "auto-stop off quiet=%s returns processed responses and no unstructured stderr",
  async (quiet) => {
    const base = cases[1]!;
    const result = await invoke(
      { ...base, flags: { model: "qwen-test", off: true } },
      { format: "json", quiet },
    );
    expect(result.exitCode).toBe(0);
    expect(result.strayOut).toBe("");
    expect(result.strayErr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      processed: [{ model: "qwen-test", result: batch }],
      skipped: [],
    });
    expect(result.stderr).toBe("");
  },
);
test("auto-stop already-off skip is retained in the JSON report", async () => {
  alreadyOff = true;
  const base = cases[1]!;
  const result = await invoke(
    { ...base, flags: { model: "qwen-test", off: true } },
    { format: "json", quiet: true },
  );
  expect(result.exitCode).toBe(0);
  expect(result.strayOut).toBe("");
  expect(result.strayErr).toBe("");
  expect(JSON.parse(result.stdout)).toEqual({ processed: [], skipped: ["qwen-test"] });
  expect(calls.some((call) => call.api.includes("batchDeactivate"))).toBe(false);
});
test("auto-stop failure retains raw result and a structured warning under quiet", async () => {
  batchResult = { failureModels: [{ failureModelId: "qwen-test", errorCode: "Rejected" }] };
  const result = await invoke(cases[1]!, { format: "json", quiet: true });
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual([batchResult]);
  expect(result.strayOut).toBe("");
  expect(result.strayErr).toBe("");
  expect(JSON.parse(result.stderr).warning).toMatchObject({
    code: "FREETIER_OPERATION_FAILED",
    details: { model: "qwen-test", error_code: "Rejected" },
  });
});
test("OpenAPI parameters and one-time key disclosure stay unchanged", async () => {
  const scenario = cases.find((item) => item.name === "token-plan create-key")!;
  const result = await invoke(scenario, { format: "json", quiet: true });
  expect(JSON.parse(result.stdout).Data.PlainApiKey).toBe("placeholder-one-time-key");
  expect(openCalls[0]).toMatchObject({
    action: "CreateTokenPlanKey",
    method: "POST",
    version: "2026-02-10",
    queryParams: { AccountId: "account-test", WorkspaceId: "ws-test", Description: "Test key" },
  });
  expect(result.stderr).not.toContain("placeholder-one-time-key");
});

test.each(["text", "json"] as const)(
  "per-model stats keep duplicate filtering, parameters and result in %s",
  async (format) => {
    modelRows = [
      {
        model: "qwen-test",
        callSuccessCount: 3,
        usages: [{ key: "input_token", value: 4 }],
        usage: { input_token: 6, output_token: 2 },
      },
    ];
    const result = await invoke(
      {
        ...cases[2]!,
        flags: { model: " qwen-test, qwen-other,qwen-test ", days: "14", type: "Text" },
      },
      { format, quiet: true },
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.strayOut + result.strayErr).toBe("");
    expect(calls.map((call) => call.data.reqDTO)).toEqual(
      ["qwen-test", "qwen-other"].map((model) => ({
        startTime: now - 14 * 86400000,
        endTime: now,
        modelCallSource: "Online",
        filterWorkspaceId: "ws-test",
        maxResults: 50,
        skip: 0,
        sortField: "success_count",
        sortOrder: "DESC",
        obsModelType: "Text",
        model,
      })),
    );
    if (format === "json")
      expect(JSON.parse(result.stdout)).toEqual({
        period: { start: "2025-12-25", end: "2026-01-08", days: 14 },
        items: Array.from({ length: 2 }, () => ({
          model: "qwen-test",
          successfulCalls: 3,
          input_token: 6,
          output_token: 2,
        })),
      });
    else expect(result.stdout).toContain("Total: 2 models");
  },
);
test.each(["text", "json"] as const)(
  "empty stats views remain successful in %s",
  async (format) => {
    overviewResult = {};
    const overview = await invoke(cases[2]!, { format, quiet: true });
    expect(overview.exitCode, overview.stderr).toBe(0);
    expect(overview.strayOut + overview.strayErr).toBe("");
    if (format === "json")
      expect(JSON.parse(overview.stdout)).toEqual({
        period: { start: "2026-01-01", end: "2026-01-08", days: 7 },
        modelsCalled: 0,
        successfulCalls: 0,
      });
    else expect(overview.stdout).toBe("No usage data found.\n");
    modelRows = [];
    const model = await invoke(
      { ...cases[2]!, flags: { model: "qwen-test" } },
      { format, quiet: true },
    );
    expect(model.exitCode, model.stderr).toBe(0);
    expect(model.strayOut + model.strayErr).toBe("");
    if (format === "json") expect(JSON.parse(model.stdout).items).toEqual([]);
    else expect(model.stdout).toContain("No usage data found.");
  },
);
test.each(["text", "json"] as const)(
  "mixed off operations preserve skips, deduplication and raw results in %s",
  async (format) => {
    alreadyOff = true;
    const result = await invoke(
      { ...cases[1]!, flags: { off: true, model: "qwen-test,qwen-other,qwen-test" } },
      { format, quiet: true },
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.strayOut + result.strayErr + result.stderr).toBe("");
    expect(calls.map((call) => call.api)).toHaveLength(2);
    expect(calls[1]!.data).toEqual({
      BatchDeactivateFreeTierOnlyRequest: { models: ["qwen-other"] },
    });
    if (format === "json")
      expect(JSON.parse(result.stdout)).toEqual({
        processed: [{ model: "qwen-other", result: batch }],
        skipped: ["qwen-test"],
      });
    else expect(result.stdout).toBe('Disabled auto-stop for "qwen-other".\n');
  },
);
test.each(["text", "json"] as const)(
  "timeout warnings retain the original exit and result policy in %s",
  async (format) => {
    batchResult = { taskId: "task-test" };
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const pending = invoke(cases[1]!, { format, quiet: true });
      await vi.runAllTimersAsync();
      const result = await pending;
      expect(result.exitCode).toBe(0);
      expect(result.strayOut + result.strayErr).toBe("");
      expect(calls).toHaveLength(20);
      expect(calls[1]!.data).toEqual({ BatchActivateFreeTierOnlyRequest: { taskId: "task-test" } });
      if (format === "json") {
        expect(JSON.parse(result.stdout)).toEqual([null]);
        expect(JSON.parse(result.stderr).warning).toMatchObject({
          code: "FREETIER_OPERATION_TIMEOUT",
          details: { model: "qwen-test" },
        });
      } else {
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain('Operation timed out for "qwen-test".');
      }
    } finally {
      vi.useRealTimers();
    }
  },
);
