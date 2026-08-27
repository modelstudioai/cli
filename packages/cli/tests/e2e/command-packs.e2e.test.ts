import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCli } from "./helpers.ts";

const fixtureRoot = join(fileURLToPath(import.meta.url), "..", "..", "fixtures", "command-pack");
let configDir: string;

function env(): NodeJS.ProcessEnv {
  return { BAILIAN_CONFIG_DIR: configDir, DO_NOT_TRACK: "1" };
}

describe("e2e: Command Pack", () => {
  beforeAll(async () => {
    configDir = await mkdtemp(join(tmpdir(), "bl-command-pack-e2e-"));
  });

  afterAll(async () => {
    await rm(configDir, { recursive: true, force: true });
  });

  test("plugin 分组和管理命令 help 正常", async () => {
    const group = await runCli(["plugin"], env());
    expect(group.exitCode, group.stderr).toBe(0);
    expect(group.stderr).toContain("plugin install");
    expect(group.stderr).toContain("plugin link");
    expect(group.stderr).toContain("plugin list");
    expect(group.stderr).toContain("plugin remove");

    const install = await runCli(["plugin", "install", "--help"], env());
    expect(install.exitCode, install.stderr).toBe(0);
    expect(install.stderr).toContain("--package");
  });

  test("未 link 时插件命令不存在", async () => {
    const result = await runCli(["agent", "ping", "--message", "before"], env());
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/Unknown command/i);
  });

  test("link 后命令进入原生 registry/help/执行链路", async () => {
    const linked = await runCli(
      ["plugin", "link", "--path", fixtureRoot, "--output", "json"],
      env(),
    );
    expect(linked.exitCode, linked.stderr).toBe(0);
    const linkedJson = parseStdoutJson<{ linked: { name: string; commands: string[] } }>(
      linked.stdout,
    );
    expect(linkedJson.linked.name).toBe("@ali/bailian-plugin-agent");
    expect(linkedJson.linked.commands).toEqual([
      "agent credential",
      "agent credential-denied",
      "agent dangerous",
      "agent fail",
      "agent output",
      "agent ping",
    ]);

    const rootHelp = await runCli(["--help"], env());
    expect(rootHelp.exitCode, rootHelp.stderr).toBe(0);
    expect(rootHelp.stderr).toContain("agent ping");

    const commandHelp = await runCli(["agent", "ping", "--help"], env());
    expect(commandHelp.exitCode, commandHelp.stderr).toBe(0);
    expect(commandHelp.stderr).toContain("Ping the Command Pack fixture");
    expect(commandHelp.stderr).toContain("--message");

    const executed = await runCli(["agent", "ping", "--message", "hello"], env());
    expect(executed.exitCode, executed.stderr).toBe(0);
    expect(executed.stdout).toContain("command-pack:hello");

    const credential = await runCli(["agent", "credential", "--api-key", "fixture-key"], env());
    expect(credential.exitCode, credential.stderr).toBe(0);
    expect(credential.stdout).toContain("credential-source:flag");

    const denied = await runCli(["agent", "credential-denied"], {
      ...env(),
      DASHSCOPE_API_KEY: "fixture-key",
    });
    expect(denied.exitCode).toBe(1);
    expect(denied.stderr).toContain('must declare auth="apiKey"');

    const outputText = await runCli(["agent", "output"], env());
    expect(outputText.exitCode, outputText.stderr).toBe(0);
    expect(outputText.stdout).toBe("command-pack-output\n");

    const outputJson = await runCli(["agent", "output", "--output", "json"], env());
    expect(outputJson.exitCode, outputJson.stderr).toBe(0);
    expect(parseStdoutJson(outputJson.stdout)).toEqual({ source: "command-pack", ok: true });

    const failed = await runCli(["agent", "fail", "--output", "text"], env());
    expect(failed.exitCode).toBe(2);
    expect(failed.stderr).toContain("Command Pack fixture usage error.");
    expect(failed.stderr).toContain("Use agent fail only in tests.");
  });

  test("high-risk 命令由 runtime 统一确认并支持安全 dry-run", async () => {
    const dangerousHelp = await runCli(["agent", "dangerous", "--help"], env());
    expect(dangerousHelp.exitCode, dangerousHelp.stderr).toBe(0);
    expect(dangerousHelp.stderr).toContain("--yes");

    const unconfirmed = await runCli(["agent", "dangerous", "--output", "json"], env());
    expect(unconfirmed.exitCode).toBe(7);
    expect(JSON.parse(unconfirmed.stderr)).toMatchObject({
      error: { code: 7, type: "requires_confirmation" },
    });

    const confirmed = await runCli(["agent", "dangerous", "--yes", "--output", "json"], env());
    expect(confirmed.exitCode, confirmed.stderr).toBe(0);
    expect(parseStdoutJson(confirmed.stdout)).toEqual({
      executed: true,
      dry_run: false,
      command_flags: [],
    });

    const preview = await runCli(["agent", "dangerous", "--dry-run", "--output", "json"], env());
    expect(preview.exitCode, preview.stderr).toBe(0);
    expect(parseStdoutJson(preview.stdout)).toEqual({
      executed: false,
      dry_run: true,
      command_flags: [],
    });
  });

  test("plugin list 输出加载状态", async () => {
    const result = await runCli(["plugin", "list", "--output", "json"], env());
    expect(result.exitCode, result.stderr).toBe(0);
    const json = parseStdoutJson<{
      command_packs: Array<{ name: string; status: string; commands: string[] }>;
    }>(result.stdout);
    expect(json.command_packs).toEqual([
      expect.objectContaining({
        name: "@ali/bailian-plugin-agent",
        status: "loaded",
        commands: [
          "agent credential",
          "agent credential-denied",
          "agent dangerous",
          "agent fail",
          "agent output",
          "agent ping",
        ],
      }),
    ]);
  });

  test("remove 后命令从下一进程消失", async () => {
    const removed = await runCli(
      ["plugin", "remove", "--name", "@ali/bailian-plugin-agent", "--output", "json"],
      env(),
    );
    expect(removed.exitCode, removed.stderr).toBe(0);
    expect(parseStdoutJson<{ removed: string }>(removed.stdout).removed).toBe(
      "@ali/bailian-plugin-agent",
    );

    const result = await runCli(["agent", "ping", "--message", "after"], env());
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/Unknown command/i);
  });
});
