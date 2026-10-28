import { beforeEach, expect, test, vi } from "vite-plus/test";
const updates = vi.hoisted(() => ({
  perform: vi.fn(async () => true),
  pending: vi.fn(() => "2.0.0"),
  automatic: vi.fn(() => true),
}));
vi.mock("../src/utils/update-checker.ts", () => ({
  checkForUpdate: async () => {},
  getPendingUpdateNotification: updates.pending,
  shouldAutoUpdate: updates.automatic,
  performAutoUpdate: updates.perform,
}));
import { versionCheckStage, type RunContext } from "../src/middleware.ts";
import { createOutputReporter } from "../src/output/reporter.ts";
import { createTranslator } from "../src/i18n.ts";

beforeEach(() => {
  updates.perform.mockClear();
  updates.pending.mockReturnValue("2.0.0");
  updates.automatic.mockReturnValue(true);
});

test.each([false, true])("quiet=%s does not change auto-update execution", async (quiet) => {
  const settings = { output: "json" as const, quiet, verbose: false };
  const output = createOutputReporter({ settings }).output;
  const context = {
    settings,
    output,
    path: ["probe"],
    identity: {
      version: "1.0.0",
      npmPackage: "test-cli",
      clientName: "test-cli",
      binName: "test-cli",
    },
  } as unknown as RunContext;
  const next = vi.fn(async () => {});
  await versionCheckStage(context, next);
  expect(next).toHaveBeenCalledOnce();
  expect(updates.perform).toHaveBeenCalledOnce();
  expect(updates.perform).toHaveBeenCalledWith("1.0.0", "2.0.0", "test-cli", "test-cli", {
    output,
    binName: "test-cli",
  });
});

const notificationCases = (["text", "json"] as const).flatMap((format) =>
  [false, true].flatMap((quiet) =>
    (["en-US", "zh-CN"] as const).map((language) => ({ format, quiet, language })),
  ),
);

test.each(notificationCases)(
  "update warning is visible with $format quiet=$quiet language=$language",
  async ({ format, quiet, language }) => {
    updates.pending.mockReturnValue("2.6.1");
    updates.automatic.mockReturnValue(false);
    let stdout = "";
    let stderr = "";
    const settings = { output: format, quiet, verbose: false };
    const output = createOutputReporter({
      settings,
      localize: (message) => createTranslator(language).localize(message),
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
    }).output;
    const context = {
      settings,
      output,
      path: ["probe"],
      identity: {
        version: "2.3.0",
        npmPackage: "knowledge-studio-cli",
        clientName: "knowledge-studio-cli",
        binName: "kscli",
      },
    } as unknown as RunContext;
    const next = vi.fn(async () => output.result({ ok: true }, { text: "OK" }));
    await versionCheckStage(context, next);
    expect(next).toHaveBeenCalledOnce();
    expect(updates.perform).not.toHaveBeenCalled();
    if (format === "json") {
      expect(JSON.parse(stdout)).toEqual({ ok: true });
      const records = stderr
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(records).toEqual([
        {
          warning: {
            code: "UPDATE_AVAILABLE",
            message: expect.stringContaining(
              language === "zh-CN" ? "发现新版本" : "Update available",
            ),
            details: {
              current_version: "2.3.0",
              latest_version: "2.6.1",
              upgrade_command: "kscli update",
            },
          },
        },
      ]);
    } else {
      expect(stdout).toBe("OK\n");
      expect(stderr).toContain(language === "zh-CN" ? "警告:" : "Warning:");
      expect(stderr).toContain("2.3.0 → 2.6.1");
      expect(stderr).toContain("kscli update");
    }
  },
);
