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

function makeUsageResponse(
  per5HourPercentage?: number,
  per1WeekPercentage = per5HourPercentage,
): Record<string, unknown> {
  const usage: Record<string, number> = {};
  if (per5HourPercentage !== undefined) {
    usage.per5HourPercentage = per5HourPercentage;
    if (per5HourPercentage !== 0) usage.per5HourResetTime = 1_786_000_000_000;
  }
  if (per1WeekPercentage !== undefined) {
    usage.per1WeekPercentage = per1WeekPercentage;
    if (per1WeekPercentage !== 0) usage.per1WeekResetTime = 1_786_100_000_000;
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

  test("accepts missing reset times when the quota usage is zero", async () => {
    const output = captureStdout();

    await runTokenPlan(makeUsageResponse(0));

    expect(output.join("")).toContain("Resets: not applicable (no usage yet)");
  });

  test("allows one unused quota window without masking another reset time", async () => {
    const output = captureStdout();

    await runTokenPlan(makeUsageResponse(0, 0.5));

    const renderedOutput = output.join("");
    expect(renderedOutput).toContain("Resets: not applicable (no usage yet)");
    expect(renderedOutput).toMatch(/Resets: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  });

  test("renders missing quota windows as possibly unlimited", async () => {
    const output = captureStdout();

    await runTokenPlan(makeUsageResponse());

    const renderedOutput = output.join("");
    expect(renderedOutput).toContain(
      "The 5-hour limit may be unlimited; verify in the Bailian Token Plan console.",
    );
    expect(renderedOutput).toContain(
      "The 1-week limit may be unlimited; verify in the Bailian Token Plan console.",
    );
  });

  test("renders only the missing quota window as possibly unlimited", async () => {
    const output = captureStdout();

    await runTokenPlan(makeUsageResponse(undefined, 0.5));

    const renderedOutput = output.join("");
    expect(renderedOutput).toContain(
      "The 5-hour limit may be unlimited; verify in the Bailian Token Plan console.",
    );
    expect(renderedOutput).not.toContain(
      "The 1-week limit may be unlimited; verify in the Bailian Token Plan console.",
    );
    expect(renderedOutput).toMatch(/Resets: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  });

  test("renders a window with a missing percentage as possibly unlimited even when its reset time is present", async () => {
    const output = captureStdout();

    await runTokenPlan(wrapResponse({ per5HourResetTime: 1_786_000_000_000 }));

    expect(output.join("")).toContain(
      "The 5-hour limit may be unlimited; verify in the Bailian Token Plan console.",
    );
  });

  test("treats non-numeric quota fields as absent instead of failing", async () => {
    const output = captureStdout();

    await runTokenPlan(
      wrapResponse({ per5HourPercentage: "not-a-number", per1WeekPercentage: Number.NaN }),
    );

    const renderedOutput = output.join("");
    expect(renderedOutput).toContain(
      "The 5-hour limit may be unlimited; verify in the Bailian Token Plan console.",
    );
    expect(renderedOutput).toContain(
      "The 1-week limit may be unlimited; verify in the Bailian Token Plan console.",
    );
  });
});

describe("usage token-plan json", () => {
  test("outputs the four core usage fields with --output json", async () => {
    const output = captureStdout();

    await runTokenPlan(makeUsageResponse(0.5, 0.25), "json");

    expect(JSON.parse(output.join(""))).toEqual({
      per5HourPercentage: 0.5,
      per5HourResetTime: 1_786_000_000_000,
      per1WeekPercentage: 0.25,
      per1WeekResetTime: 1_786_100_000_000,
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
      wrapResponse({ per5HourPercentage: "not-a-number", per1WeekPercentage: 0 }),
      "json",
    );

    expect(JSON.parse(output.join(""))).toEqual({ per1WeekPercentage: 0 });
  });
});
