import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e as runBaseCommandE2e, runCommandHelp } from "./helpers.ts";
import { SANDBOX_ROUTES } from "./topic-routes.ts";

const AUTH_ARGS = ["--api-key", "sk-sandbox-e2e", "--workspace-id", "ws-e2e"];
let configDirectory: string;

beforeEach(() => {
  configDirectory = mkdtempSync(join(tmpdir(), "bl-sandbox-e2e-"));
  writeFileSync(join(configDirectory, "config.json"), "{}");
});

afterEach(() => {
  rmSync(configDirectory, { recursive: true, force: true });
});

function runCommandE2e(routes: typeof SANDBOX_ROUTES, args: string[]) {
  return runBaseCommandE2e(routes, args, {
    BAILIAN_CONFIG_DIR: configDirectory,
    DASHSCOPE_BASE_URL: "",
    DASHSCOPE_API_KEY: "",
    BAILIAN_WORKSPACE_ID: "",
  });
}

describe("e2e: Sandbox command discovery", () => {
  test.each([
    ["sandbox", "create"],
    ["sandbox", "list"],
    ["sandbox", "get"],
    ["sandbox", "connect"],
    ["sandbox", "pause"],
    ["sandbox", "resume"],
    ["sandbox", "delete"],
    ["sandbox", "template", "create"],
    ["sandbox", "template", "list"],
    ["sandbox", "template", "get"],
    ["sandbox", "template", "update"],
    ["sandbox", "template", "build-status"],
    ["sandbox", "template", "delete"],
  ])("%s help resolves", async (...commandPath) => {
    const { stderr, exitCode } = await runCommandHelp(SANDBOX_ROUTES, [...commandPath, "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain(`Usage: bl ${commandPath.join(" ")}`);
    expect(stderr).toContain("Authentication: API Key");
  });

  test("instance timeout is separate from the global request/poll timeout", async () => {
    const { stderr, exitCode } = await runCommandHelp(SANDBOX_ROUTES, [
      "sandbox",
      "create",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--instance-timeout <seconds>/);
    expect(stderr).toMatch(/--timeout <seconds>/);
    expect(stderr).toMatch(/no E2B key is sent/i);
  });

  test("template create exposes max-running-time and default polling controls", async () => {
    const { stderr, exitCode } = await runCommandHelp(SANDBOX_ROUTES, [
      "sandbox",
      "template",
      "create",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--max-running-time <seconds>/);
    expect(stderr).toMatch(/--async/);
    expect(stderr).toMatch(/--poll-interval <seconds>/);
    expect(stderr).toMatch(/waits for build status ready/i);
  });
});

describe("e2e: Sandbox offline validation and dry-run", () => {
  test("create requires a template in flags or body", async () => {
    const { stderr, exitCode } = await runCommandE2e(SANDBOX_ROUTES, [
      "sandbox",
      "create",
      ...AUTH_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    expect(JSON.parse(stderr)).toMatchObject({
      error: { code: 2, message: expect.stringMatching(/template-id|templateID/) },
    });
  });

  test("create body flags win and request environment values are redacted", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SANDBOX_ROUTES, [
      "sandbox",
      "create",
      "--body",
      '{"templateID":"template-body","timeout":600,"envVars":{"BODY":"secret"}}',
      "--template-id",
      "template-flag",
      "--instance-timeout",
      "900",
      "--env",
      "FLAG=secret",
      ...AUTH_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson(stdout)).toMatchObject({
      method: "POST",
      endpoint: "https://ws-e2e.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio/sandbox/sandboxes",
      request: {
        templateID: "template-flag",
        timeout: 900,
        envVars: { BODY: "[REDACTED]", FLAG: "[REDACTED]" },
      },
    });
  });

  test.each([
    {
      name: "connect instance",
      args: ["sandbox", "connect", "--sandbox-id", "sandbox-test", "--instance-timeout", "900"],
      method: "POST",
      suffix: "/sandboxes/sandbox-test/connect",
    },
    {
      name: "pause instance",
      args: ["sandbox", "pause", "--sandbox-id", "sandbox-test"],
      method: "POST",
      suffix: "/sandboxes/sandbox-test/pause",
    },
    {
      name: "resume instance",
      args: ["sandbox", "resume", "--sandbox-id", "sandbox-test"],
      method: "POST",
      suffix: "/sandboxes/sandbox-test/resume",
    },
    {
      name: "delete instance",
      args: ["sandbox", "delete", "--sandbox-id", "sandbox-test"],
      method: "DELETE",
      suffix: "/sandboxes/sandbox-test",
    },
    {
      name: "create template",
      args: [
        "sandbox",
        "template",
        "create",
        "--name",
        "python",
        "--cpu-count",
        "1",
        "--memory-mb",
        "2048",
      ],
      method: "POST",
      suffix: "/v3/templates",
    },
    {
      name: "update template",
      args: [
        "sandbox",
        "template",
        "update",
        "--template-id",
        "template-test",
        "--description",
        "updated",
      ],
      method: "PUT",
      suffix: "/templates/template-test",
    },
    {
      name: "delete template",
      args: ["sandbox", "template", "delete", "--template-id", "template-test"],
      method: "DELETE",
      suffix: "/templates/template-test",
    },
  ])("$name dry-run stays offline", async ({ args, method, suffix }) => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SANDBOX_ROUTES, [
      ...args,
      ...AUTH_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const result = parseStdoutJson<{ method: string; endpoint: string }>(stdout);
    expect(result.method).toBe(method);
    expect(result.endpoint).toBe(
      `https://ws-e2e.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio/sandbox${suffix}`,
    );
  });
});

describe("e2e: Sandbox high-risk confirmation", () => {
  test.each([
    ["sandbox", "delete", "--sandbox-id", "sandbox-test"],
    ["sandbox", "template", "delete", "--template-id", "template-test"],
  ])("%s requires --yes before a remote delete", async (...commandArgs) => {
    const { stderr, exitCode } = await runCommandE2e(SANDBOX_ROUTES, [
      ...commandArgs,
      ...AUTH_ARGS,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(7);
    expect(JSON.parse(stderr)).toMatchObject({
      error: { code: 7, type: "requires_confirmation" },
    });
  });
});
