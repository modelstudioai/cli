import { captureRegistryHelp } from "e2e/registry-smoke";
import { buildIsolatedCliEnv } from "e2e/isolation";
import { runInProcess } from "e2e/in-process";
import { defineCommand, buildCommandInvocation, maskToken } from "bailian-cli-core";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, expectTypeOf, test } from "vite-plus/test";
import { runCli } from "./helpers.ts";
import {
  buildCommandSchema,
  CommandRegistry,
  createCli,
  type CliOptions,
} from "bailian-cli-runtime";
import { commands } from "../../src/commands.ts";
import { resolveAliyunIntegration } from "../../src/integrations/aliyun.ts";

const configDirectory = mkdtempSync(join(tmpdir(), "bl-aliyun-compat-"));
afterAll(() => rmSync(configDirectory, { recursive: true, force: true }));

test("host adapter propagates executable argv through the runtime context", async () => {
  expectTypeOf<CliOptions>().not.toHaveProperty("commandPrefix");
  const isolated = buildIsolatedCliEnv({
    overrides: { NO_UPDATE_NOTIFIER: "1", DO_NOT_TRACK: "1" },
  });
  const arguments_ = ["probe", "--output", "json"];
  const probe = defineCommand({
    auth: "none",
    description: "fixture",
    async run(context) {
      context.output.result({
        product: context.identity.binName,
        command: buildCommandInvocation(
          context.identity,
          ["knowledge", "delete"],
          ["--index-id", "example"],
        ),
      });
    },
  });
  try {
    const result = await runInProcess(
      () =>
        createCli(
          { probe },
          {
            binName: "bl",
            clientName: "test",
            npmPackage: "test",
            version: "test",
            ...resolveAliyunIntegration({ ALIBABA_CLOUD_BL_COMPAT_MODE: "aliyun bl" }),
          },
        ).run(arguments_),
      arguments_,
      { env: isolated.env },
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      product: "bl",
      command: {
        bin: "aliyun",
        path: ["bl", "knowledge", "delete"],
        args: ["--index-id", "example"],
      },
    });
  } finally {
    isolated.dispose();
  }
});

test("all command metadata preserves standalone wording and resolves hosted references", () => {
  const identity = {
    binName: "bl",
    version: "test",
    clientName: "test",
    npmPackage: "bailian-cli",
  };
  const standalone = buildCommandSchema(new CommandRegistry(commands, "bl"), identity);
  const hosted = buildCommandSchema(new CommandRegistry(commands, "aliyun bl"), {
    ...identity,
    commandInvocation: { bin: "aliyun", path: ["bl"] },
  });
  const serialized = JSON.stringify(hosted);
  expect(serialized).not.toContain("{{commandPrefix}}");
  expect(hosted.bin).toBe("aliyun");
  expect(hosted.scope).toEqual(["bl"]);
  const qualifiedStandalone = {
    ...standalone,
    bin: "aliyun",
    scope: ["bl"],
    commands: standalone.commands.map((command) => ({ ...command, path: ["bl", ...command.path] })),
  };
  expect(JSON.parse(serialized.replaceAll("aliyun bl", "bl"))).toEqual(qualifiedStandalone);
  const skill = hosted.commands.find((command) => command.path.join(" ") === "bl skill init")!;
  expect(JSON.stringify(skill.notes)).toContain("Equivalent to: `aliyun bl skill add --all`");
});

// Real subprocesses below verify the product entrypoint reads the inherited host marker.
function runCompatible(arguments_: string[], language = "en-US", compatibility = "aliyun bl") {
  writeFileSync(join(configDirectory, "config.json"), JSON.stringify({ language }));
  return runCli(arguments_, {
    BAILIAN_CONFIG_DIR: configDirectory,
    ALIBABA_CLOUD_BL_COMPAT_MODE: compatibility,
    DASHSCOPE_API_KEY: "",
    BAILIAN_ACCESS_KEY_ID: "",
    BAILIAN_ACCESS_KEY_SECRET: "",
    BAILIAN_SECURITY_TOKEN: "",
    ALIBABA_CLOUD_ACCESS_KEY_ID: "",
    ALIBABA_CLOUD_ACCESS_KEY_SECRET: "",
    ALIBABA_CLOUD_SECURITY_TOKEN: "",
    NO_UPDATE_NOTIFIER: "1",
    DO_NOT_TRACK: "1",
  });
}

test.each(["en-US", "zh-CN"])(
  "host help and onboarding use the invocation prefix (%s)",
  async (language) => {
    const root = await runCompatible(["--help"], language);
    expect(root.exitCode, root.stderr).toBe(0);
    expect(root.stderr).toContain("aliyun bl <resource> <command> [flags]");
    expect(root.stderr).toContain("aliyun bl auth login --console");
  },
);

