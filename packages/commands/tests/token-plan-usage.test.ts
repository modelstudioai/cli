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

function makeUsageResponse(percentage: number): Record<string, unknown> {
  return {
    data: {
      DataV2: {
        data: {
          data: {
            per5HourPercentage: percentage,
            per5HourResetTime: 1_786_000_000_000,
            per1WeekPercentage: percentage,
            per1WeekResetTime: 1_786_100_000_000,
          },
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
});
