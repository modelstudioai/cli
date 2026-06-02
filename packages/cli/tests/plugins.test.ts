import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GlobalFlags } from "bailian-cli-core";
import { commandPathToFileBase, fileToCommandPath, getPluginsDir } from "bailian-cli-core";
import { expect, test } from "vite-plus/test";
import { resetCommandCatalogCache } from "../src/load-commands.ts";
import { discoverPlugins } from "../src/plugins/discover.ts";
import { mergeCommands } from "../src/plugins/priority.ts";
import {
  diffAddedDepNames,
  parsePackageNameFromSpec,
  pickInstalledPackageName,
  topLevelDepNamesFromNpmLs,
  resolveSandboxPackageRoot,
} from "../src/plugins/npm-sandbox.ts";
import { scanPluginCommands, buildLazyPluginCommand } from "../src/plugins/scan.ts";
import { resetRegistry } from "../src/registry.ts";
import { commands as builtinCommands } from "../src/commands/catalog.ts";

const fixtureRoot = join(fileURLToPath(import.meta.url), "..", "fixtures", "test-plugin");

test("fileToCommandPath and commandPathToFileBase", () => {
  expect(fileToCommandPath("test/ping.ts")).toBe("test ping");
  expect(commandPathToFileBase("test ping")).toBe("test/ping");
});

test("scan fixture plugin commands directory", async () => {
  const plugin = {
    name: "bailian-test-fixture",
    root: fixtureRoot,
    source: "link" as const,
    bailianCli: { plugin: true, commands: "./src/commands" },
  };
  const { commands, error } = await scanPluginCommands(plugin);
  expect(error).toBeUndefined();
  expect(commands.map((c) => c.commandPath)).toContain("test ping");
});

test("buildLazyPluginCommand runs fixture command", async () => {
  const plugin = {
    name: "bailian-test-fixture",
    root: fixtureRoot,
    source: "link" as const,
    bailianCli: { plugin: true, commands: "./src/commands" },
  };
  const { commands } = await scanPluginCommands(plugin);
  const scanned = commands.find((c) => c.commandPath === "test ping")!;
  const cmd = await buildLazyPluginCommand(scanned);
  expect(cmd?.name).toBe("test ping");

  let output = "";
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => {
    output += chunk;
    return true;
  }) as typeof process.stdout.write;

  const emptyFlags = {} as GlobalFlags;

  try {
    await cmd!.execute(
      {
        region: "cn",
        baseUrl: "https://example.com",
        output: "text",
        timeout: 30,
        verbose: false,
        quiet: true,
        noColor: true,
        yes: true,
        dryRun: false,
        nonInteractive: true,
        async: false,
        telemetry: false,
        consoleGatewayUrl: "https://example.com",
      },
      emptyFlags,
    );
  } finally {
    process.stdout.write = origWrite;
  }
  expect(output).toContain("pong");
});

test("mergeCommands skips plugin conflicts with builtin", () => {
  const { commands, pluginErrors } = mergeCommands(builtinCommands, [
    {
      path: "text chat",
      command: {
        name: "text chat",
        description: "evil",
        execute: async () => {},
      },
      plugin: {
        name: "evil",
        root: "/tmp",
        source: "discovered",
        bailianCli: { plugin: true, commands: "./cmds" },
      },
    },
  ]);
  expect(commands["text chat"].description).not.toBe("evil");
  expect(pluginErrors.length).toBe(1);
});

test("npm sandbox install resolution helpers", () => {
  expect(topLevelDepNamesFromNpmLs({ dependencies: { a: {}, "@s/b": {} } })).toEqual(["a", "@s/b"]);
  expect(diffAddedDepNames(["a"], ["a", "b"])).toEqual(["b"]);
  expect(parsePackageNameFromSpec("@alife/bailian-agent@1.0.0")).toBe("@alife/bailian-agent");
  expect(parsePackageNameFromSpec("github:org/repo")).toBeUndefined();
  expect(pickInstalledPackageName("@alife/bailian-agent", ["@alife/bailian-agent"], [])).toBe(
    "@alife/bailian-agent",
  );
  expect(
    pickInstalledPackageName("git+https://example.com/x.git", ["only-new"], ["only-new"]),
  ).toBe("only-new");
  expect(resolveSandboxPackageRoot("/tmp/p", "@a/b")).toBe("/tmp/p/node_modules/@a/b");
});

test("link plugin via BAILIAN_PLUGINS_DIR", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bl-plugins-"));
  const prev = process.env.BAILIAN_PLUGINS_DIR;
  process.env.BAILIAN_PLUGINS_DIR = dir;

  try {
    resetCommandCatalogCache();
    resetRegistry();

    const { linkPlugin } = await import("../src/plugins/manager.ts");
    await linkPlugin(fixtureRoot);

    const plugins = await discoverPlugins();
    expect(plugins.some((p) => p.name === "bailian-test-fixture")).toBe(true);
    expect(getPluginsDir()).toBe(dir);
  } finally {
    if (prev === undefined) delete process.env.BAILIAN_PLUGINS_DIR;
    else process.env.BAILIAN_PLUGINS_DIR = prev;
    await rm(dir, { recursive: true, force: true });
    resetCommandCatalogCache();
    resetRegistry();
  }
});
