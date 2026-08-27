import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { defineCommand, ExitCode, type CommandRisk, type LocalizedText } from "bailian-cli-core";
import {
  ConfirmationRequiredError,
  confirmDangerousAction,
  confirmationFlagDefs,
} from "../src/confirm.ts";
import { confirmationStage, type RunContext } from "../src/middleware.ts";

const readlineMocks = vi.hoisted(() => {
  const question = vi.fn(async () => "y");
  const close = vi.fn();
  return {
    question,
    close,
    createInterface: vi.fn(() => ({ question, close })),
  };
});

vi.mock("node:readline/promises", () => ({ createInterface: readlineMocks.createInterface }));

const originalIsTTY = process.stdin.isTTY;

afterEach(() => {
  process.stdin.isTTY = originalIsTTY;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const HIGH_RISK_MESSAGE = {
  "en-US": "This permanently deletes the document and its chunks.",
  "zh-CN": "该操作会永久删除文档及其 Chunk，且无法撤销。",
} satisfies LocalizedText;

function makeContext(options: {
  risk?: CommandRisk;
  confirmed?: boolean;
  dryRun?: boolean;
}): RunContext {
  const command = defineCommand({
    description: "Delete a document",
    auth: "none",
    risk: options.risk,
    async run() {},
  });
  return {
    identity: {
      binName: "bl",
      version: "0.0.0-test",
      clientName: "bailian-cli-test",
      npmPackage: "bailian-cli",
    },
    path: ["knowledge", "doc", "delete"],
    command,
    flags: {},
    confirmed: options.confirmed ?? false,
    localize: (text: LocalizedText) => (typeof text === "string" ? text : text["zh-CN"]),
    settings: { dryRun: options.dryRun ?? false } as RunContext["settings"],
  } as unknown as RunContext;
}

describe("confirmation metadata", () => {
  test("injects --yes only for high-risk commands", () => {
    expect(
      confirmationFlagDefs({ risk: { level: "high", message: HIGH_RISK_MESSAGE } }),
    ).toHaveProperty("yes");
    expect(confirmationFlagDefs({})).toEqual({});
  });

  test("serializes the stable Agent-readable confirmation contract", () => {
    const error = new ConfirmationRequiredError({
      message: HIGH_RISK_MESSAGE["zh-CN"],
      hint: "此命令将执行高风险操作。如确认继续，请在原命令中添加 --yes 后重新执行。",
    });

    expect(error.exitCode).toBe(ExitCode.CONFIRMATION_REQUIRED);
    expect(error.toJSON()).toEqual({
      error: {
        code: 7,
        type: "requires_confirmation",
        message: HIGH_RISK_MESSAGE["zh-CN"],
        hint: "此命令将执行高风险操作。如确认继续，请在原命令中添加 --yes 后重新执行。",
      },
    });
  });

  test("legacy commands fail closed without opening a TTY prompt", async () => {
    process.stdin.isTTY = false;
    await expect(confirmDangerousAction("legacy summary", false)).rejects.toMatchObject({
      exitCode: ExitCode.USAGE,
    });
    await expect(confirmDangerousAction("legacy summary", true)).resolves.toBeUndefined();
  });

  test("legacy commands retain their existing TTY confirmation during migration", async () => {
    process.stdin.isTTY = true;
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await expect(confirmDangerousAction("legacy summary", false)).resolves.toBeUndefined();

    expect(stderrWrite).toHaveBeenCalledWith("legacy summary\n");
    expect(readlineMocks.createInterface).toHaveBeenCalledOnce();
    expect(readlineMocks.question).toHaveBeenCalledWith("Proceed? [y/N] ");
    expect(readlineMocks.close).toHaveBeenCalledOnce();
  });
});

describe("confirmationStage", () => {
  test("blocks high-risk execution without echoing the original command", async () => {
    const next = vi.fn(async () => {});

    const promise = confirmationStage(
      makeContext({ risk: { level: "high", message: HIGH_RISK_MESSAGE } }),
      next,
    );
    await expect(promise).rejects.toMatchObject({
      exitCode: 7,
      message: HIGH_RISK_MESSAGE["zh-CN"],
      hint: "此命令将执行高风险操作。如确认继续，请在原命令中添加 --yes 后重新执行。",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test.each([
    ["explicit --yes", { risk: { level: "high", message: HIGH_RISK_MESSAGE }, confirmed: true }],
    ["dry-run", { risk: { level: "high", message: HIGH_RISK_MESSAGE }, dryRun: true }],
    ["normal command", {}],
  ] as const)("passes %s through", async (_label, options) => {
    const next = vi.fn(async () => {});
    await confirmationStage(makeContext(options), next);
    expect(next).toHaveBeenCalledOnce();
  });
});
