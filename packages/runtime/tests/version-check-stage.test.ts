import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

const updateMocks = vi.hoisted(() => ({
  checkForUpdate: vi.fn(),
  getPendingUpdateNotification: vi.fn(),
  performAutoUpdate: vi.fn(),
  shouldAutoUpdate: vi.fn(),
}));

vi.mock("../src/utils/update-checker.ts", () => updateMocks);

import { versionCheckStage, type RunContext } from "../src/middleware.ts";

function makeContext(): RunContext {
  return {
    identity: {
      binName: "bl",
      version: "1.24.0",
      clientName: "bailian-cli-test",
      npmPackage: "bailian-cli",
    },
    path: ["auth", "login"],
    command: { auth: "none", description: "Test command", async run() {} },
    settings: { quiet: false },
  } as unknown as RunContext;
}

beforeEach(() => {
  vi.stubEnv("NO_UPDATE_NOTIFIER", undefined);
  updateMocks.checkForUpdate.mockResolvedValue(undefined);
  updateMocks.getPendingUpdateNotification.mockReturnValue("2.2.1");
  updateMocks.shouldAutoUpdate.mockReturnValue(true);
  updateMocks.performAutoUpdate.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

test("NO_UPDATE_NOTIFIER=1 skips update checks and installation while running the command", async () => {
  vi.stubEnv("NO_UPDATE_NOTIFIER", "1");
  const next = vi.fn(async () => {});

  await versionCheckStage(makeContext(), next);

  expect(next).toHaveBeenCalledOnce();
  expect(updateMocks.checkForUpdate).not.toHaveBeenCalled();
  expect(updateMocks.getPendingUpdateNotification).not.toHaveBeenCalled();
  expect(updateMocks.shouldAutoUpdate).not.toHaveBeenCalled();
  expect(updateMocks.performAutoUpdate).not.toHaveBeenCalled();
});

test.each([undefined, "0"])(
  "normal update behavior is preserved when the opt-out is %s",
  async (envValue) => {
    vi.stubEnv("NO_UPDATE_NOTIFIER", envValue);
    const next = vi.fn(async () => {});

    await versionCheckStage(makeContext(), next);

    expect(next).toHaveBeenCalledOnce();
    expect(updateMocks.checkForUpdate).toHaveBeenCalledWith(
      "1.24.0",
      "bailian-cli",
      "bailian-cli-test",
    );
    expect(updateMocks.performAutoUpdate).toHaveBeenCalledWith(
      "1.24.0",
      "2.2.1",
      "bailian-cli",
      "bailian-cli-test",
    );
  },
);

test.each([undefined, "1"])(
  "command errors propagate unchanged when the opt-out is %s",
  async (envValue) => {
    vi.stubEnv("NO_UPDATE_NOTIFIER", envValue);
    const commandError = new Error("command failed");
    const next = vi.fn(async () => {
      throw commandError;
    });

    await expect(versionCheckStage(makeContext(), next)).rejects.toBe(commandError);

    expect(next).toHaveBeenCalledOnce();
    expect(updateMocks.performAutoUpdate).not.toHaveBeenCalled();
  },
);
