import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandHelp, runCommandInProcess } from "./helpers.ts";
import { USAGE_ROUTES } from "./topic-routes.ts";

/** Clear host OpenAPI env so console auth cannot exchange a local AK/SK into a session. */
const CLEAR_OPENAPI_ENV = {
  BAILIAN_ACCESS_KEY_ID: undefined,
  BAILIAN_ACCESS_KEY_SECRET: undefined,
  ALIBABA_CLOUD_ACCESS_KEY_ID: undefined,
  ALIBABA_CLOUD_ACCESS_KEY_SECRET: undefined,
};

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
    expect(stderr).toContain("Enabling it makes calls fail once free quota is exhausted");
    expect(stderr).toContain("bl usage freetier --model qwen3-max --yes");
    expect(stderr).toContain("bl usage freetier --off --model qwen3-max --yes");
  });

  test("usage freetier 无 --yes 返回确认请求 (7)", async () => {
    const { stderr, exitCode } = await runCommandInProcess(USAGE_ROUTES, [
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
    const { stderr, exitCode } = await runCommandInProcess(
      USAGE_ROUTES,
      ["usage", "freetier", "--model", "qwen-plus", "--yes", "--output", "json"],
      CLEAR_OPENAPI_ENV,
    );
    expect(exitCode).toBe(3);
    expect(JSON.parse(stderr)).toMatchObject({
      error: { code: 3 },
    });
  });

  test("usage freetier --dry-run 跳过确认并输出计划（零网络）", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(USAGE_ROUTES, [
      "usage",
      "freetier",
      "--model",
      "qwen-plus",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).not.toContain("requires_confirmation");
    const data = parseStdoutJson<{
      api: string;
      data: { BatchActivateFreeTierOnlyRequest: { models: string[] } };
    }>(stdout);
    expect(data.api).toBe("zeldaEasy.bailian-commerce.freeTrial.batchActivateFreeTierOnly");
    expect(data.data.BatchActivateFreeTierOnlyRequest.models).toEqual(["qwen-plus"]);
  });

  test("usage freetier --off --dry-run 输出停用计划", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(USAGE_ROUTES, [
      "usage",
      "freetier",
      "--off",
      "--model",
      "qwen-plus",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      api: string;
      data: { BatchDeactivateFreeTierOnlyRequest: { models: string[] } };
    }>(stdout);
    expect(data.api).toBe("zeldaEasy.bailian-commerce.freeTrial.batchDeactivateFreeTierOnly");
    expect(data.data.BatchDeactivateFreeTierOnlyRequest.models).toEqual(["qwen-plus"]);
  });
});
