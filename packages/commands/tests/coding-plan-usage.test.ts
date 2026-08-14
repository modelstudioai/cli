import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import codingPlanUsage from "../src/commands/usage/coding-plan.ts";

const originalNoColor = process.env.NO_COLOR;
const originalForceColor = process.env.FORCE_COLOR;
const originalIsTty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");

afterEach(() => {
  if (originalNoColor === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = originalNoColor;
  if (originalForceColor === undefined) delete process.env.FORCE_COLOR;
  else process.env.FORCE_COLOR = originalForceColor;
  if (originalIsTty) Object.defineProperty(process.stdout, "isTTY", originalIsTty);
  else delete (process.stdout as { isTTY?: boolean }).isTTY;
  vi.restoreAllMocks();
});

function captureStdout(): string[] {
  const output: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
  return output;
}

async function runCodingPlan(response: Record<string, unknown>, output?: string): Promise<void> {
  await codingPlanUsage.run({
    client: { console: vi.fn().mockResolvedValue(response) },
    flags: {},
    settings: { dryRun: false, output },
  } as never);
}

function wrapResponse(data: Record<string, unknown>): Record<string, unknown> {
  return {
    data: {
      DataV2: {
        data: {
          data,
        },
      },
    },
  };
}

function makeInstanceResponse(
  quotaInfo: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return wrapResponse({
    codingPlanInstanceInfos: [
      { status: "VALID", instanceType: "pro", codingPlanQuotaInfo: quotaInfo, ...overrides },
    ],
  });
}

const FULL_QUOTA_INFO = {
  per5HourUsedQuota: 38,
  per5HourTotalQuota: 100,
  per5HourQuotaNextRefreshTime: 1_786_000_000_000,
  perWeekUsedQuota: 500,
  perWeekTotalQuota: 1000,
  perWeekQuotaNextRefreshTime: 1_786_100_000_000,
  perBillMonthUsedQuota: 950,
  perBillMonthTotalQuota: 1000,
  perBillMonthQuotaNextRefreshTime: 1_786_200_000_000,
};

describe("usage coding-plan view", () => {
  test("renders the three quota windows with usage rates and used/total details", async () => {
    const output = captureStdout();

    await runCodingPlan(makeInstanceResponse(FULL_QUOTA_INFO));

    const renderedOutput = output.join("");
    expect(renderedOutput).toContain("Coding Plan Usage (pro)");
    expect(renderedOutput).toContain("5-hour quota");
    expect(renderedOutput).toContain("1-week quota");
    expect(renderedOutput).toContain("Monthly quota");
    expect(renderedOutput).toContain("38% used");
    expect(renderedOutput).toContain("50% used");
    expect(renderedOutput).toContain("95% used");
    expect(renderedOutput).toContain("Used: 38 / 100");
    expect(renderedOutput).toContain("Used: 950 / 1,000");
  });

  test("skips non-VALID instances when picking quota info", async () => {
    const output = captureStdout();

    await runCodingPlan(
      wrapResponse({
        codingPlanInstanceInfos: [
          {
            status: "EXPIRED",
            codingPlanQuotaInfo: { per5HourUsedQuota: 1, per5HourTotalQuota: 2 },
          },
          { status: "VALID", codingPlanQuotaInfo: FULL_QUOTA_INFO },
        ],
      }),
    );

    expect(output.join("")).toContain("38% used");
  });

  test("renders windows without a positive total as missing quota data", async () => {
    const output = captureStdout();

    await runCodingPlan(
      makeInstanceResponse({
        per5HourUsedQuota: 38,
        per5HourTotalQuota: 0,
        perWeekUsedQuota: 500,
        perBillMonthUsedQuota: "not-a-number",
        perBillMonthTotalQuota: 1000,
      }),
    );

    const renderedOutput = output.join("");
    const emptyMessageCount = renderedOutput.split(
      "No quota data for this window; verify in the Bailian Coding Plan console.",
    ).length;
    expect(emptyMessageCount - 1).toBe(3);
  });

  test("reports when there is no active subscription", async () => {
    const output = captureStdout();

    await runCodingPlan(wrapResponse({ codingPlanInstanceInfos: [] }));

    expect(output.join("")).toContain("No active Coding Plan subscription found.");
  });

  test("renders the gauge in the usage-free style: brand fill and proportional cells", async () => {
    delete process.env.NO_COLOR;
    process.env.FORCE_COLOR = "3";
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    const output = captureStdout();

    await runCodingPlan(makeInstanceResponse(FULL_QUOTA_INFO));

    // Brand-cyan fill cell, same as the `usage free` gauge column
    expect(output.join("")).toContain("\u001B[38;2;0;150;160m\u2588");
  });

  test("fills gauge cells proportionally to the usage rate", async () => {
    process.env.NO_COLOR = "1";
    const output = captureStdout();

    await runCodingPlan(makeInstanceResponse(FULL_QUOTA_INFO));

    const renderedOutput = output.join("");
    // 95% of the default 20-cell gauge → 19 filled cells + 1 track space
    expect(renderedOutput).toContain(`${"\u2588".repeat(19)} `);
    expect(renderedOutput).not.toContain("\u2588".repeat(20));
  });
});

describe("usage coding-plan json", () => {
  test("outputs the three windows with used/total/percentage/resetTime", async () => {
    const output = captureStdout();

    await runCodingPlan(makeInstanceResponse(FULL_QUOTA_INFO), "json");

    expect(JSON.parse(output.join(""))).toEqual({
      instanceType: "pro",
      per5Hour: {
        usedQuota: 38,
        totalQuota: 100,
        percentage: 0.38,
        resetTime: 1_786_000_000_000,
      },
      perWeek: {
        usedQuota: 500,
        totalQuota: 1000,
        percentage: 0.5,
        resetTime: 1_786_100_000_000,
      },
      perBillMonth: {
        usedQuota: 950,
        totalQuota: 1000,
        percentage: 0.95,
        resetTime: 1_786_200_000_000,
      },
    });
  });

  test("returns an empty JSON object when no VALID instance exists", async () => {
    const output = captureStdout();

    await runCodingPlan(wrapResponse({}), "json");

    expect(output.join("").trim()).toBe("{}");
  });

  test("omits non-numeric quota fields from the JSON output", async () => {
    const output = captureStdout();

    await runCodingPlan(
      makeInstanceResponse(
        { per5HourUsedQuota: "not-a-number", per5HourTotalQuota: 100 },
        { instanceType: undefined },
      ),
      "json",
    );

    expect(JSON.parse(output.join(""))).toEqual({
      per5Hour: { totalQuota: 100 },
      perWeek: {},
      perBillMonth: {},
    });
  });
});
