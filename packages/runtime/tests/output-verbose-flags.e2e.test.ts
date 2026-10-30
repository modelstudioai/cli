import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { defineCommand } from "bailian-cli-core";
import { buildIsolatedCliEnv } from "e2e/isolation";
import { runInProcess } from "e2e/in-process";
import { createCli } from "../src/create-cli.ts";
const cases = ["json", "text"].flatMap((format) =>
  [false, true].flatMap((quiet) =>
    [false, true].flatMap((verbose) =>
      [false, true].map((trace) => ({ format, quiet, verbose, trace })),
    ),
  ),
);
test.each(cases)(
  "explicit diagnostic aliases resolve before reporter construction %j",
  async ({ format, quiet, verbose, trace }) => {
    const directory = await mkdtemp(join(tmpdir(), "output-verbose-flags-"));
    await writeFile(join(directory, "config.json"), JSON.stringify({ language: "en-US" }));
    await writeFile(
      join(directory, "update-state.json"),
      JSON.stringify({ lastChecked: Date.now(), latestVersion: "0.0.0" }),
    );
    const isolated = buildIsolatedCliEnv({
      overrides: {
        BAILIAN_CONFIG_DIR: directory,
        DASHSCOPE_OUTPUT: undefined,
        DASHSCOPE_VERBOSE: "0",
        DASHSCOPE_QUIET: "0",
        DO_NOT_TRACK: "1",
        BAILIAN_INSTALL_METHOD: "brew",
      },
    });
    const command = defineCommand({
      auth: "none",
      description: { "en-US": "Diagnostic fixture", "zh-CN": "诊断夹具" },
      verboseFlags: ["trace"],
      flags: {
        trace: { type: "switch", description: { "en-US": "Trace fixture", "zh-CN": "追踪夹具" } },
      },
      async run(context) {
        context.output.debug({
          code: "FIXTURE_TRACE",
          message: { "en-US": "Fixture trace", "zh-CN": "夹具追踪" },
          details: { fixture: true },
        });
        context.output.result(
          { verbose: context.settings.verbose },
          { text: `verbose: ${context.settings.verbose}` },
        );
      },
    });
    const args = [
      "fixture",
      "--output",
      format,
      ...(quiet ? ["--quiet"] : []),
      ...(verbose ? ["--verbose"] : []),
      ...(trace ? ["--trace"] : []),
    ];
    try {
      const result = await runInProcess(
        () => {
          Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: false });
          return createCli(
            { fixture: command },
            { binName: "bl", version: "0.0.0", clientName: "fixture", npmPackage: "fixture" },
          ).run(args);
        },
        args,
        { env: isolated.env },
      );
      expect(result.exitCode, result.stderr).toBe(0);
      if (format === "json")
        expect(JSON.parse(result.stdout)).toEqual({ verbose: verbose || trace });
      else expect(result.stdout).toBe(`verbose: ${verbose || trace}\n`);
      if (verbose || trace) {
        if (format === "json")
          expect(JSON.parse(result.stderr)).toMatchObject({ debug: { code: "FIXTURE_TRACE" } });
        else expect(result.stderr).toContain("Fixture trace");
      } else expect(result.stderr).toBe("");
    } finally {
      isolated.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

const interactiveCases = [
  { tty: true, expected: "text" },
  { tty: false, expected: "json" },
  { tty: true, profile: "json", expected: "json" },
  { tty: true, profile: "text", expected: "text" },
  { tty: false, profile: "text", expected: "text" },
  { tty: true, env: "json", expected: "json" },
  { tty: true, flag: "json", expected: "json" },
];
test.each(interactiveCases)(
  "native interactive fallback preserves explicit output selection %j",
  async (scenario) => {
    const directory = await mkdtemp(join(tmpdir(), "output-interactive-default-"));
    await writeFile(
      join(directory, "config.json"),
      JSON.stringify({ language: "en-US", output: scenario.profile }),
    );
    await writeFile(
      join(directory, "update-state.json"),
      JSON.stringify({ lastChecked: Date.now(), latestVersion: "0.0.0" }),
    );
    const isolated = buildIsolatedCliEnv({
      overrides: {
        BAILIAN_CONFIG_DIR: directory,
        DASHSCOPE_OUTPUT: scenario.env,
        DASHSCOPE_VERBOSE: "0",
        DASHSCOPE_QUIET: "0",
        DO_NOT_TRACK: "1",
        BAILIAN_INSTALL_METHOD: "brew",
      },
    });
    const descriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: scenario.tty });
    const command = defineCommand({
      auth: "none",
      description: { "en-US": "Interactive fixture", "zh-CN": "交互夹具" },
      defaultOutput: "json",
      defaultInteractiveOutput: "text",
      async run(context) {
        context.output.result(
          { format: context.settings.output },
          { text: `format: ${context.settings.output}` },
        );
      },
    });
    const args = ["fixture", "--quiet", ...(scenario.flag ? ["--output", scenario.flag] : [])];
    try {
      const result = await runInProcess(
        () => {
          Object.defineProperty(process.stdout, "isTTY", {
            configurable: true,
            value: scenario.tty,
          });
          return createCli(
            { fixture: command },
            { binName: "bl", version: "0.0.0", clientName: "fixture", npmPackage: "fixture" },
          ).run(args);
        },
        args,
        { env: isolated.env },
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stderr).toBe("");
      if (scenario.expected === "json")
        expect(JSON.parse(result.stdout)).toEqual({ format: "json" });
      else expect(result.stdout).toBe("format: text\n");
    } finally {
      if (descriptor) Object.defineProperty(process.stdout, "isTTY", descriptor);
      else Reflect.deleteProperty(process.stdout, "isTTY");
      isolated.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
