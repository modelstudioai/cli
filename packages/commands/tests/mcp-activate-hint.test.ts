import { describe, expect, test } from "vite-plus/test";
import { BailianError, ExitCode } from "bailian-cli-core";
import { mcpMarketplaceDetailPage } from "bailian-cli-runtime";
import {
  isMcpNotActivated,
  mcpActivateHint,
  rethrowWithMcpActivateHint,
} from "../src/commands/mcp/activate-hint.ts";

describe("mcp-activate-hint", () => {
  test("识别 404 + 未开通 / MCP不存在 / MCP_IS_INVALID", () => {
    expect(
      isMcpNotActivated(new BailianError("MCP request failed: 404 Not Found - MCP不存在或未开通")),
    ).toBe(true);
    expect(
      isMcpNotActivated(new BailianError("MCP request failed: 404  - MCP不存在或未开通")),
    ).toBe(true);
    expect(
      isMcpNotActivated(new BailianError("MCP request failed: 404 Not Found - MCP_IS_INVALID")),
    ).toBe(true);
  });

  test("裸 404 或非 MCP 错误不加开通判定", () => {
    expect(isMcpNotActivated(new BailianError("MCP request failed: 404 Not Found"))).toBe(false);
    expect(isMcpNotActivated(new BailianError("MCP request failed: 405 Method Not Allowed"))).toBe(
      false,
    );
    expect(isMcpNotActivated(new Error("MCP不存在或未开通"))).toBe(false);
    // Nested wrapper phrase must not match (anchored at start).
    expect(
      isMcpNotActivated(
        new BailianError("MCP error (-32000): MCP request failed: 404 Not Found - 未开通"),
      ),
    ).toBe(false);
  });

  test("hint 含对应 server 的 MCP 广场深链", () => {
    const serverCode = "market-cmapi00073529";
    expect(mcpActivateHint(serverCode)).toContain(mcpMarketplaceDetailPage(serverCode));
    expect(mcpActivateHint(serverCode)).toMatch(/Activate|re-activate/i);
  });

  test("WebSearch hint 含 SSE 升级说明", () => {
    expect(mcpActivateHint("WebSearch")).toMatch(/SSE|Streamable HTTP/i);
  });

  test("WebSearch + 405 streamableHttp 补重开通 hint", () => {
    const original = new BailianError(
      "MCP request failed: 405 Method Not Allowed - current mcp not support streamableHttp",
      ExitCode.GENERAL,
    );
    try {
      rethrowWithMcpActivateHint(original, "WebSearch");
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BailianError);
      const wrapped = error as BailianError;
      expect(wrapped.message).toBe(original.message);
      expect(wrapped.hint).toMatch(/SSE|Streamable HTTP|Activate|re-activate/i);
      expect(wrapped.hint).toContain(mcpMarketplaceDetailPage("WebSearch"));
    }
  });

  test("非 WebSearch 的 405 streamableHttp 不补 hint（由 fallback 处理）", () => {
    const original = new BailianError(
      "MCP request failed: 405 Method Not Allowed - current mcp not support streamableHttp",
      ExitCode.GENERAL,
    );
    try {
      rethrowWithMcpActivateHint(original, "WebParser");
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBe(original);
    }
  });

  test("rethrow 保留原 message，补 hint", () => {
    const serverCode = "market-cmapi00073529";
    const original = new BailianError(
      "MCP request failed: 404 Not Found - MCP不存在或未开通",
      ExitCode.GENERAL,
    );
    try {
      rethrowWithMcpActivateHint(original, serverCode);
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BailianError);
      const wrapped = error as BailianError;
      expect(wrapped.message).toBe(original.message);
      expect(wrapped.exitCode).toBe(ExitCode.GENERAL);
      expect(wrapped.hint).toContain(mcpMarketplaceDetailPage(serverCode));
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
      rethrowWithMcpActivateHint(withHint, "WebSearch");
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBe(withHint);
    }

    const other = new BailianError("MCP request failed: 401 Unauthorized");
    try {
      rethrowWithMcpActivateHint(other, "WebSearch");
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBe(other);
    }
  });
});
