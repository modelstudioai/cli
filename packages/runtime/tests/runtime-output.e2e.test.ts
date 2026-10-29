import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { expect, test } from "vite-plus/test";
import { runNodeMain } from "e2e/runner";

const runtimeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const main = join(runtimeRoot, "tests/harness/output-main.ts");

async function invoke(
  args: string[],
  options: {
    output?: string;
    envOutput?: string;
    corrupt?: boolean;
    proxy?: string;
    verbose?: "0" | "1";
  } = {},
) {
  const configDir = mkdtempSync(join(tmpdir(), "bl-runtime-output-"));
  try {
    writeFileSync(
      join(configDir, "config.json"),
      options.corrupt
        ? "{invalid"
        : JSON.stringify({ language: "en-US", output: options.output ?? "text" }),
    );
    writeFileSync(
      join(configDir, "update-state.json"),
      JSON.stringify({ lastChecked: Date.now(), latestVersion: "0.0.0" }),
    );
    return await runNodeMain(main, args, {
      cwd: runtimeRoot,
      env: {
        BAILIAN_CONFIG_DIR: configDir,
        DASHSCOPE_OUTPUT: options.envOutput ?? "",
        DASHSCOPE_QUIET: "0",
        DASHSCOPE_VERBOSE: options.verbose ?? "0",
        CI: "1",
        HTTPS_PROXY: options.proxy ?? "",
        HTTP_PROXY: "",
        ALL_PROXY: "",
      },
    });
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
}

function diagnostics(stderr: string) {
  return stderr
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

test.each([[], ["--quiet"], ["--verbose"], ["--quiet", "--verbose"]].map((flags) => ({ flags })))(
  "ordinary errors are JSON with flags $flags",
  async ({ flags }) => {
    const result = await invoke(["fail", "--output", "json", ...flags]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const records = diagnostics(result.stderr);
    expect(records.filter((record) => record.error)).toEqual([
      { error: expect.objectContaining({ code: 1, message: "Invalid local JSON" }) },
    ]);
    expect(records.filter((record) => record.debug)).toHaveLength(
      flags.includes("--verbose") ? 1 : 0,
    );
  },
);

test("profile-selected JSON also formats ordinary errors", async () => {
  const result = await invoke(["fail"], { output: "json" });
  expect(result.exitCode).toBe(1);
  expect(diagnostics(result.stderr)[0].error.message).toBe("Invalid local JSON");
});

test.each(
  [
    ["unknown", "--output=json"],
    ["probe", "--bad", "--output", "json"],
  ].map((args) => ({ args })),
)("early parser errors honor supplied argv $args", async ({ args }) => {
  const result = await invoke(args);
  expect(result.exitCode).toBe(2);
  expect(diagnostics(result.stderr)[0].error.code).toBe(2);
});

test("corrupt configuration preserves defaults with a structured warning", async () => {
  const result = await invoke(["probe", "--output", "json"], { corrupt: true });
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ task_id: "task-demo" });
  expect(
    diagnostics(result.stderr).filter((line) => line.warning?.code === "CONFIG_CORRUPTED"),
  ).toHaveLength(1);
});

test("report, warning, debug and terminal error preserve separate channels", async () => {
  const result = await invoke([
    "fail",
    "--kind",
    "report",
    "--output=json",
    "--quiet",
    "--verbose",
  ]);
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stdout)).toEqual({ successful: ["task-demo"], failed: ["row-2"] });
  const lines = diagnostics(result.stderr);
  expect(lines.map((line) => Object.keys(line)[0])).toEqual(["warning", "debug", "error"]);
  expect(lines[2].error.request_id).toBe("request-demo");
});

test("network errors retain errno and network exit code", async () => {
  const result = await invoke(["fail", "--kind", "network", "--output=json"]);
  expect(result.exitCode).toBe(6);
  expect(diagnostics(result.stderr)[0].error.cause.code).toBe("ENOTFOUND");
});

