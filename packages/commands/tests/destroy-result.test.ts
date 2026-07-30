import { BailianError, ExitCode } from "bailian-cli-core";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

const sdkMocks = vi.hoisted(() => ({
  destroyPlannedProjectResources: vi.fn(),
  planDestroyProjectContext: vi.fn(),
}));

const configLoaderMocks = vi.hoisted(() => ({
  buildAgentRuntime: vi.fn(),
}));

vi.mock("@openagentpack/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@openagentpack/sdk")>();
  return { ...actual, ...sdkMocks };
});

vi.mock("../src/commands/managed-agent/_engine/config-loader.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/commands/managed-agent/_engine/config-loader.ts")>();
  return { ...actual, ...configLoaderMocks };
});

import destroyCommand from "../src/commands/managed-agent/destroy.ts";

const resources = [
  {
    address: { provider: "bailian", type: "agent", name: "assistant" },
    remote_id: "agent-ok",
  },
  {
    address: { provider: "bailian", type: "environment", name: "dev" },
    remote_id: "env-failed",
  },
];

let stdoutChunks: string[] = [];
let originalStdoutWrite: typeof process.stdout.write;
let originalStderrWrite: typeof process.stderr.write;

beforeEach(() => {
  stdoutChunks = [];
  originalStdoutWrite = process.stdout.write.bind(process.stdout);
  originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdoutChunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = (() => true) as typeof process.stderr.write;

  const planned = { resources, executionContext: {} };
  configLoaderMocks.buildAgentRuntime.mockResolvedValue({});
  sdkMocks.planDestroyProjectContext.mockReturnValue(planned);
  sdkMocks.destroyPlannedProjectResources.mockResolvedValue({
    ...planned,
    results: [
      { resource: resources[0], status: "success", reason: "destroyed" },
      {
        resource: resources[1],
        status: "failed",
        reason: "failed",
        error: "provider refused deletion",
      },
    ],
    destroyed: 1,
    partial: true,
  });
});

afterEach(() => {
  process.stdout.write = originalStdoutWrite;
  process.stderr.write = originalStderrWrite;
  vi.clearAllMocks();
});

test("destroy 部分失败时输出汇总并以首个原始错误抛 GENERAL", async () => {
  let thrown: unknown;
  try {
    await destroyCommand.run({
      settings: { output: "json", dryRun: false },
      flags: { yes: true },
    } as never);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(BailianError);
  const mapped = thrown as BailianError;
  expect(mapped.exitCode).toBe(ExitCode.GENERAL);
  expect(mapped.message).toBe("provider refused deletion");
  expect(JSON.parse(stdoutChunks.join(""))).toEqual({ destroyed: 1, total: 2 });
});
