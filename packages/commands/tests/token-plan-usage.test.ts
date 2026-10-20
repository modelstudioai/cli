import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import tokenPlanUsage from "../src/commands/usage/token-plan.ts";

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

async function runTokenPlan(response: Record<string, unknown>, output?: string): Promise<void> {
  await tokenPlanUsage.run({
    client: { console: vi.fn().mockResolvedValue(response) },
    flags: {},
    settings: { dryRun: false, output },
  } as never);
}

function makeUsageResponse(per1MonthPercentage?: number): Record<string, unknown> {
  const usage: Record<string, number> = {};
  if (per1MonthPercentage !== undefined) {
    usage.per1MonthPercentage = per1MonthPercentage;
    if (per1MonthPercentage !== 0) usage.per1MonthResetTime = 1_786_000_000_000;
  }

  return wrapResponse(usage);
}

function wrapResponse(usage: Record<string, unknown>): Record<string, unknown> {
  return {
    data: {
      DataV2: {
        data: {
          data: usage,
        },
      },
    },
  };
}

describe("usage token-plan view", () => {
  test("renders the gauge with the usage-free brand fill color", async () => {
    delete process.env.NO_COLOR;
    process.env.FORCE_COLOR = "3";
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    const output = captureStdout();

    await runTokenPlan(makeUsageResponse(0.5));

    // Brand-cyan fill cell, same as the `usage free` gauge column
    expect(output.join("")).toContain("\u001B[38;2;0;150;160m\u2588");
  });

  test("renders proportional gauge cells with a transparent track", async () => {
    process.env.NO_COLOR = "1";
    const output = captureStdout();

    await runTokenPlan(makeUsageResponse(0.5));

    const renderedOutput = output.join("");
    // 50% of the default 20-cell gauge → 10 filled cells + 10 track spaces
    expect(renderedOutput).toContain(`${"\u2588".repeat(10)}${" ".repeat(10)}`);
    expect(renderedOutput).not.toContain("\u2588".repeat(11));
  });

  test("accepts a missing reset time when the quota usage is zero", async () => {
    const output = captureStdout();

    await runTokenPlan(makeUsageResponse(0));

    expect(output.join("")).toContain("Resets: not applicable (no usage yet)");
  });

  test("renders the monthly reset time when usage is present", async () => {
    const output = captureStdout();

    await runTokenPlan(makeUsageResponse(0.5));

    expect(output.join("")).toMatch(/Resets: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  });

  test("renders a missing monthly quota as possibly unlimited", async () => {
    const output = captureStdout();

    await runTokenPlan(makeUsageResponse());

    expect(output.join("")).toContain(
      "The monthly limit may be unlimited; verify in the Bailian Token Plan console.",
    );
  });

  test("renders the monthly window as possibly unlimited when its percentage is missing even if the reset time is present", async () => {
    const output = captureStdout();

    await runTokenPlan(wrapResponse({ per1MonthResetTime: 1_786_000_000_000 }));

    expect(output.join("")).toContain(
      "The monthly limit may be unlimited; verify in the Bailian Token Plan console.",
    );
  });

  test("treats non-numeric quota fields as absent instead of failing", async () => {
    const output = captureStdout();

    await runTokenPlan(wrapResponse({ per1MonthPercentage: "not-a-number" }));

    expect(output.join("")).toContain(
      "The monthly limit may be unlimited; verify in the Bailian Token Plan console.",
    );
  });
});

describe("usage token-plan json", () => {
  test("outputs the monthly usage fields with --output json", async () => {
    const output = captureStdout();

    await runTokenPlan(makeUsageResponse(0.5), "json");

    expect(JSON.parse(output.join(""))).toEqual({
      per1MonthPercentage: 0.5,
      per1MonthResetTime: 1_786_000_000_000,
    });
  });

  test("returns an empty JSON object when no quota fields are available", async () => {
    const output = captureStdout();

    await runTokenPlan(makeUsageResponse(), "json");

    expect(output.join("").trim()).toBe("{}");
  });

  test("omits non-numeric quota fields from the JSON output", async () => {
    const output = captureStdout();

    await runTokenPlan(
      wrapResponse({ per1MonthPercentage: "not-a-number", per1MonthResetTime: 1_786_000_000_000 }),
      "json",
    );

    expect(JSON.parse(output.join(""))).toEqual({ per1MonthResetTime: 1_786_000_000_000 });
  });
});
