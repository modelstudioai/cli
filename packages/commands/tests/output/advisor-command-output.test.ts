import { afterEach, expect, test, vi } from "vite-plus/test";
const engine = vi.hoisted(() => ({ recommend: vi.fn(), agent: vi.fn() }));
vi.mock("bailian-cli-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("bailian-cli-core")>()),
  recommendEngine: engine.recommend,
  agentLoop: engine.agent,
  maybeSyncWikiData: async () => {},
}));
import { buildSettings, type LocalizedText } from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import command from "../../src/commands/advisor/recommend.ts";
const success = {
  type: "result",
  recommendations: [{ model: "fixture", name: "Fixture", reason: "A reason", highlights: [] }],
  candidatePool: 0,
  intent: { taskSummary: "fixture" },
  degradations: [
    { stage: "explain", kind: "network", fallback: "template", message: "original server message" },
  ],
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
async function invoke(
  quiet: boolean,
  verbose: boolean,
  output: "text" | "json" = "json",
  flags: Record<string, unknown> = {},
) {
  let stdout = "",
    stderr = "",
    stray = "";
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stray += String(chunk);
    return true;
  });
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stray += String(chunk);
    return true;
  });
  const settings = buildSettings({ flags: { output, quiet, verbose }, file: {}, env: {} });
  const localize = (message: LocalizedText) =>
    typeof message === "string" ? message : message["en-US"];
  const reporter = createOutputReporter({
    settings,
    localize,
    stdout: {
      write: (chunk) => {
        stdout += chunk;
      },
    },
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      },
    },
  });
  const resultSpy = vi.spyOn(reporter.output, "result");
  let error: unknown;
  try {
    await command.run({
      flags: { message: "fixture", noAgent: true, ...flags },
      settings,
      localize,
      output: reporter.output,
      client: {
        baseUrl: "https://fixture.invalid",
        exportApiCredential: () => ({ token: "sk-fixture" }),
      },
    } as never);
  } catch (caught) {
    error = caught;
  }
  stderrSpy.mockRestore();
  stdoutSpy.mockRestore();
  return { stdout, stderr, stray, count: resultSpy.mock.calls.length, error };
}
test.each([false, true])("advisor retains schema and warning in quiet=%s", async (quiet) => {
  engine.recommend.mockResolvedValue(success);
  const result = await invoke(quiet, false);
  expect(result.error).toBeUndefined();
  expect(result.stray).toBe("");
  expect(result.count).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({
    result: { type: "single", recommendations: [{ model: "fixture" }] },
    candidates: 0,
  });
  expect(JSON.parse(result.stderr)).toMatchObject({ warning: { code: "ADVISOR_DEGRADED" } });
});
test("advisor double clarification still returns one valid JSON result", async () => {
  engine.recommend.mockResolvedValue({
    type: "need_clarify",
    question: "Which task?",
    options: ["write"],
    defaultIfSkip: "write",
  });
  const result = await invoke(true, false);
  expect(result.error).toBeUndefined();
  expect(result.stray).toBe("");
  expect(result.count).toBe(1);
  expect(JSON.parse(result.stdout)).toEqual({ recommendations: [] });
  expect(JSON.parse(result.stderr)).toMatchObject({ warning: { code: "ADVISOR_AMBIGUOUS" } });
});
test("advisor text keeps recommendation layout", async () => {
  engine.recommend.mockResolvedValue({ ...success, degradations: [] });
  const result = await invoke(true, false, "text");
  expect(result.stray).toBe("");
  expect(result.count).toBe(1);
  expect(result.stdout).toBe("#1 Fixture (fixture)\n  Why: A reason\n\n");
});
test("advisor default is metadata fallback so explicit Profile text can win", () => {
  expect(command.defaultOutput).toBe("json");
  expect(command.defaultInteractiveOutput).toBe("text");
  expect(command.defaultOutputOverridesProfile).not.toBe(true);
});

test("quiet verbose advisor traces use JSONL and omit the raw prompt", async () => {
  engine.recommend.mockImplementation(async (_message, dependencies) => {
    dependencies.onTrace({
      timestamp: "fixture",
      input: "private raw prompt",
      performance: { llmCalls: 0 },
      degradations: [],
      routingReason: "fixture-route",
    });
    return { ...success, degradations: [] };
  });
  const result = await invoke(true, true);
  expect(result.error).toBeUndefined();
  expect(result.stray).toBe("");
  expect(result.count).toBe(1);
  expect(JSON.parse(result.stderr)).toMatchObject({
    debug: {
      code: "ADVISOR_TRACE",
      details: { routingReason: "fixture-route", performance: { llmCalls: 0 } },
    },
  });
  expect(result.stderr).not.toContain("private raw prompt");
});

test("TTY advisor JSON rejects native prompts before engine side effects", async () => {
  vi.spyOn(process, "stdin", "get").mockReturnValue({ isTTY: true } as never);
  const result = await invoke(true, false, "json", { noAgent: false });
  expect(result.error).toMatchObject({ exitCode: 2 });
  expect(result.stdout + result.stray).toBe("");
  expect(result.count).toBe(0);
  expect(engine.recommend).not.toHaveBeenCalled();
  expect(engine.agent).not.toHaveBeenCalled();
});
