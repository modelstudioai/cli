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
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(fixtureDir, { recursive: true, force: true });
});

function makeClient(baseUrl: string): Client {
  return new Client({
    identity,
    settings,
    baseUrl: REGIONS.cn,
    apiCred: { token: "synthetic-profile-key", baseUrl, source: "config" },
  });
}

describe("regional temporary file uploads", () => {
  test.each([
    REGIONS.cn,
    REGIONS.intl,
    REGIONS.us,
    "https://ws-example.ap-southeast-1.maas.aliyuncs.com",
    "https://proxy.example.test",
  ])("pairs the upload policy host with the credential for %s", async (baseUrl) => {
    await expect(makeClient(baseUrl).uploadFile(fixturePath, "wan3.0-video")).resolves.toBe(
      "oss://temporary/sample.mp4",
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [policyUrl, policyOptions] = fetchMock.mock.calls[0]!;
    expect(policyUrl).toBe(`${baseUrl}/api/v1/uploads?action=getPolicy&model=wan3.0-video`);
    expect(new Headers(policyOptions?.headers).get("Authorization")).toBe(
      "Bearer synthetic-profile-key",
    );
    const [uploadUrl, uploadOptions] = fetchMock.mock.calls[1]!;
    expect(uploadUrl).toBe(policy.upload_host);
    expect(uploadOptions?.method).toBe("POST");
    expect((uploadOptions?.body as FormData).get("key")).toBe("temporary/sample.mp4");
    expect(new Headers(uploadOptions?.headers).has("Authorization")).toBe(false);
  });

  test("keeps the CN default for existing direct uploadFile callers", async () => {
    await uploadFile({
      apiKey: "synthetic-profile-key",
      model: "wan3.0-video",
      filePath: fixturePath,
      identity,
    });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${REGIONS.cn}/api/v1/uploads?action=getPolicy&model=wan3.0-video`,
    );
  });

  test("normalizes a supplied upload base URL using the shared origin contract", async () => {
    const options = {
      identity,
      baseUrl: `${REGIONS.intl}/compatible-mode/v1/?unused=value#fragment`,
    };
    await resolveFileUrl(fixturePath, "synthetic-profile-key", "wan3.0-video", options);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${REGIONS.intl}/api/v1/uploads?action=getPolicy&model=wan3.0-video`,
    );
  });

  test("preserves unsupported-service errors without retrying another region", async () => {
    fetchMock.mockReset();
    const response = '{"code":"UnsupportedOperation","message":"Temporary uploads unavailable"}';
    fetchMock.mockResolvedValueOnce(new Response(response, { status: 404 }));
    await expect(
      makeClient(REGIONS.intl).uploadFile(fixturePath, "wan3.0-video"),
    ).rejects.toMatchObject({
      exitCode: ExitCode.GENERAL,
      message: `Failed to get upload policy (HTTP 404, ${REGIONS.intl}/api/v1/uploads): ${response}`,
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
