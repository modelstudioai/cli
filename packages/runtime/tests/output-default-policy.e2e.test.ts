import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { BailianError, defineCommand, ExitCode, type OutputFormat } from "bailian-cli-core";
import { buildIsolatedCliEnv } from "e2e/isolation";
import { runInProcess } from "e2e/in-process";
import { createCli } from "../src/create-cli.ts";

const identity = { binName: "bl", version: "0.0.0", clientName: "test", npmPackage: "test" };
const scenarios: {
  label: string;
  fallback: OutputFormat;
  profile?: OutputFormat;
  env?: OutputFormat;
  flag?: OutputFormat;
  override?: boolean;
  expected: OutputFormat;
}[] = [
  { label: "command JSON fallback", fallback: "json", expected: "json" },
  { label: "command text fallback", fallback: "text", expected: "text" },
  {
    label: "profile text precedes JSON fallback",
    fallback: "json",
    profile: "text",
    expected: "text",
  },
  {
    label: "profile JSON precedes text fallback",
    fallback: "text",
    profile: "json",
    expected: "json",
  },
  {
    label: "environment precedes profile",
    fallback: "json",
    profile: "json",
    env: "text",
    expected: "text",
  },
  {
    label: "flag precedes environment",
    fallback: "json",
    profile: "json",
    env: "json",
    flag: "text",
    expected: "text",
  },
  {
    label: "telemetry explicit policy overrides profile",
    fallback: "json",
    profile: "text",
    override: true,
    expected: "json",
  },
  {
    label: "telemetry policy respects environment",
    fallback: "json",
    profile: "json",
    env: "text",
    override: true,
    expected: "text",
  },
  {
    label: "telemetry policy respects flag",
    fallback: "json",
    profile: "json",
    env: "json",
    flag: "text",
    override: true,
    expected: "text",
  },
];
async function invoke(scenario: (typeof scenarios)[number], fail = false) {
  const directory = await mkdtemp(join(tmpdir(), "output-default-policy-"));
  await writeFile(
    join(directory, "config.json"),
    JSON.stringify({ output: scenario.profile, language: "en-US" }),
  );
  await writeFile(
    join(directory, "update-state.json"),
    JSON.stringify({ lastChecked: Date.now(), latestVersion: "0.0.0" }),
  );
  const isolated = buildIsolatedCliEnv({
    overrides: {
      BAILIAN_CONFIG_DIR: directory,
      DASHSCOPE_OUTPUT: scenario.env,
      DASHSCOPE_QUIET: "0",
      DASHSCOPE_VERBOSE: "0",
      DO_NOT_TRACK: "1",
      BAILIAN_INSTALL_METHOD: "brew",
    },
  });
  const command = defineCommand({
    auth: "none",
    description: { "en-US": "Output policy fixture", "zh-CN": "输出策略夹具" },
    defaultOutput: scenario.fallback,
    defaultOutputOverridesProfile: scenario.override,
    async run(context) {
      if (fail) throw new BailianError("fixture failure", ExitCode.USAGE);
      context.output.result(
        { format: context.settings.output },
        { text: `format: ${context.settings.output}` },
      );
    },
  });
  const args = ["format", "--quiet", ...(scenario.flag ? ["--output", scenario.flag] : [])];
  try {
    return await runInProcess(() => createCli({ format: command }, identity).run(args), args, {
      env: isolated.env,
    });
  } finally {
    isolated.dispose();
    await rm(directory, { recursive: true, force: true });
  }
}
test.each(scenarios)("$label selects matching business and reporter formats", async (scenario) => {
  const result = await invoke(scenario);
  expect(result.exitCode, result.stderr).toBe(0);
  if (scenario.expected === "json") expect(JSON.parse(result.stdout)).toEqual({ format: "json" });
  else expect(result.stdout).toBe("format: text\n");
});
test.each([scenarios[0]!, scenarios[2]!, scenarios[6]!])(
  "$label applies to terminal errors",
  async (scenario) => {
    const result = await invoke(scenario, true);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    if (scenario.expected === "json")
      expect(JSON.parse(result.stderr).error.message).toBe("fixture failure");
    else expect(result.stderr).toContain("Error: fixture failure");
  },
);
