import { describe, expect, test } from "vite-plus/test";
import { BailianError, ExitCode } from "bailian-cli-core";
import { MCP_WEBSEARCH_PAGE } from "bailian-cli-runtime";
import {
  isWebSearchMcpNotActivated,
  rethrowWithWebSearchActivateHint,
  webSearchActivateHint,
} from "../src/commands/search/web-activate-hint.ts";

describe("web-activate-hint", () => {
  test("识别 404 + 未开通 / MCP不存在 / MCP_IS_INVALID", () => {
    expect(
      isWebSearchMcpNotActivated(
        new BailianError("MCP request failed: 404 Not Found - MCP不存在或未开通"),
      ),
    ).toBe(true);
    expect(
      isWebSearchMcpNotActivated(new BailianError("MCP request failed: 404  - MCP不存在或未开通")),
    ).toBe(true);
    expect(
      isWebSearchMcpNotActivated(
        new BailianError("MCP request failed: 404 Not Found - MCP_IS_INVALID"),
      ),
    ).toBe(true);
  });

  test("裸 404 或非 MCP 错误不加开通判定", () => {
    expect(isWebSearchMcpNotActivated(new BailianError("MCP request failed: 404 Not Found"))).toBe(
      false,
    );
    expect(
      isWebSearchMcpNotActivated(new BailianError("MCP request failed: 405 Method Not Allowed")),
    ).toBe(false);
    expect(isWebSearchMcpNotActivated(new Error("MCP不存在或未开通"))).toBe(false);
  });

  test("hint 含 MCP 广场 WebSearch 深链", () => {
    expect(webSearchActivateHint()).toContain(MCP_WEBSEARCH_PAGE);
    expect(webSearchActivateHint()).toMatch(/Activate|re-activate/i);
  });

  test("rethrow 保留原 message，补 Hint", () => {
    const original = new BailianError(
      "MCP request failed: 404 Not Found - MCP不存在或未开通",
      ExitCode.GENERAL,
    );
    try {
      rethrowWithWebSearchActivateHint(original);
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BailianError);
      const wrapped = error as BailianError;
      expect(wrapped.message).toBe(original.message);
      expect(wrapped.exitCode).toBe(ExitCode.GENERAL);
      expect(wrapped.hint).toContain(MCP_WEBSEARCH_PAGE);
      expect(wrapped.cause).toBe(original);
    }
  });

  test("已有 hint 或非未开通错误原样抛出", () => {
    const withHint = new BailianError(
      "MCP request failed: 404 Not Found - MCP不存在或未开通",
      ExitCode.GENERAL,
      "already hinted",
    );
    try {
      rethrowWithWebSearchActivateHint(withHint);
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBe(withHint);
    }

    const other = new BailianError("MCP request failed: 401 Unauthorized");
    try {
      rethrowWithWebSearchActivateHint(other);
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBe(other);
    }
  });
});
