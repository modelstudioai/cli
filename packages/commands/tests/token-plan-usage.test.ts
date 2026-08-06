import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import tokenPlanUsage from "../src/commands/usage/token-plan.ts";

const originalNoColor = process.env.NO_COLOR;
const originalIsTty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");

afterEach(() => {
  if (originalNoColor === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = originalNoColor;
  if (originalIsTty) Object.defineProperty(process.stdout, "isTTY", originalIsTty);
  else delete (process.stdout as { isTTY?: boolean }).isTTY;
  vi.restoreAllMocks();
});

function makeUsageResponse(
  per5HourPercentage: number,
  per1WeekPercentage = per5HourPercentage,
): Record<string, unknown> {
  const usage: Record<string, number> = {
    per5HourPercentage,
    per1WeekPercentage,
  };
  if (per5HourPercentage !== 0) usage.per5HourResetTime = 1_786_000_000_000;
  if (per1WeekPercentage !== 0) usage.per1WeekResetTime = 1_786_100_000_000;

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
  test.each([
    [0.7499, "32"],
    [0.75, "33"],
    [0.9, "31"],
  ])("uses ANSI color %s for %s", async (percentage, colorCode) => {
    delete process.env.NO_COLOR;
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    const output: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });

    await tokenPlanUsage.run({
      client: { console: vi.fn().mockResolvedValue(makeUsageResponse(percentage)) },
      flags: { json: false, view: true },
      settings: { dryRun: false },
    } as never);

    expect(output.join("")).toContain(`\u001B[${colorCode}m[`);
  });

  test("accepts missing reset times when the quota usage is zero", async () => {
    const output: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });

    await tokenPlanUsage.run({
      client: { console: vi.fn().mockResolvedValue(makeUsageResponse(0)) },
      flags: { json: false, view: true },
      settings: { dryRun: false },
    } as never);

    expect(output.join("")).toContain("Resets: not applicable (no usage yet)");
  });

  test("allows one unused quota window without masking another reset time", async () => {
    const output: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });

    await tokenPlanUsage.run({
      client: { console: vi.fn().mockResolvedValue(makeUsageResponse(0, 0.5)) },
      flags: { json: false, view: true },
      settings: { dryRun: false },
    } as never);

    const renderedOutput = output.join("");
    expect(renderedOutput).toContain("Resets: not applicable (no usage yet)");
    expect(renderedOutput).toMatch(/Resets: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  });
});
