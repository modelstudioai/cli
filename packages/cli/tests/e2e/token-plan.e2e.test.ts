import { describe, expect, test } from "vite-plus/test";
import { makeE2eOutputDir, parseStdoutJson, runCli } from "./helpers.ts";

describe("e2e: token-plan", () => {
  test("token-plan help shows centralized OpenAPI auth flags", async () => {
    const { stderr, exitCode } = await runCli(["token-plan", "list-seats", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--access-key-id/);
    expect(stderr).toMatch(/--access-key-secret/);
  });

  test("token-plan dry-run does not require OpenAPI AK/SK", async () => {
    const { stdout, stderr, exitCode } = await runCli(
      ["token-plan", "list-seats", "--dry-run", "--output", "json"],
      {
        ALIBABA_CLOUD_ACCESS_KEY_ID: "",
        ALIBABA_CLOUD_ACCESS_KEY_SECRET: "",
      },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ endpoint?: string; query?: Record<string, unknown> }>(stdout);
    expect(data.endpoint).toContain("/tokenplan/subscription/seat-detail");
    expect(data.query).toBeDefined();
  });

  test("token-plan non-dry-run requires OpenAPI AK/SK", async () => {
    const configDir = makeE2eOutputDir("token-plan-missing-openapi");
    const { stderr, exitCode } = await runCli(["token-plan", "list-seats"], {
      BAILIAN_CONFIG_DIR: configDir,
      ALIBABA_CLOUD_ACCESS_KEY_ID: "",
      ALIBABA_CLOUD_ACCESS_KEY_SECRET: "",
    });
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/OpenAPI AK\/SK|access-key-id|ALIBABA_CLOUD_ACCESS_KEY_ID/);
  });

  test("token-plan partial OpenAPI env reports AK/SK hint without API key onboarding", async () => {
    const configDir = makeE2eOutputDir("token-plan-partial-openapi-env");
    const { stderr, exitCode } = await runCli(["token-plan", "list-seats"], {
      BAILIAN_CONFIG_DIR: configDir,
      ALIBABA_CLOUD_ACCESS_KEY_ID: "ak-e2e-placeholder",
      ALIBABA_CLOUD_ACCESS_KEY_SECRET: "",
    });
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/Incomplete OpenAPI AK\/SK/);
    expect(stderr).toMatch(/ALIBABA_CLOUD_ACCESS_KEY_ID/);
    expect(stderr).not.toMatch(/auth login --api-key/);
  });
});
