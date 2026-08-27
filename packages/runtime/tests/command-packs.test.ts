import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";
import type { Identity } from "bailian-cli-core";
import { installCommandPack, parseCommandPackSpec } from "../src/command-packs/manager.ts";
import { getCommandPacksDir } from "../src/command-packs/paths.ts";
import { loadAndValidateCommandPack } from "../src/command-packs/validate.ts";
import type { CommandPackPackageJson, CommandPackPolicy } from "../src/command-packs/types.ts";

const packageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../cli/tests/fixtures/command-pack",
);
const identity: Identity = {
  binName: "bl",
  version: "1.7.0",
  clientName: "bailian-cli",
  npmPackage: "bailian-cli",
};
const policy: CommandPackPolicy = {
  supported: {
    "@ali/bailian-plugin-agent": {
      commandPrefixes: ["agent"],
      credentialAccess: ["apiKey"],
    },
  },
};
const packageJson: CommandPackPackageJson = {
  name: "@ali/bailian-plugin-agent",
  version: "0.0.0-test",
  bailianCli: {
    type: "command-pack",
    apiVersion: 1,
    entry: "./commands.mjs",
    minCliVersion: "1.7.0",
  },
};

const fakeNpmSource = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const cwd = process.cwd();
const logPath = path.join(process.env.TMPDIR ?? cwd, "npm.log");
fs.appendFileSync(
  logPath,
  JSON.stringify({
    args,
    env: {
      registry: process.env.NPM_CONFIG_REGISTRY ?? null,
      catalog: process.env.npm_config_catalog ?? null,
      recursive: process.env.npm_config_recursive ?? null,
      overrides: process.env.npm_config_overrides ?? null,
    },
  }) + "\\n",
);

if (args[0] === "--version") {
  process.stdout.write("10.0.0\\n");
  process.exit(0);
}