test.each([false, true])(
  "transport failures with verbose=%s keep stderr JSON-only",
  async (verbose) => {
    const result = await invoke([
      "transport",
      "--api-key",
      "fake-api-secret",
      "--base-url",
      "https://example.invalid",
      "--output=json",
      "--quiet",
      ...(verbose ? ["--verbose"] : []),
    ]);
    expect(result.exitCode).toBe(1);
    const records = diagnostics(result.stderr);
    expect(records.map((record) => Object.keys(record)[0])).toEqual(
      verbose ? ["debug", "debug", "error"] : ["error"],
    );
    expect(records.at(-1).error.request_id).toBe("request-transport");
    expect(result.stderr).not.toContain("fake-api-secret");
    expect(result.stderr).not.toContain("fake-query-secret");
  },
);

test("invalid proxy initialization honors explicit JSON", async () => {
  const result = await invoke(["probe", "--output=json"], { proxy: "invalid-proxy" });
  expect(result.exitCode).toBe(2);
  expect(diagnostics(result.stderr)[0].error.message).toContain("proxy");
});

test("invalid profile selection honors explicit JSON", async () => {
  const result = await invoke(["probe", "--config", "api_key", "--output=json"]);
  expect(result.exitCode).toBe(2);
  expect(diagnostics(result.stderr)[0].error.code).toBe(2);
});

test("explicit text overrides profile-selected JSON on failure", async () => {
  const result = await invoke(["fail", "--output=text"], { output: "json" });
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Error: Invalid local JSON");
});

