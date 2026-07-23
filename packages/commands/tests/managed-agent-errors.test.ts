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