const manifestPath = path.join(cwd, "package.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.dependencies ??= {};
const name = "@ali/bailian-plugin-agent";
const packageRoot = path.join(cwd, "node_modules", "@ali", "bailian-plugin-agent");

if (args[0] === "uninstall") {
  delete manifest.dependencies[name];
  fs.rmSync(packageRoot, { recursive: true, force: true });
} else if (args[0] === "install") {
  const requested = args[1] ?? "";
  const broken = requested.endsWith("@broken");
  const version = requested.endsWith("@1.0.0") ? "1.0.0" : "2.0.0";
  manifest.dependencies[name] = version;
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "package.json"),
    JSON.stringify({
      name,
      version,
      bailianCli: {
        type: "command-pack",
        apiVersion: broken ? 2 : 1,
        entry: "./commands.mjs",
      },
    }),
  );
  fs.writeFileSync(
    path.join(packageRoot, "commands.mjs"),
    'export default { "agent ping": { description: "Ping", auth: "none", async run() {} } };\\n',
  );
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\\n");
`;

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("only accepts a package supported by the current product policy", () => {
  expect(parseCommandPackSpec("@ali/bailian-plugin-agent@beta", identity, policy)).toEqual({
    name: "@ali/bailian-plugin-agent",
    requested: "@ali/bailian-plugin-agent@beta",
  });
  expect(() =>
    parseCommandPackSpec("@ali/bailian-plugin-agent@file:../pack", identity, policy),
  ).toThrow(/Unsupported Command Pack package spec/);
  expect(() => parseCommandPackSpec("@ali/not-allowlisted", identity, policy)).toThrow(
    /not allowlisted for bl/,
  );
});

test("isolates each product in its own Command Pack sandbox", () => {
  expect(getCommandPacksDir(identity).endsWith(join("plugins", "bailian-cli"))).toBe(true);
  expect(
    getCommandPacksDir({
      ...identity,
      binName: "kscli",
      clientName: "knowledge-studio-cli",
      npmPackage: "knowledge-studio-cli",
    }).endsWith(join("plugins", "knowledge-studio-cli")),
  ).toBe(true);
});

test("loads an API 1 Command Pack and preserves its command contract", async () => {
  const commands = await loadAndValidateCommandPack(
    "@ali/bailian-plugin-agent",
    packageJson,
    policy.supported["@ali/bailian-plugin-agent"]!,
    identity,
    packageRoot,
  );

  expect(Object.keys(commands)).toEqual([
    "agent credential",
    "agent credential-denied",
    "agent dangerous",
    "agent fail",
    "agent output",
    "agent ping",
  ]);
  expect(commands["agent credential"]?.auth).toBe("apiKey");
  expect(commands["agent ping"]?.auth).toBe("none");
  expect(commands["agent ping"]?.description).toEqual({
    "en-US": "Ping the Command Pack fixture",
    "zh-CN": "调用 Command Pack 测试命令",
  });
  expect(commands["agent ping"]?.risk).toBeUndefined();
  expect(commands["agent dangerous"]?.risk).toEqual({
    level: "high",
    message: {
      "en-US": "This fixture represents a high-risk operation.",
      "zh-CN": "该测试命令代表高风险操作。",
    },
  });
  expect(commands["agent ping"]?.flags?.message).toMatchObject({ required: true, type: "string" });
});

test("rejects incompatible protocol versions and invalid command prefixes", async () => {
  await expect(
    loadAndValidateCommandPack(
      "@ali/bailian-plugin-agent",
      { ...packageJson, bailianCli: { ...packageJson.bailianCli!, apiVersion: 2 } },
      policy.supported["@ali/bailian-plugin-agent"]!,
      identity,
      packageRoot,
    ),
  ).rejects.toThrow(/Command Pack API 2 is not supported/);

  await expect(
    loadAndValidateCommandPack(
      "@ali/bailian-plugin-agent",
      packageJson,
      { commandPrefixes: ["other"] },
      identity,
      packageRoot,
    ),
  ).rejects.toThrow(/outside the allowed prefixes/);
});

test("installs once on success and restores the previous version after validation failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "command-pack-install-test-"));
  const binDir = join(root, "bin");
  const logPath = join(root, "npm.log");
  const npmPath = join(binDir, "npm");
  const previousConfigDir = process.env.BAILIAN_CONFIG_DIR;
  const previousPath = process.env.PATH;
  const previousTmpdir = process.env.TMPDIR;
  const previousRegistry = process.env.NPM_CONFIG_REGISTRY;
  const previousCatalog = process.env.npm_config_catalog;
  const previousRecursive = process.env.npm_config_recursive;
  const previousOverrides = process.env.npm_config_overrides;

  try {
    await mkdir(binDir, { recursive: true });
    await writeFile(npmPath, fakeNpmSource);
    await chmod(npmPath, 0o755);
    await writeFile(logPath, "");
    process.env.BAILIAN_CONFIG_DIR = join(root, "config");
    process.env.PATH = `${binDir}${delimiter}${previousPath ?? ""}`;
    process.env.TMPDIR = root;
    process.env.NPM_CONFIG_REGISTRY = "https://registry.example.test";
    process.env.npm_config_catalog = "prefer";
    process.env.npm_config_recursive = "true";
    process.env.npm_config_overrides = "true";

    const installed = await installCommandPack("@ali/bailian-plugin-agent@1.0.0", identity, policy);
    expect(installed.version).toBe("1.0.0");
    const successfulCalls = (await readFile(logPath, "utf8"))
      .trim()
      .split("\n")
      .map(
        (line) =>
          JSON.parse(line) as {
            args: string[];
            env: Record<string, string | null>;
          },
      );
    // runNpm probes `npm --version` before each install/uninstall.
    expect(successfulCalls.map((call) => call.args[0])).toEqual(["--version", "install"]);
    expect(successfulCalls[1]?.env).toEqual({
      registry: "https://registry.example.test",
      catalog: null,
      recursive: null,
      overrides: null,
    });

    await writeFile(logPath, "");
    await expect(
      installCommandPack("@ali/bailian-plugin-agent@broken", identity, policy),
    ).rejects.toThrow(/Command Pack API 2 is not supported/);

    const rollbackCalls = (await readFile(logPath, "utf8"))
      .trim()
      .split("\n")
      .map(
        (line) =>
          JSON.parse(line) as {
            args: string[];
            env: Record<string, string | null>;
          },
      );
    expect(rollbackCalls.map((call) => call.args.slice(0, 2))).toEqual([
      ["--version"],
      ["install", "@ali/bailian-plugin-agent@broken"],
      ["--version"],
      ["install", "@ali/bailian-plugin-agent@1.0.0"],
    ]);

    const manifest = JSON.parse(
      await readFile(join(root, "config", "plugins", "bailian-cli", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(manifest.dependencies?.["@ali/bailian-plugin-agent"]).toBe("1.0.0");
  } finally {
    restoreEnv("BAILIAN_CONFIG_DIR", previousConfigDir);
    restoreEnv("PATH", previousPath);
    restoreEnv("TMPDIR", previousTmpdir);
    restoreEnv("NPM_CONFIG_REGISTRY", previousRegistry);
    restoreEnv("npm_config_catalog", previousCatalog);
    restoreEnv("npm_config_recursive", previousRecursive);
    restoreEnv("npm_config_overrides", previousOverrides);
    await rm(root, { recursive: true, force: true });
  }
});
