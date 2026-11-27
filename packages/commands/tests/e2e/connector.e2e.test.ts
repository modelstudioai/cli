import { expect, test } from "vite-plus/test";
import { CONNECTOR_ROUTES } from "./topic-routes.ts";
import { runCommandHelp, runCommandInProcess } from "./helpers.ts";

test.each(["tools", "schema", "call"])("connector %s exposes workspace scope", async (action) => {
  const result = await runCommandHelp(CONNECTOR_ROUTES, ["connector", action, "--help"]);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stderr).toContain("--workspace-id");
});

test("connector call reaches argument validation without confirmation", async () => {
  const result = await runCommandInProcess(CONNECTOR_ROUTES, [
    "connector",
    "call",
    "--tool",
    "calendar.list",
    "--instance",
    "account",
    "--json",
    "[]",
    "--workspace-id",
    "ws-test",
    "--api-key",
    "sk-test",
    "--output",
    "json",
  ]);
  expect(result.exitCode, result.stderr).toBe(2);
  expect(JSON.parse(result.stderr).error.message).toContain("--json");
});

test("connector call previews the selected account and one execution offline", async () => {
  const result = await runCommandInProcess(CONNECTOR_ROUTES, [
    "connector",
    "call",
    "--tool",
    "calendar.list",
    "--instance",
    "account",
    "--trace-id",
    "trace",
    "--json",
    '{"limit":3}',
    "--workspace-id",
    "ws-test",
    "--output",
    "json",
    "--dry-run",
  ]);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stdout).toContain("CONNECTOR_MULTI_EXECUTE_TOOL");
  expect(result.stdout).toContain("ws-test.cn-beijing.maas.aliyuncs.com");
});
