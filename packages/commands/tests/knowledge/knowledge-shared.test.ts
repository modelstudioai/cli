import { describe, expect, test } from "vite-plus/test";
import { ExitCode } from "bailian-cli-core";
import { resolveWorkspaceId, truncateLine } from "../../src/commands/knowledge/shared.ts";

const identity = { binName: "kscli" };

describe("resolveWorkspaceId", () => {
  test("flag 优先于 settings", () => {
    const workspaceId = resolveWorkspaceId({
      flags: { workspaceId: "ws_flag" },
      settings: { workspaceId: "ws_cfg" },
      identity,
    });
    expect(workspaceId).toBe("ws_flag");
  });

  test("无 flag 时回退 settings (env/config 已并入 settings)", () => {
    const workspaceId = resolveWorkspaceId({
      flags: {},
      settings: { workspaceId: "ws_cfg" },
      identity,
    });
    expect(workspaceId).toBe("ws_cfg");
  });

  test("均缺失时抛 USAGE 且 hint 含 binName", () => {
    try {
      resolveWorkspaceId({ flags: {}, settings: {}, identity });
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as { exitCode: number }).exitCode).toBe(ExitCode.USAGE);
      expect((error as { hint?: string }).hint).toMatch(/kscli config set workspace_id/);
    }
  });
});

describe("truncateLine", () => {
  test("非 TTY 下不截断", () => {
    const longLine = "x".repeat(500);
    expect(truncateLine(longLine)).toBe(longLine);
  });
});
