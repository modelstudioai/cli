import { describe, expect, test } from "vite-plus/test";
import { runCommandE2e, runCommandHelp } from "./helpers.ts";
import { USAGE_ROUTES } from "./topic-routes.ts";

describe("e2e: usage freetier", () => {
  test("usage freetier --help 展示 risk、--yes 与确认示例", async () => {
    const { stderr, exitCode } = await runCommandHelp(USAGE_ROUTES, [
      "usage",
      "freetier",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--yes");
    expect(stderr).toMatch(/Risk:\s*high/i);
    expect(stderr).toContain("This changes free-tier auto-stop");
    expect(stderr).toContain("bl usage freetier --model qwen3-max --yes");
    expect(stderr).toContain("bl usage freetier --off --model qwen3-max --yes");
  });

  test("usage freetier 无 --yes 返回确认请求 (7)", async () => {
    const { stderr, exitCode } = await runCommandE2e(USAGE_ROUTES, [
      "usage",
      "freetier",
      "--model",
      "qwen-plus",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(7);
    expect(JSON.parse(stderr)).toMatchObject({
      error: { code: 7, type: "requires_confirmation" },
    });
  });

  test("usage freetier --yes 通过确认门槛后落到 AUTH (3)", async () => {
    // Clear OpenAPI env so console auth cannot exchange a host AK/SK into a session.
    const { stderr, exitCode } = await runCommandE2e(
      USAGE_ROUTES,
      ["usage", "freetier", "--model", "qwen-plus", "--yes", "--output", "json"],
      {
        BAILIAN_ACCESS_KEY_ID: undefined,
        BAILIAN_ACCESS_KEY_SECRET: undefined,
        ALIBABA_CLOUD_ACCESS_KEY_ID: undefined,
        ALIBABA_CLOUD_ACCESS_KEY_SECRET: undefined,
      },
    );
    expect(exitCode).toBe(3);
    expect(JSON.parse(stderr)).toMatchObject({
      error: { code: 3 },
    });
  });
});
