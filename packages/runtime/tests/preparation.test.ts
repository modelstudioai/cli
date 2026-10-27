import { afterEach, expect, test, vi } from "vite-plus/test";
import { buildSources, type LocalizedText, type CommandRisk } from "bailian-cli-core";
import {
  compose,
  confirmationStage,
  runCommandStage,
  authStage,
  versionCheckStage,
  type RunContext,
} from "../src/middleware.ts";
import { checkForUpdate } from "../src/utils/update-checker.ts";
import { handleError } from "../src/error-handler.ts";

vi.mock("../src/utils/update-checker.ts", () => ({
  checkForUpdate: vi.fn(async () => {}),
  getPendingUpdateNotification: vi.fn(() => undefined),
  performAutoUpdate: vi.fn(),
  shouldAutoUpdate: vi.fn(),
}));

const risk = {
  level: "high",
  message: { "en-US": "Creates a billed resource", "zh-CN": "创建计费资源" },
} satisfies CommandRisk;
const notice = { code: "BILLING", message: risk.message };

function fixture(
  options: { dryRun?: boolean; confirmed?: boolean; actualRisk?: CommandRisk | null } = {},
) {
  const data = { indexId: "index-owned" };
  const prepare = vi.fn(async () => ({
    data,
    preview: { creates: ["index"] },
    risk: options.actualRisk === undefined ? risk : options.actualRisk,
    notices: [notice],
  }));
  const run = vi.fn(async () => {});
  const context = {
    command: { auth: "none", description: "fixture", risk, prepare, run },
    confirmed: options.confirmed ?? false,
    flags: {},
    settings: { dryRun: options.dryRun ?? false, output: "json", quiet: true },
    localize: (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]),
  } as unknown as RunContext;
  return { data, prepare, run, context };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

test("read-only plan is included in confirmation error before execution", async () => {
  const { context, prepare, run } = fixture();
  await expect(compose([confirmationStage, runCommandStage])(context)).rejects.toMatchObject({
    exitCode: 7,
  });
  expect(prepare).toHaveBeenCalledOnce();
  expect(run).not.toHaveBeenCalled();
  try {
    await runCommandStage(context, async () => {});
  } catch (error) {
    expect((error as { toJSON(): unknown }).toJSON()).toMatchObject({
      error: {
        type: "requires_confirmation",
        plan: { creates: ["index"] },
        notices: [{ code: "BILLING" }],
      },
    });
  }
});

test("dry-run returns the prepared preview and notices even when quiet, without executing", async () => {
  const output: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const { context, prepare, run } = fixture({ dryRun: true });
  await compose([confirmationStage, runCommandStage])(context);
  expect(prepare).toHaveBeenCalledOnce();
  expect(run).not.toHaveBeenCalled();
  expect(JSON.parse(output.join(""))).toMatchObject({
    plan: { creates: ["index"] },
    notices: [{ code: "BILLING" }],
  });
});

test.each([{ confirmed: true }, { actualRisk: null }])(
  "executes exactly the prepared data with %j",
  async (options) => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { context, data, prepare, run } = fixture(options);
    await compose([confirmationStage, runCommandStage])(context);
    expect(prepare).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ prepared: data }));
    expect(context.flags).not.toHaveProperty("yes");
  },
);

test("preparation failure does not run the command or replace the original error", async () => {
  const { context, prepare, run } = fixture({ confirmed: true });
  const serverError = new Error("server original error");
  prepare.mockRejectedValueOnce(serverError);
  await expect(runCommandStage(context, async () => {})).rejects.toBe(serverError);
  expect(run).not.toHaveBeenCalled();
});

test("planned dry-run requires real authentication before reading remote state", async () => {
  const { context } = fixture({ dryRun: true });
  context.command.auth = "apiKey";
  context.sources = { ...buildSources({}), env: {}, file: {}, flags: {} };
  Object.assign(context, {
    path: ["fixture"],
    identity: { binName: "fixture", version: "test", npmPackage: "fixture", clientName: "fixture" },
  });
  const next = vi.fn(async () => {});
  await expect(authStage(context, next)).rejects.toMatchObject({ exitCode: 3 });
  expect(next).not.toHaveBeenCalled();
});

test("planning never starts background update checks", async () => {
  const { context } = fixture({ dryRun: true });
  Object.assign(context, {
    identity: { version: "test", npmPackage: "fixture", clientName: "fixture" },
    path: ["fixture"],
  });
  vi.mocked(checkForUpdate).mockClear();
  const next = vi.fn(async () => {});
  await versionCheckStage(context, next);
  expect(next).toHaveBeenCalledOnce();
  expect(checkForUpdate).not.toHaveBeenCalled();
});

test("human confirmation output includes the actual plan and notices", async () => {
  vi.stubEnv("DASHSCOPE_OUTPUT", "text");
  const output: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
  vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("exit-confirmation");
  });
  const { context } = fixture();
  try {
    await runCommandStage(context, async () => {});
  } catch (error) {
    expect(() => handleError(error, "fixture")).toThrow("exit-confirmation");
  }
  expect(output.join("")).toContain("creates");
  expect(output.join("")).toContain("index");
  expect(output.join("")).toContain("BILLING");
});
