import { afterEach, describe, expect, test } from "vite-plus/test";
import { ExitCode } from "bailian-cli-core";
import { confirmDangerousAction } from "../src/confirm.ts";

const originalIsTTY = process.stdin.isTTY;
afterEach(() => {
  process.stdin.isTTY = originalIsTTY;
});

describe("confirmDangerousAction", () => {
  test("--yes 时直接通过,不触碰 stdin", async () => {
    await expect(confirmDangerousAction("Delete kb idx-1", true)).resolves.toBeUndefined();
  });

  test("非 TTY 且无 --yes 时抛 USAGE 并引导 --yes", async () => {
    process.stdin.isTTY = false;
    try {
      await confirmDangerousAction("Delete kb idx-1", false);
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as { exitCode: number }).exitCode).toBe(ExitCode.USAGE);
      expect((error as { hint?: string }).hint).toMatch(/--yes/);
    }
  });
});
