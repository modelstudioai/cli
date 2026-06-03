import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";
import { runCli } from "./helpers.ts";
import { resetCommandCatalogCache } from "../../src/load-commands.ts";
import { resetRegistry } from "../../src/registry.ts";

const fixtureRoot = join(fileURLToPath(import.meta.url), "..", "..", "fixtures", "test-plugin");

function pluginEnv(pluginsDir: string, skipNodeModules = false): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { BAILIAN_PLUGINS_DIR: pluginsDir };
  if (skipNodeModules) env.BAILIAN_CLI_PLUGINS_SKIP_NODE_MODULES = "1";
  return env;
}

test("plugin command is unavailable without link", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bl-plugins-empty-"));
  const prevPlugins = process.env.BAILIAN_PLUGINS_DIR;
  const prevSkip = process.env.BAILIAN_CLI_PLUGINS_SKIP_NODE_MODULES;
  process.env.BAILIAN_PLUGINS_DIR = dir;
  process.env.BAILIAN_CLI_PLUGINS_SKIP_NODE_MODULES = "1";

  try {
    resetCommandCatalogCache();
    resetRegistry();
    const result = await runCli(["test", "ping"], pluginEnv(dir, true));
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/Unknown command/i);
  } finally {
    if (prevPlugins === undefined) delete process.env.BAILIAN_PLUGINS_DIR;
    else process.env.BAILIAN_PLUGINS_DIR = prevPlugins;
    if (prevSkip === undefined) delete process.env.BAILIAN_CLI_PLUGINS_SKIP_NODE_MODULES;
    else process.env.BAILIAN_CLI_PLUGINS_SKIP_NODE_MODULES = prevSkip;
    await rm(dir, { recursive: true, force: true });
    resetCommandCatalogCache();
    resetRegistry();
  }
});

test("linked fixture plugin exposes bl test ping --help", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bl-plugins-fixture-help-"));
  const prevPlugins = process.env.BAILIAN_PLUGINS_DIR;
  const prevSkip = process.env.BAILIAN_CLI_PLUGINS_SKIP_NODE_MODULES;
  process.env.BAILIAN_PLUGINS_DIR = dir;
  process.env.BAILIAN_CLI_PLUGINS_SKIP_NODE_MODULES = "1";

  try {
    resetCommandCatalogCache();
    resetRegistry();

    const linkResult = await runCli(["plugins", "link", fixtureRoot], pluginEnv(dir, true));
    expect(linkResult.exitCode).toBe(0);

    resetCommandCatalogCache();
    resetRegistry();

    const help = await runCli(["test", "ping", "--help"], pluginEnv(dir, true));
    expect(help.exitCode).toBe(0);
    expect(help.stderr + help.stdout).toMatch(/test ping/i);
    expect(help.stderr + help.stdout).toMatch(/Fixture plugin test command/i);
  } finally {
    if (prevPlugins === undefined) delete process.env.BAILIAN_PLUGINS_DIR;
    else process.env.BAILIAN_PLUGINS_DIR = prevPlugins;
    if (prevSkip === undefined) delete process.env.BAILIAN_CLI_PLUGINS_SKIP_NODE_MODULES;
    else process.env.BAILIAN_CLI_PLUGINS_SKIP_NODE_MODULES = prevSkip;
    await rm(dir, { recursive: true, force: true });
    resetCommandCatalogCache();
    resetRegistry();
  }
});

test("linked fixture plugin exposes bl test ping", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bl-plugins-fixture-"));
  const prevPlugins = process.env.BAILIAN_PLUGINS_DIR;
  const prevSkip = process.env.BAILIAN_CLI_PLUGINS_SKIP_NODE_MODULES;
  process.env.BAILIAN_PLUGINS_DIR = dir;
  process.env.BAILIAN_CLI_PLUGINS_SKIP_NODE_MODULES = "1";

  try {
    resetCommandCatalogCache();
    resetRegistry();

    const linkResult = await runCli(["plugins", "link", fixtureRoot], pluginEnv(dir, true));
    expect(linkResult.exitCode).toBe(0);

    resetCommandCatalogCache();
    resetRegistry();

    const result = await runCli(["test", "ping"], pluginEnv(dir, true));
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("pong");
  } finally {
    if (prevPlugins === undefined) delete process.env.BAILIAN_PLUGINS_DIR;
    else process.env.BAILIAN_PLUGINS_DIR = prevPlugins;
    if (prevSkip === undefined) delete process.env.BAILIAN_CLI_PLUGINS_SKIP_NODE_MODULES;
    else process.env.BAILIAN_CLI_PLUGINS_SKIP_NODE_MODULES = prevSkip;
    await rm(dir, { recursive: true, force: true });
    resetCommandCatalogCache();
    resetRegistry();
  }
});
