import { UserError } from "@openagentpack/sdk";
import { BailianError, ExitCode } from "bailian-cli-core";
import { expect, test } from "vite-plus/test";
import { withAgentErrors } from "../src/commands/managed-agent/_engine/errors.ts";

/**
 * Structural stand-in for the SDK's internal `ApiError` (not exported by the
 * installed SDK version): withAgentErrors matches on statusCode/responseBody
 * fields, so any Error carrying them must map through mapApiError.
 */
class FakeSdkApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly responseBody: string,
  ) {
    super(`Bailian API ${statusCode}: ${responseBody}`);
  }
}

async function catchMapped(error: unknown): Promise<BailianError> {
  try {
    await withAgentErrors(() => Promise.reject(error));
  } catch (mapped) {
    expect(mapped).toBeInstanceOf(BailianError);
    return mapped as BailianError;
  }
  throw new Error("expected withAgentErrors to throw");
}

test("BailianError passes through untouched", async () => {
  const original = new BailianError("already mapped", ExitCode.AUTH);
  const mapped = await catchMapped(original);
  expect(mapped).toBe(original);
});

test("SDK UserError maps to USAGE", async () => {
  const mapped = await catchMapped(new UserError("bad agents.yaml"));
  expect(mapped.exitCode).toBe(ExitCode.USAGE);
  expect(mapped.message).toBe("bad agents.yaml");
});

test("SDK polling-timeout UserError maps to TIMEOUT (5), not USAGE", async () => {
  // 消息形状来自 SDK session-runtime 的 assertNotTimedOut —— 客户端等待超时，
  // 按 bl 错误边界必须归 TIMEOUT，不能告诉自动化调用方“参数错误”。
  const mapped = await catchMapped(
    new UserError("Session did not complete within the timeout (600 seconds)."),
  );
  expect(mapped.exitCode).toBe(ExitCode.TIMEOUT);
  expect(mapped.message).toBe("Session did not complete within the timeout (600 seconds).");
  expect(mapped.hint).toMatch(/session get/);
});

test("提及 timeout 但非轮询超时句式的 UserError 仍归 USAGE", async () => {
  const mapped = await catchMapped(new UserError("Invalid timeout value in agents.yaml"));
  expect(mapped.exitCode).toBe(ExitCode.USAGE);
});

test("SDK ApiError with DashScope-style JSON body surfaces clean message and api metadata", async () => {
  const body = JSON.stringify({
    code: "InvalidParameter",
    message: "agent name already exists",
    request_id: "req-123",
  });
  const mapped = await catchMapped(new FakeSdkApiError(400, body));
  expect(mapped.exitCode).toBe(ExitCode.GENERAL);
  expect(mapped.message).toBe("agent name already exists");
  expect(mapped.api).toEqual({
    httpStatus: 400,
    apiCode: "InvalidParameter",
    requestId: "req-123",
  });
});

test("SDK ApiError with OpenAI-style error envelope extracts message and type", async () => {
  const body = JSON.stringify({
    error: { message: "model does not exist", type: "invalid_request_error" },
    request_id: "req-456",
  });
  const mapped = await catchMapped(new FakeSdkApiError(404, body));
  expect(mapped.exitCode).toBe(ExitCode.GENERAL);
  expect(mapped.message).toBe("model does not exist");
  expect(mapped.api?.apiCode).toBe("invalid_request_error");
  expect(mapped.api?.requestId).toBe("req-456");
});

test("SDK ApiError with non-JSON body passes raw text through as message", async () => {
  const mapped = await catchMapped(new FakeSdkApiError(502, "Bad Gateway"));
  expect(mapped.exitCode).toBe(ExitCode.GENERAL);
  expect(mapped.message).toBe("Bad Gateway");
  expect(mapped.api?.httpStatus).toBe(502);
});

test("SDK ApiError with empty body falls back to HTTP status message", async () => {
  const mapped = await catchMapped(new FakeSdkApiError(503, ""));
  expect(mapped.message).toBe("HTTP 503");
  expect(mapped.api?.httpStatus).toBe(503);
});

test("plain Error maps to GENERAL with message passed through", async () => {
  const mapped = await catchMapped(new Error("boom"));
  expect(mapped.exitCode).toBe(ExitCode.GENERAL);
  expect(mapped.message).toBe("boom");
  expect(mapped.api).toBeUndefined();
});

test("fetch transport TypeError is rethrown untouched for the runtime NETWORK mapping", async () => {
  const transportError = new TypeError("fetch failed", {
    cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1"), {
      code: "ECONNREFUSED",
    }),
  });
  try {
    await withAgentErrors(() => Promise.reject(transportError));
    throw new Error("expected withAgentErrors to throw");
  } catch (error) {
    expect(error).toBe(transportError);
  }
});
