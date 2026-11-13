import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, describe, expect, test } from "vite-plus/test";
import { captureRegistryHelp } from "e2e/registry-smoke";
import { CommandRegistry } from "bailian-cli-runtime";
import { commands } from "../../src/commands.ts";
import { parseStdoutJson, runCli } from "./helpers.ts";

// Product-level: the real bl command map carries the deprecation wrappers
// (packages/cli/src/commands.ts), unlike the commands-library harness.
const registry = new CommandRegistry(commands, "bl");
const isolatedConfigDir = mkdtempSync(join(tmpdir(), "bl-flow-agent-deprecation-"));

afterAll(() => rmSync(isolatedConfigDir, { recursive: true, force: true }));

function runCliIsolated(args: string[]) {
  return runCli(args, {
    BAILIAN_CONFIG_DIR: isolatedConfigDir,
    DASHSCOPE_QUIET: "0",
    DO_NOT_TRACK: "1",
    NO_UPDATE_NOTIFIER: "1",
  });
}

describe("e2e: flow-agent group + app deprecation", () => {
  test("flow-agent registers all 13 commands; app keeps only call/list", () => {
    const flowAgentPaths = Object.keys(commands)
      .filter((path) => path.startsWith("flow-agent "))
      .sort();
    expect(flowAgentPaths).toEqual([
      "flow-agent call",
      "flow-agent copy",
      "flow-agent create",
      "flow-agent delete",
      "flow-agent get",
      "flow-agent list",
      "flow-agent publish",
      "flow-agent update",
      "flow-agent versions",
      "flow-agent workflow export",
      "flow-agent workflow get",
      "flow-agent workflow publish",
      "flow-agent workflow save",
    ]);
    const appPaths = Object.keys(commands)
      .filter((path) => path.startsWith("app "))
      .sort();
    expect(appPaths).toEqual(["app call", "app list"]);
  });

  test("app call help is deprecated and points to flow-agent call", () => {
    const help = captureRegistryHelp(registry, ["app", "call"]);
    expect(help).toContain("[Deprecated]");
    expect(help).toContain("flow-agent call");
  });

  test("app list help is deprecated and points to flow-agent list", () => {
    const help = captureRegistryHelp(registry, ["app", "list"]);
    expect(help).toContain("[Deprecated]");
    expect(help).toContain("flow-agent list");
  });

  test("flow-agent list help is not deprecated", () => {
    const help = captureRegistryHelp(registry, ["flow-agent", "list"]);
    expect(help).not.toContain("[Deprecated]");
  });

  test("removed app control-plane path is rejected (exit 2)", async () => {
    const result = await runCliIsolated(["app", "create", "--name", "x", "--output", "json"]);
    expect(result.exitCode, result.stderr).toBe(2);
  });

  test("app list --dry-run warns on stderr in text mode", async () => {
    const result = await runCliIsolated(["app", "list", "--dry-run", "--output", "text"]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toMatch(/deprecated/i);
    expect(result.stderr).toContain("flow-agent list");
  });

  test("app list --dry-run keeps stdout JSON clean in json mode", async () => {
    const result = await runCliIsolated(["app", "list", "--dry-run", "--output", "json"]);
    expect(result.exitCode, result.stderr).toBe(0);
    const data = parseStdoutJson<{ api: string }>(result.stdout);
    expect(data.api).toBe("zeldaEasy.broadscope-bailian.app-control.list");
  });
});