test("a closed stdout pipe still exits successfully after version dispatch", async () => {
  const configDir = mkdtempSync(join(tmpdir(), "bl-output-pipe-"));
  try {
    writeFileSync(join(configDir, "config.json"), "{}");
    const result = await new Promise<{ code: number; stderr: string }>((resolve) => {
      const child = execFile(
        process.execPath,
        ["--import", import.meta.resolve("tsx"), main, "--version"],
        {
          cwd: runtimeRoot,
          env: {
            ...process.env,
            BAILIAN_CONFIG_DIR: configDir,
            DO_NOT_TRACK: "1",
            NODE_NO_WARNINGS: "1",
            HTTP_PROXY: "",
            HTTPS_PROXY: "",
            ALL_PROXY: "",
          },
          encoding: "utf8",
        },
        (error, _stdout, stderr) => {
          resolve({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stderr });
        },
      );
      child.stdout?.destroy();
    });
    expect(result.code, result.stderr).toBe(0);
    expect(result.stderr).not.toContain("EPIPE");
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
});

test.each(["0", "1"] as const)(
  "DASHSCOPE_VERBOSE=%s controls error stack even with quiet",
  async (verbose) => {
    const result = await invoke(["fail", "--output=json", "--quiet"], { verbose });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const records = diagnostics(result.stderr);
    const stack = records.find((record) => record.debug?.code === "ERROR_STACK");
    if (verbose === "1") {
      expect(stack.debug.details.stack).toContain("SyntaxError: Invalid local JSON");
      expect(stack.debug.details.stack).toContain("output-main.ts");
    } else expect(stack).toBeUndefined();
    expect(records.at(-1).error.message).toBe("Invalid local JSON");
  },
);

test.each(["shared", "separate", "interrupt", "stdout-error"])(
  "concurrent CLI process handlers preserve JSON and cleanup (%s)",
  async (mode) => {
    const configDir = mkdtempSync(join(tmpdir(), "bl-process-handlers-"));
    try {
      writeFileSync(
        join(configDir, "config.json"),
        JSON.stringify({ telemetry: false, language: "en-US" }),
      );
      writeFileSync(
        join(configDir, "update-state.json"),
        JSON.stringify({ lastChecked: Date.now(), latestVersion: "0.0.0" }),
      );
      const result = await runNodeMain(
        join(runtimeRoot, "tests/harness/process-handlers-main.ts"),
        [mode],
        {
          cwd: runtimeRoot,
          env: {
            BAILIAN_CONFIG_DIR: configDir,
            DO_NOT_TRACK: "1",
            DASHSCOPE_OUTPUT: "",
            DASHSCOPE_QUIET: "0",
            DASHSCOPE_VERBOSE: "0",
            NODE_NO_WARNINGS: "",
            NODE_OPTIONS: "",
            HTTP_PROXY: "",
            HTTPS_PROXY: "",
            ALL_PROXY: "",
          },
        },
      );
      if (mode === "shared" || mode === "separate") {
        expect(result.exitCode, result.stderr).toBe(0);
        expect(result.stderr).toBe("");
        const { before, during, after } = JSON.parse(result.stdout);
        expect(during.interrupt - before.interrupt).toBe(1);
        expect(during.stdoutError - before.stdoutError).toBe(1);
        expect(after.interrupt).toBe(before.interrupt);
        // The stateless EPIPE guard must survive pending writes after run() returns.
        expect(after.stdoutError - before.stdoutError).toBe(1);
      } else {
        expect(result.exitCode, result.stderr).toBe(mode === "interrupt" ? 130 : 1);
        expect(result.stdout).toBe("");
        const records = diagnostics(result.stderr);
        expect(records).toHaveLength(1);
        expect(records[0].error.code).toBe(mode === "interrupt" ? 130 : 1);
        expect(records[0].error.message).toContain(
          mode === "interrupt" ? "Interrupted" : "Mock stdout error",
        );
      }
    } finally {
      rmSync(configDir, { recursive: true, force: true });
    }
  },
);

test.each([
  { flags: [], envOutput: "", expected: "json" },
  { flags: ["--output=text"], envOutput: "", expected: "text" },
  { flags: [], envOutput: "text", expected: "text" },
  { flags: ["--output=json"], envOutput: "text", expected: "json" },
])(
  "command default output resolves before reporter creation: %j",
  async ({ flags, envOutput, expected }) => {
    const result = await invoke(["defaultProbe", "--quiet", ...flags], {
      output: "text",
      envOutput,
    });
    expect(result.exitCode, result.stderr).toBe(0);
    if (expected === "json") {
      expect(JSON.parse(result.stdout)).toEqual({ task_id: "task-demo" });
      expect(diagnostics(result.stderr)).toEqual([
        { warning: { code: "SKIPPED", message: "Skipped" } },
      ]);
    } else {
      expect(result.stdout).toBe("task-demo\n");
      expect(result.stderr).toContain("Warning: Skipped");
    }
  },
);

test("command default output also controls terminal error rendering", async () => {
  const result = await invoke(["defaultFail", "--quiet"], { output: "text" });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(diagnostics(result.stderr)).toEqual([
    { error: expect.objectContaining({ code: 1, message: "Invalid local JSON" }) },
  ]);
});

test("command default JSON applies to the single queued corrupt-config warning", async () => {
  const result = await invoke(["defaultProbe", "--quiet"], { corrupt: true });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ task_id: "task-demo" });
  expect(diagnostics(result.stderr).map((record) => record.warning.code)).toEqual([
    "CONFIG_CORRUPTED",
    "SKIPPED",
  ]);
});

test.each([
  ["defaultValidate", "--quiet"],
  ["defaultProbe", "--bad", "--quiet"],
  ["defaultProbe", "--timeout=0", "--quiet"],
])("identified command formats early errors and queued warnings together: %j", async (...args) => {
  const result = await invoke(args, { corrupt: true });
  expect(result.exitCode).toBe(2);
  expect(result.stdout).toBe("");
  const records = diagnostics(result.stderr);
  expect(records).toHaveLength(2);
  expect(records[0].warning.code).toBe("CONFIG_CORRUPTED");
  expect(records[1].error.code).toBe(2);
});

test.each([
  ["unknown", "--output=json"],
  ["--bad", "--output=json"],
])("unidentified command preserves fallback JSON and queued warning: %j", async (...args) => {
  const result = await invoke(args, { corrupt: true });
  expect(result.exitCode).toBe(2);
  expect(result.stdout).toBe("");
  const records = diagnostics(result.stderr);
  expect(records).toHaveLength(2);
  expect(records[0].warning.code).toBe("CONFIG_CORRUPTED");
  expect(records[1].error.code).toBe(2);
});
