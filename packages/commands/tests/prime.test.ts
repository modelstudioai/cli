import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, ExitCode, REGIONS, type ApiKeyCredential, type Settings } from "bailian-cli-core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { resolvePrimeEndpoint, validatePrimeFlags } from "../src/commands/shared/prime.ts";
import videoGenerate from "../src/commands/video/generate.ts";

function createUrlResolver(baseUrl: string, usesDefaultBaseUrl: boolean) {
  return {
    url(path: string, defaultBaseUrl?: () => string): string {
      const resolvedBaseUrl = usesDefaultBaseUrl && defaultBaseUrl ? defaultBaseUrl() : baseUrl;
      return resolvedBaseUrl + path;
    },
  };
}

describe("Prime command helpers", () => {
  test("要求显式 model，且 workspace flag 只能与 Prime 一起使用", () => {
    expect(validatePrimeFlags({ prime: true })).toMatch(/--model/);
    expect(validatePrimeFlags({ prime: false, workspaceId: "ws_test" })).toMatch(/--prime/);
    expect(validatePrimeFlags({ prime: true, model: "prime-model" })).toBeUndefined();
  });

  test("默认 Base URL 下让提交与轮询共用 workspace host", () => {
    const ctx = {
      flags: { workspaceId: "ws_test" },
      settings: {},
      identity: { binName: "bl" },
      client: createUrlResolver("https://dashscope.aliyuncs.com", true),
    };

    expect(
      resolvePrimeEndpoint(ctx, "/api/v1/services/aigc/video-generation/video-synthesis"),
    ).toBe(
      "https://ws_test.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
    );
    expect(resolvePrimeEndpoint(ctx, "/api/v1/tasks/task_test")).toBe(
      "https://ws_test.cn-beijing.maas.aliyuncs.com/api/v1/tasks/task_test",
    );
  });

  test("显式 Base URL 优先，且不要求 workspace", () => {
    const ctx = {
      flags: {},
      settings: {},
      identity: { binName: "bl" },
      client: createUrlResolver("https://example.test", false),
    };

    expect(resolvePrimeEndpoint(ctx, "/compatible-mode/v1/chat/completions")).toBe(
      "https://example.test/compatible-mode/v1/chat/completions",
    );
  });
});

describe("Prime video upload origins", () => {
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
  const workspaceOrigin = "https://ws_test.cn-beijing.maas.aliyuncs.com";
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
    fixtureDir = mkdtempSync(join(tmpdir(), "bailian-prime-upload-"));
    fixturePath = join(fixtureDir, "sample.png");
    writeFileSync(fixturePath, "synthetic media fixture");
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname === "/api/v1/uploads") {
        return Response.json({ data: policy });
      }
      if (url.origin === policy.upload_host) return new Response(null, { status: 200 });
      if (url.pathname === "/api/v1/services/aigc/video-generation/video-synthesis") {
        return Response.json({ output: { task_id: "synthetic-task" } });
      }
      throw new Error(`Unexpected test request: ${url.href}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  function runVideo(
    flags: Record<string, unknown>,
    options: {
      baseUrl?: string;
      settingsWorkspaceId?: string;
      credentialSource?: ApiKeyCredential["source"];
    } = {},
  ) {
    const baseUrl = options.baseUrl ?? REGIONS.cn;
    const commandSettings = { ...settings, workspaceId: options.settingsWorkspaceId };
    return videoGenerate.run({
      identity,
      settings: commandSettings,
      flags: {
        prime: true,
        model: "wan3.0-video",
        prompt: "synthetic video",
        async: true,
        ...flags,
      },
      client: new Client({
        identity,
        settings: commandSettings,
        baseUrl,
        baseUrlIsDefault: options.baseUrl === undefined,
        apiCred: {
          token: "synthetic-workspace-key",
          baseUrl,
          source: options.credentialSource ?? "flag",
        },
      }),
    } as never);
  }

  function expectRequestOrigins(options: {
    uploadOrigin: string;
    submitOrigin: string;
    uploadCount?: number;
  }) {
    const { uploadOrigin, submitOrigin, uploadCount = 1 } = options;
    const policyCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = input instanceof Request ? input.url : input.toString();
      return url.includes("/api/v1/uploads?");
    });
    expect(policyCalls).toHaveLength(uploadCount);
    for (const [policyUrl, policyOptions] of policyCalls) {
      expect(policyUrl).toBe(`${uploadOrigin}/api/v1/uploads?action=getPolicy&model=wan3.0-video`);
      expect(new Headers(policyOptions?.headers).get("Authorization")).toBe(
        "Bearer synthetic-workspace-key",
      );
    }
    const [submitUrl, submitOptions] = fetchMock.mock.calls.at(-1)!;
    expect(submitUrl).toBe(`${submitOrigin}/api/v1/services/aigc/video-generation/video-synthesis`);
    expect(new Headers(submitOptions?.headers).get("Authorization")).toBe(
      "Bearer synthetic-workspace-key",
    );
    expect(fetchMock).toHaveBeenCalledTimes(uploadCount * 2 + 1);
  }

  test.each(["flag", "env"] as const)(
    "uploads local files to the derived workspace with a %s key",
    async (credentialSource) => {
      await runVideo(
        { file: fixturePath, ...(credentialSource === "flag" ? { workspaceId: "ws_test" } : {}) },
        {
          credentialSource,
          settingsWorkspaceId: credentialSource === "env" ? "ws_test" : undefined,
        },
      );
      expectRequestOrigins({ uploadOrigin: workspaceOrigin, submitOrigin: workspaceOrigin });
    },
  );

  test("uploads both local keyframes to the derived workspace", async () => {
    await runVideo({ image: fixturePath, lastFrame: fixturePath, workspaceId: "ws_test" });
    expectRequestOrigins({
      uploadOrigin: workspaceOrigin,
      submitOrigin: workspaceOrigin,
      uploadCount: 2,
    });
  });

  test.each([
    [REGIONS.cn, REGIONS.cn],
    [REGIONS.intl, REGIONS.intl],
    [
      "https://configured-workspace.cn-beijing.maas.aliyuncs.com",
      "https://configured-workspace.cn-beijing.maas.aliyuncs.com",
    ],
    [
      "https://configured-workspace.ap-southeast-1.maas.aliyuncs.com",
      "https://configured-workspace.ap-southeast-1.maas.aliyuncs.com",
    ],
    ["https://proxy.example.test", "https://proxy.example.test"],
  ])(
    "routes configured origin %s through upload service %s without requiring a workspace",
    async (baseUrl, uploadOrigin) => {
      await runVideo({ file: fixturePath }, { baseUrl });
      expectRequestOrigins({ uploadOrigin, submitOrigin: baseUrl });
    },
  );

  test.each([REGIONS.us, "https://configured-workspace.us-east-1.maas.aliyuncs.com"])(
    "rejects unsupported local upload origin %s before submitting",
    async (baseUrl) => {
      await expect(runVideo({ file: fixturePath }, { baseUrl })).rejects.toMatchObject({
        exitCode: ExitCode.USAGE,
        hint: expect.stringContaining("HTTPS media URL"),
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  test("rejects a missing default workspace before making an upload request", async () => {
    await expect(runVideo({ file: fixturePath })).rejects.toMatchObject({
      message: "Workspace ID is required for the default Prime endpoint.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("passes an existing media URL through without uploading", async () => {
    await runVideo({ file: "https://media.example.test/video.mp4", workspaceId: "ws_test" });
    expectRequestOrigins({
      uploadOrigin: workspaceOrigin,
      submitOrigin: workspaceOrigin,
      uploadCount: 0,
    });
  });
});
