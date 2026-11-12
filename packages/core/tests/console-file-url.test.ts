import { describe, expect, test, vi } from "vite-plus/test";
import type { Client } from "../src/client/client.ts";
import { BailianError } from "../src/errors/base.ts";
import { ExitCode } from "../src/errors/codes.ts";
import { CONSOLE_FILE_URL_API, getConsoleFileUrl } from "../src/files/url.ts";

// Pure module calls: no CLI subprocess, credential resolution, HOME access, or file fixtures.
function fakeClient(response: unknown) {
  const consoleCall = vi.fn<Client["console"]>().mockResolvedValue(response);
  const client: Pick<Client, "console"> = {
    console: async <Result>(api: string, data: Record<string, unknown>) =>
      (await consoleCall(api, data)) as Result,
  };
  return { client, consoleCall };
}

function gatewayResponse(payload: unknown) {
  return {
    code: "200",
    data: {
      success: true,
      DataV2: {
        ret: ["SUCCESS::接口调用成功"],
        data: { code: "200", success: true, data: payload },
      },
    },
  };
}

const signedUrl =
  "https://files.example.test/report%20name.pdf?Signature=fake%2Bsignature&Expires=0";

const responseShapes = [
  { name: "bare object", wrap: (payload: unknown) => payload },
  { name: "data envelope", wrap: (payload: unknown) => ({ code: "200", data: payload }) },
  {
    name: "double data envelope",
    wrap: (payload: unknown) => ({ data: { success: true, data: payload } }),
  },
  { name: "DataV2 envelope", wrap: gatewayResponse },
];

describe("getConsoleFileUrl", () => {
  test("calls the exact API with only the top-level fileKey and preserves its characters", async () => {
    const fileKey = " folder/业务文件 ?#%&+=.pdf ";
    const { client, consoleCall } = fakeClient(gatewayResponse({ url: signedUrl }));

    await getConsoleFileUrl(client, fileKey);

    expect(CONSOLE_FILE_URL_API).toBe("zeldaEasy.bmp.ossRpcService.download");
    expect(consoleCall).toHaveBeenCalledExactlyOnceWith("zeldaEasy.bmp.ossRpcService.download", {
      fileKey,
    });
    expect(consoleCall.mock.calls[0]?.[1]).toStrictEqual({ fileKey });
  });

  test.each(responseShapes)("unwraps $name without dropping business fields", async ({ wrap }) => {
    const payload = {
      url: signedUrl,
      fileName: "report.pdf",
      enabled: false,
      size: 0,
      expiresAt: null,
      data: null,
      extra: { available: false, count: 0, value: null },
    };
    const { client } = fakeClient(wrap(payload));

    const result = await getConsoleFileUrl(client, "example-file-key");

    expect(result).toStrictEqual(payload);
    expect(result.url).toBe(signedUrl);
  });

  test.each(["http://files.example.test/file", "https://files.example.test/file"])(
    "accepts an absolute HTTP(S) URL: %s",
    async (url) => {
      const { client } = fakeClient(gatewayResponse({ url }));
      await expect(getConsoleFileUrl(client, "example-file-key")).resolves.toStrictEqual({ url });
    },
  );

  test.each([
    { name: "null result", payload: null },
    { name: "false result", payload: false },
    { name: "zero result", payload: 0 },
    { name: "string result", payload: signedUrl },
    { name: "array result", payload: [{ url: signedUrl }] },
    { name: "missing URL", payload: { signature: "private-response-marker" } },
    { name: "null URL", payload: { url: null } },
    { name: "non-string URL", payload: { url: 123 } },
    { name: "empty URL", payload: { url: "" } },
    { name: "whitespace URL", payload: { url: " \t\n" } },
    { name: "relative URL", payload: { url: "/file?Signature=private-response-marker" } },
    { name: "OSS URI", payload: { url: "oss://bucket/private-response-marker" } },
    { name: "FTP URL", payload: { url: "ftp://files.example.test/private-response-marker" } },
    { name: "missing host", payload: { url: "https://" } },
    { name: "malformed host", payload: { url: "https://bad host/private-response-marker" } },
    { name: "malformed scheme", payload: { url: "https:private-response-marker" } },
  ])("rejects $name with a bilingual GENERAL error and no raw response", async ({ payload }) => {
    const { client } = fakeClient(gatewayResponse(payload));
    const error = await getConsoleFileUrl(client, "example-file-key").catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(BailianError);
    if (!(error instanceof BailianError)) throw new Error("Expected a BailianError");
    expect(error.exitCode).toBe(ExitCode.GENERAL);
    expect(error.message).toContain("valid HTTP(S) URL");
    expect(error.message).toContain("有效 HTTP(S) URL");
    expect(error.message).not.toContain(signedUrl);
    expect(JSON.stringify(error.toJSON())).not.toContain("private-response-marker");
    expect(error.rawResponse).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });

  test.each([
    {
      name: "HTTP failure",
      httpStatus: 403,
      apiCode: "FileDenied",
      message: "original HTTP error",
    },
    {
      name: "business failure",
      httpStatus: 200,
      apiCode: "FileUnavailable",
      message: "原始业务错误",
    },
  ])("preserves the client's $name unchanged", async ({ httpStatus, apiCode, message }) => {
    const serviceError = new BailianError(
      `HTTP ${httpStatus}; code=${apiCode}; request_id=request-test - ${message}`,
      ExitCode.GENERAL,
      undefined,
      { api: { httpStatus, apiCode, requestId: "request-test" } },
    );
    const { client, consoleCall } = fakeClient(undefined);
    consoleCall.mockRejectedValueOnce(serviceError);

    await expect(getConsoleFileUrl(client, "example-file-key")).rejects.toBe(serviceError);
    expect(consoleCall).toHaveBeenCalledTimes(1);
  });

  test("surfaces an envelope business error before validating the missing URL", async () => {
    const serviceMessage = "原始服务错误 original service error";
    const { client } = fakeClient({
      code: "200",
      data: {
        success: true,
        DataV2: {
          ret: ["SUCCESS::接口调用成功"],
          data: { success: false, code: "FileDenied", message: serviceMessage, data: null },
        },
      },
    });
    const error = await getConsoleFileUrl(client, "example-file-key").catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(BailianError);
    if (!(error instanceof BailianError)) throw new Error("Expected a BailianError");
    expect(error.exitCode).toBe(ExitCode.GENERAL);
    expect(error.message).toContain(serviceMessage);
    expect(error.message).toContain("FileDenied");
    expect(error.message).not.toContain("valid HTTP(S) URL");
  });

  test("rejects a failed protocol envelope even if its payload contains a valid URL", async () => {
    const serviceMessage = "FAIL_BIZ::original protocol failure";
    const { client } = fakeClient({
      data: {
        DataV2: { ret: [serviceMessage], data: { data: { url: signedUrl } } },
      },
    });
    const error = await getConsoleFileUrl(client, "example-file-key").catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(BailianError);
    if (!(error instanceof BailianError)) throw new Error("Expected a BailianError");
    expect(error.exitCode).toBe(ExitCode.GENERAL);
    expect(error.message).toContain(serviceMessage);
  });
});