test.each(
  ["en-US", "zh-CN"].flatMap((language) =>
    ["app", "app list", "skill init", "managed-agent plan"].map((path) => ({ language, path })),
  ),
)("host nested help uses the invocation prefix ($language, $path)", ({ language, path }) => {
  const registry = new CommandRegistry(commands, "aliyun bl", {
    language: language as "en-US" | "zh-CN",
    localize: (value) => (typeof value === "string" ? value : value[language as "en-US" | "zh-CN"]),
  });
  const help = captureRegistryHelp(registry, path.split(" "));
  expect(help).toContain(`aliyun bl ${path}`);
  expect(help).not.toMatch(/(?<!aliyun )\bbl (?:auth|skill|managed-agent) /);
});

// Real entrypoint verifies inherited Bailian env names without making authentication requests.
test("auth status reads Bailian env before config and host env without adding status fields", async () => {
  writeFileSync(
    join(configDirectory, "config.json"),
    JSON.stringify({
      language: "en-US",
      access_key_id: "config-ak",
      access_key_secret: "config-sk",
    }),
  );
  const result = await runCli(["auth", "status", "--output", "json"], {
    BAILIAN_CONFIG_DIR: configDirectory,
    ALIBABA_CLOUD_BL_COMPAT_MODE: "aliyun bl",
    BAILIAN_ACCESS_KEY_ID: "bailian-env-access-key",
    BAILIAN_ACCESS_KEY_SECRET: "bailian-env-secret-key",
    BAILIAN_SECURITY_TOKEN: "bailian-env-sts",
    ALIBABA_CLOUD_ACCESS_KEY_ID: "host-ak",
    ALIBABA_CLOUD_ACCESS_KEY_SECRET: "host-sk",
    ALIBABA_CLOUD_SECURITY_TOKEN: "host-sts",
    DASHSCOPE_API_KEY: "",
    NO_UPDATE_NOTIFIER: "1",
    DO_NOT_TRACK: "1",
  });
  expect(result.exitCode, result.stderr).toBe(0);
  const state = JSON.parse(result.stdout);
  expect(state.openapi).toEqual({
    source: "env",
    access_key_id: maskToken("bailian-env-access-key"),
    access_key_secret: maskToken("bailian-env-secret-key"),
  });
  expect(state.console).toBeUndefined();
  expect(result.stdout + result.stderr).not.toContain("bailian-env-secret-key");
  expect(result.stdout + result.stderr).not.toContain("bailian-env-sts");
});

test("host introspection exports executable paths and examples from the real entrypoint", async () => {
  const result = await runCompatible(["auth", "status", "--introspect"]);
  expect(result.exitCode, result.stderr).toBe(0);
  const schema = JSON.parse(result.stdout);
  expect(schema.bin).toBe("aliyun");
  expect(schema.scope).toEqual(["bl", "auth", "status"]);
  expect(schema.commands[0].path).toEqual(["bl", "auth", "status"]);
  expect(schema.commands[0].usage).toMatch(/^aliyun bl auth status/);
  expect(schema.commands[0].examples[0]).toBe("aliyun bl auth status");
});

test("host version is display-only and absent or unknown COMPAT keeps standalone", async () => {
  const hosted = await runCompatible(["--version"]);
  expect(hosted.stdout).toMatch(/^aliyun bl \d+\.\d+\.\d+\n$/);
  for (const compatibility of [""]) {
    const standalone = await runCompatible(["--version"], "en-US", compatibility);
    expect(standalone.stdout).toMatch(/^bl \d+\.\d+\.\d+\n$/);
  }
});

test.each(["text", "json"])(
  "missing Console credentials use host instructions (%s)",
  async (output) => {
    const result = await runCompatible(["app", "list", "--output", output]);
    expect(result.exitCode, result.stderr).toBe(3);
    const diagnostic = output === "json" ? JSON.parse(result.stderr).error.hint : result.stderr;
    expect(diagnostic).toContain("aliyun bl auth login --console");
    expect(diagnostic).not.toMatch(/(?<!aliyun )\bbl auth login/);
  },
);

test("auth status operation hints use the host prefix without changing authentication", async () => {
  const result = await runCompatible(["auth", "status", "--output", "json"]);
  expect(result.exitCode, result.stderr).toBe(0);
  const status = JSON.parse(result.stdout);
  expect(status.authenticated).toBe(false);
  expect(status.hint).toContain("aliyun bl auth login --api-key");
});

// Marker decoding is pure; unknown/whitespace cases need no additional CLI processes.
test.each(["", " ", "unrecognized-host"])(
  "unknown host marker keeps the default invocation (%j)",
  (marker) => {
    expect(resolveAliyunIntegration({ ALIBABA_CLOUD_BL_COMPAT_MODE: marker })).toEqual({});
  },
);
test("recognized host marker permits surrounding whitespace", () => {
  expect(resolveAliyunIntegration({ ALIBABA_CLOUD_BL_COMPAT_MODE: " aliyun bl " })).toEqual({
    commandInvocation: { bin: "aliyun", path: ["bl"] },
  });
});
