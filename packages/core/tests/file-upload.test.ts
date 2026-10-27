import { httpTransport } from "../src/client/transport.ts";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { Client } from "../src/client/client.ts";
import { REGIONS, type Settings } from "../src/config/schema.ts";
import { ExitCode } from "../src/errors/codes.ts";
import { resolveFileUrl, uploadFile } from "../src/files/upload.ts";

const identity = {
  binName: "test-cli",
  version: "test",
  npmPackage: "test-cli",
  clientName: "test-client",
};
const settings: Settings = {
  output: "json",
  outputExplicit: true,
  timeout: 30,
  watermark: true,
  verbose: false,
  quiet: true,
  dryRun: false,
  telemetry: false,
};
const policy = {
  upload_host: "https://uploads.example.test",
  upload_dir: "temporary",
  oss_access_key_id: "test-access-key",
  signature: "test-signature",
  policy: "test-policy",
  x_oss_object_acl: "private",
  x_oss_forbid_overwrite: "true",
};
const fetchMock = vi.fn<typeof fetch>();
let fixtureDir: string;
let fixturePath: string;

beforeEach(() => {
  fixtureDir = mkdtempSync(join(tmpdir(), "bailian-regional-upload-"));
  fixturePath = join(fixtureDir, "sample.mp4");
  writeFileSync(fixturePath, "synthetic media fixture");
  fetchMock.mockReset();
  fetchMock.mockResolvedValueOnce(Response.json({ data: policy }));
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
  vi.spyOn(httpTransport, "fetch").mockImplementation(fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  rmSync(fixtureDir, { recursive: true, force: true });
});

function makeClient(baseUrl: string, token = "sk-synthetic-profile-key"): Client {
  return new Client({
    identity,
    settings,
    baseUrl: REGIONS.cn,
    apiCred: { token, baseUrl, source: "config" },
  });
}

function expectSuccessfulUpload(uploadOrigin: string, token = "sk-synthetic-profile-key"): void {
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const [policyUrl, policyOptions] = fetchMock.mock.calls[0]!;
  expect(policyUrl).toBe(`${uploadOrigin}/api/v1/uploads?action=getPolicy&model=wan3.0-video`);
  expect(new Headers(policyOptions?.headers).get("Authorization")).toBe(`Bearer ${token}`);
  const [uploadUrl, uploadOptions] = fetchMock.mock.calls[1]!;
  expect(uploadUrl).toBe(policy.upload_host);
  expect(uploadOptions).toBeDefined();
  const uploadRequestOptions = uploadOptions!;
  expect(uploadRequestOptions.method).toBe("POST");
  expect((uploadRequestOptions.body as FormData).get("key")).toBe("temporary/sample.mp4");
  expect(new Headers(uploadRequestOptions.headers).has("Authorization")).toBe(false);
}

describe("regional temporary file uploads", () => {
  test.each([
    [REGIONS.cn, REGIONS.cn],
    [REGIONS.intl, REGIONS.intl],
    [
      "https://ws-example.cn-beijing.maas.aliyuncs.com",
      "https://ws-example.cn-beijing.maas.aliyuncs.com",
    ],
    [
      "https://ws-example.ap-southeast-1.maas.aliyuncs.com",
      "https://ws-example.ap-southeast-1.maas.aliyuncs.com",
    ],
    ["https://proxy.example.test", "https://proxy.example.test"],
  ])("routes %s through the supported upload service %s", async (baseUrl, uploadOrigin) => {
    await expect(makeClient(baseUrl).uploadFile(fixturePath, "wan3.0-video")).resolves.toBe(
      "oss://temporary/sample.mp4",
    );
    expectSuccessfulUpload(uploadOrigin);
  });

  test("keeps the CN default for existing direct uploadFile callers", async () => {
    await uploadFile({
      apiKey: "sk-synthetic-profile-key",
      model: "wan3.0-video",
      filePath: fixturePath,
      identity,
    });
    expectSuccessfulUpload(REGIONS.cn);
  });

  test("normalizes a supported model base URL before resolving its upload region", async () => {
    const options = {
      identity,
      baseUrl: `${REGIONS.intl}/compatible-mode/v1/?unused=value#fragment`,
    };
    await resolveFileUrl(fixturePath, "sk-synthetic-profile-key", "wan3.0-video", options);
    expectSuccessfulUpload(REGIONS.intl);
  });

  test.each([
    [REGIONS.us, "dashscope-us.aliyuncs.com"],
    ["https://ws-example.us-east-1.maas.aliyuncs.com", "us-east-1"],
    ["https://ws-example.cn-shanghai.maas.aliyuncs.com", "cn-shanghai"],
    ["https://token-plan.cn-beijing.maas.aliyuncs.com", "Token Plan"],
  ])("rejects unsupported local uploads for %s", async (baseUrl, target) => {
    await expect(makeClient(baseUrl).uploadFile(fixturePath, "wan3.0-video")).rejects.toMatchObject(
      {
        exitCode: ExitCode.USAGE,
        message: expect.stringContaining(target),
        hint: expect.stringContaining("HTTPS media URL"),
      },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    REGIONS.cn,
    REGIONS.intl,
    "https://ws-example.cn-beijing.maas.aliyuncs.com",
    "https://ws-example.ap-southeast-1.maas.aliyuncs.com",
  ])(
    "rejects Token Plan keys on official endpoint %s before requesting a policy",
    async (baseUrl) => {
      await expect(
        makeClient(baseUrl, "sk-sp-synthetic-plan-key").uploadFile(fixturePath, "wan3.0-video"),
      ).rejects.toMatchObject({
        exitCode: ExitCode.USAGE,
        message: expect.stringContaining("Token Plan"),
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  test("lets a Token Plan key reach an explicit custom proxy", async () => {
    const proxy = "https://proxy.example.test";
    await expect(
      makeClient(proxy, "sk-sp-synthetic-plan-key").uploadFile(fixturePath, "wan3.0-video"),
    ).resolves.toBe("oss://temporary/sample.mp4");
    expectSuccessfulUpload(proxy, "sk-sp-synthetic-plan-key");
  });

  test("preserves upload-policy service errors without retrying another region", async () => {
    fetchMock.mockReset();
    const response = JSON.stringify({
      code: "UnsupportedOperation",
      message: "Temporary uploads unavailable",
      request_id: "request-test",
    });
    fetchMock.mockResolvedValueOnce(new Response(response, { status: 404 }));
    await expect(
      makeClient(REGIONS.intl).uploadFile(fixturePath, "wan3.0-video"),
    ).rejects.toMatchObject({
      exitCode: ExitCode.GENERAL,
      message: `HTTP 404; code=UnsupportedOperation; request_id=request-test; upload_endpoint=${REGIONS.intl}/api/v1/uploads - Temporary uploads unavailable`,
      hint: undefined,
      api: {
        httpStatus: 404,
        apiCode: "UnsupportedOperation",
        requestId: "request-test",
      },
      rawResponse: response,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${REGIONS.intl}/api/v1/uploads?action=getPolicy&model=wan3.0-video`,
    );
  });

  test.each([
    "https://media.example.test/sample.mp4",
    "oss://existing/sample.mp4",
    "data:image/png;base64,AQID",
  ])("passes %s through without credentials or requests", async (source) => {
    const client = new Client({ identity, settings, baseUrl: REGIONS.intl });
    await expect(client.uploadFile(source, "wan3.0-video")).resolves.toBe(source);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
