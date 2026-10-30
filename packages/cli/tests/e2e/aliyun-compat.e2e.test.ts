import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vite-plus/test";
import { runCli } from "./helpers.ts";

const configDirectory = mkdtempSync(join(tmpdir(), "bl-aliyun-compat-"));
afterAll(() => rmSync(configDirectory, { recursive: true, force: true }));

function runCompatible(arguments_: string[], language = "en-US", compatibility = "aliyun bl") {
  writeFileSync(join(configDirectory, "config.json"), JSON.stringify({ language }));
  return runCli(arguments_, {
    BAILIAN_CONFIG_DIR: configDirectory,
    ALIBABA_CLOUD_BL_COMPAT_MODE: compatibility,
    DASHSCOPE_API_KEY: "",
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
)("host nested help uses the invocation prefix ($language, $path)", async ({ language, path }) => {
  const result = await runCompatible([...path.split(" "), "--help"], language);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stderr).toContain(`aliyun bl ${path}`);
  expect(result.stderr).not.toMatch(/(?<!aliyun )\bbl (?:auth|skill|managed-agent) /);
});

test("host introspection keeps product identity but qualifies executable examples", async () => {
  const result = await runCompatible(["auth", "status", "--introspect"]);
  expect(result.exitCode, result.stderr).toBe(0);
  const schema = JSON.parse(result.stdout);
  expect(schema.bin).toBe("bl");
  expect(schema.commands[0].path).toEqual(["auth", "status"]);
  expect(schema.commands[0].usage).toMatch(/^aliyun bl auth status/);
  expect(schema.commands[0].examples[0]).toBe("aliyun bl auth status");
});

test("host version is display-only and absent or unknown COMPAT keeps standalone", async () => {
  const hosted = await runCompatible(["--version"]);
  expect(hosted.stdout).toMatch(/^aliyun bl \d+\.\d+\.\d+\n$/);
  for (const compatibility of ["", " ", "unrecognized-host"]) {
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
