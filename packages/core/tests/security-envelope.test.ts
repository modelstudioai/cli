import { expect, test } from "vite-plus/test";
import { parseSecurityBody } from "../src/client/security.ts";
import { BailianError } from "../src/errors/base.ts";
import { ExitCode } from "../src/errors/codes.ts";

// The backend serves Agent Security Center through the Zelda "DataV2" double
// envelope; the business payload lives at data.DataV2.data.data and the
// detection cards are camelCase. parseSecurityBody must unwrap it, still accept
// the legacy flat envelope, and turn failures into BailianError with the right
// exit code.

function dataV2Envelope(payload: unknown): string {
  return JSON.stringify({
    code: "200",
    successResponse: true,
    requestId: "req-1",
    data: {
      success: true,
      errorCode: "",
      errorMsg: "",
      DataV2: {
        ret: ["SUCCESS::接口调用成功"],
        data: { success: true, failed: false, data: payload },
      },
    },
  });
}

function catchError(run: () => unknown): BailianError {
  try {
    run();
  } catch (error) {
    return error as BailianError;
  }
  throw new Error("expected parseSecurityBody to throw");
}

test("unwraps the DataV2 double-envelope to the camelCase payload", () => {
  const payload = {
    contentSafety: { hit: 4, scanned: 253055 },
    fileScan: { hit: 52, scanned: 579 },
    skillScan: { hit: 2, scanned: 37 },
    capabilities: [{ key: "agent_identity", enabled: true }],
    protection: [
      { key: "flow_agent", enabled: true, count: 1656 },
      { key: "external_agent", enabled: false },
    ],
  };
  expect(parseSecurityBody<typeof payload>(dataV2Envelope(payload))).toEqual(payload);
});

test("returns a bare payload (no envelope) as the REST endpoint sends", () => {
  const bare = JSON.stringify({
    capabilities: [{ key: "agent_identity", enabled: true, count: null }],
    protection: [{ key: "flow_agent", enabled: true, count: 1656 }],
    content_safety: { hit: 4, scanned: 253561 },
    file_scan: { hit: 52, scanned: 579 },
    skill_scan: { hit: 2, scanned: 37 },
  });
  const result = parseSecurityBody<Record<string, unknown>>(bare);
  expect(result?.content_safety).toEqual({ hit: 4, scanned: 253561 });
  expect(result?.protection).toEqual([{ key: "flow_agent", enabled: true, count: 1656 }]);
});

test("still accepts the legacy flat envelope", () => {
  expect(parseSecurityBody<{ a: number }>('{"success":true,"data":{"a":1}}')).toEqual({ a: 1 });
});

test("success with a null payload returns null, not an error", () => {
  expect(parseSecurityBody(dataV2Envelope(null))).toBeNull();
});

test("maps legacy 12000092 to the AUTH exit code", () => {
  const error = catchError(() =>
    parseSecurityBody('{"success":false,"errorCode":"12000092","errorMsg":"no permission"}'),
  );
  expect(error.exitCode).toBe(ExitCode.AUTH);
  expect(error.message).toContain("12000092");
});

test("surfaces a DataV2 failure errorCode as a GENERAL error", () => {
  const body = JSON.stringify({
    code: "500",
    successResponse: false,
    data: {
      success: false,
      errorCode: "12000093",
      errorMsg: "service down",
      DataV2: { ret: ["FAIL::boom"], data: { success: false, failed: true } },
    },
  });
  const error = catchError(() => parseSecurityBody(body));
  expect(error.exitCode).toBe(ExitCode.GENERAL);
  expect(error.message).toContain("12000093");
});

test("rejects a non-JSON body with the content type", () => {
  const error = catchError(() => parseSecurityBody("<html>gateway</html>", "text/html"));
  expect(error.message).toContain("non-JSON");
});
