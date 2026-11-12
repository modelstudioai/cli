import { describe, expect, test } from "vite-plus/test";
import { unwrapConsoleResponse } from "../src/console/response.ts";
import { BailianError } from "../src/errors/base.ts";
import { ExitCode } from "../src/errors/codes.ts";

const envelope = (data: unknown) => ({
  code: "200",
  successResponse: true,
  requestId: "request-fixture",
  data: {
    success: true,
    DataV2: { ret: ["SUCCESS::ok"], data: { success: true, failed: false, data } },
  },
});

describe("typed Console response envelopes", () => {
  test("a missing transport ret does not hide result failure metadata", () => {
    expect(() =>
      unwrapConsoleResponse({
        DataV2: { data: { success: false, appName: "fixture-app", message: "original rejection" } },
      }),
    ).toThrow("original rejection");
  });
  test("a repeated transport ret cannot extend protocol handling into dataset state", () => {
    const dataset = { datasetId: "version-fixture", failed: true };
    const ret = ["SUCCESS::ok"];
    expect(unwrapConsoleResponse({ DataV2: { ret, data: { ret, data: dataset } } })).toBe(dataset);
  });
  test("honors the observed DataV2 failure even when transport ret says SUCCESS", () => {
    const response = {
      successResponse: true,
      requestId: "request-fixture",
      data: {
        success: true,
        DataV2: {
          ret: ["SUCCESS::ok"],
          data: {
            codeEnum: "Train.NotFound.Data",
            code: "10130404",
            success: false,
            appName: "fixture-app",
            __statusCode__: 404,
            message: "找不到相关数据",
          },
        },
      },
    };
    expect(() => unwrapConsoleResponse(response)).toThrow("找不到相关数据");
    try {
      unwrapConsoleResponse(response);
    } catch (error) {
      expect(error).toMatchObject({
        exitCode: ExitCode.GENERAL,
        api: { apiCode: "10130404", requestId: "request-fixture" },
      });
    }
  });
  test("unknown DataV2 metadata does not block unwrapping or consume business data", () => {
    const dataset = {
      datasetId: "version-fixture",
      success: false,
      errorCode: "Import.Failed",
      data: null,
    };
    const response = {
      data: {
        DataV2: {
          ret: ["SUCCESS::ok"],
          extraTransportMetadata: "fixture",
          data: { success: true, failed: false, appName: "fixture-app", data: dataset },
        },
      },
    };
    expect(unwrapConsoleResponse(response)).toBe(dataset);
  });
  test("unwraps the observed gateway transport metadata but preserves business pagination", () => {
    const page = {
      data: [{ workspaceId: "workspace-fixture", tenantId: "7654321" }],
      maxResults: 100,
      totalCount: 1,
    };
    // Sanitized shape from a live workspace list response; all identifiers are fixtures.
    const response = {
      code: "200",
      httpStatusCode: "200",
      requestId: "outer-request-fixture",
      successResponse: true,
      data: {
        success: true,
        httpStatus: 200,
        errorCode: "",
        errorMsg: "",
        api: "fixture.workspace.list",
        DataV2: {
          ret: ["SUCCESS::ok"],
          data: {
            code: "200",
            data: page,
            success: true,
            failed: false,
            requestId: "inner-request-fixture",
            httpStatusCode: 200,
          },
        },
      },
    };
    expect(unwrapConsoleResponse(response)).toBe(page);
  });
  test("checks a failure containing HTTP transport metadata before unwrapping", () => {
    const response = {
      data: {
        DataV2: {
          ret: ["SUCCESS::ok"],
          data: {
            code: "ReadDenied",
            data: null,
            success: false,
            failed: true,
            message: "original fixture rejection",
            requestId: "inner-request-fixture",
            httpStatusCode: 200,
          },
        },
      },
    };
    expect(() => unwrapConsoleResponse(response)).toThrow("original fixture rejection");
  });
  test("a business errorCode or data field does not make a dataset into another envelope", () => {
    const dataset = { datasetId: "version-fixture", errorCode: null, data: null };
    expect(unwrapConsoleResponse({ success: true, data: dataset })).toBe(dataset);
    const failedImport = {
      datasetId: "version-fixture",
      releaseStatus: 3,
      errorCode: "Import.Failed",
      data: null,
    };
    expect(unwrapConsoleResponse(envelope(failedImport))).toBe(failedImport);
  });
  test("successful inner diagnostics cannot replace the actual failed ret", () => {
    const response = {
      data: {
        DataV2: {
          ret: ["FAIL::denied"],
          data: { success: true, message: "ok", errorCode: "0", data: null },
        },
      },
    };
    expect(() => unwrapConsoleResponse(response)).toThrow("FAIL::denied (HTTP 200)");
  });
  test.each([null, false, 0, "", [], { value: 0 }].map((payload) => ({ payload })))(
    "preserves the exact payload $payload",
    ({ payload }) => {
      expect(unwrapConsoleResponse(envelope(payload))).toBe(payload);
    },
  );
  test("does not descend into a business data field or task errors", () => {
    const payload = {
      records: [],
      data: { success: false },
      datasetTaskDTO: { taskStatus: 10 },
      value: null,
    };
    expect(unwrapConsoleResponse(envelope(payload))).toBe(payload);
    expect(unwrapConsoleResponse(payload)).toBe(payload);
  });
  test.each([
    { data: { DataV2: { data: { data: { url: "https://example.test/file" } } } } },
    { data: { success: true, data: { url: "https://example.test/file" } } },
    { success: true, data: { url: "https://example.test/file" } },
    { code: "200", data: { url: "https://example.test/file" } },
  ])("accepts supported minimal and legacy envelopes", (response) => {
    expect(unwrapConsoleResponse(response)).toEqual({ url: "https://example.test/file" });
  });
  test.each([
    { success: false, errorCode: "Denied", errorMsg: "original denial" },
    { errorCode: "Denied", errorMsg: "original denial" },
    {
      successResponse: false,
      data: { errorCode: "Denied", errorMsg: "original denial", success: false },
    },
    { data: { success: false, errorCode: "Denied", message: "original denial" } },
    envelope({ success: false, code: "Denied", message: "original denial", data: null }),
  ])("retains service error text and GENERAL classification", (response) => {
    try {
      unwrapConsoleResponse(response);
      throw new Error("Expected service rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(BailianError);
      expect(error).toMatchObject({
        exitCode: ExitCode.GENERAL,
        message: expect.stringContaining("original denial"),
        api: { httpStatus: 200, apiCode: "Denied" },
      });
    }
  });
  test("mixed success/failure ret entries cannot become success", () => {
    expect(() =>
      unwrapConsoleResponse({
        data: { DataV2: { ret: ["SUCCESS::ok", "FAIL::original denial"], data: { data: [] } } },
      }),
    ).toThrow("FAIL::original denial");
  });
  test("preserves a failed request ID without walking arbitrary nested fields", () => {
    const response = envelope({
      success: false,
      errorCode: "Denied",
      errorMsg: "original denial",
      data: null,
    });
    try {
      unwrapConsoleResponse(response);
    } catch (error) {
      expect(error).toMatchObject({
        api: { requestId: "request-fixture" },
        rawResponse: JSON.stringify(response),
      });
      return;
    }
    throw new Error("Expected service rejection");
  });
});
