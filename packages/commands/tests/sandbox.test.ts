import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BailianError, Client, ExitCode, type AnyCommand, type Settings } from "bailian-cli-core";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import {
  buildSandboxCreateBody,
  sandboxConnect,
  sandboxCreate,
  sandboxDelete,
  sandboxGet,
  sandboxList,
  sandboxPause,
  sandboxResume,
} from "../src/commands/sandbox/instance.ts";
import {
  buildTemplateCreateBody,
  buildTemplateUpdateBody,
  sandboxTemplateBuildStatus,
  sandboxTemplateCreate,
  sandboxTemplateDelete,
  sandboxTemplateGet,
  sandboxTemplateList,
  sandboxTemplateUpdate,
  waitForTemplateBuild,
} from "../src/commands/sandbox/template.ts";
import {
  readRequestBody,
  redactConnectionCredentials,
  redactRequestSecrets,
} from "../src/commands/sandbox/shared.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

const SETTINGS: Settings = {
  output: "json",
  outputExplicit: true,
  timeout: 30,
  verbose: false,
  quiet: true,
  dryRun: false,
  telemetry: false,
};

interface RecordedRequest {
  path: string;
  method?: string;
  body?: unknown;
  timeout?: number;
}

function createUrlResolver(baseUrl?: string): Client["url"] {
  const client = new Client({
    identity: {
      binName: "bl",
      version: "test",
      npmPackage: "bailian-cli",
      clientName: "bailian-cli",
    },
    settings: SETTINGS,
    baseUrl: baseUrl ?? "https://dashscope.aliyuncs.com",
    baseUrlIsDefault: baseUrl === undefined,
  });
  return client.url.bind(client);
}

async function runCommand(
  command: AnyCommand,
  flags: Record<string, unknown>,
  response: unknown,
  baseUrl?: string,
): Promise<RecordedRequest> {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const requestJson = vi.fn(async (_request: RecordedRequest) => response);
  const request = vi.fn(async (requestOptions: RecordedRequest) => {
    void requestOptions;
    return new Response(null, { status: 204 });
  });
  await command.run({
    identity: {
      binName: "bl",
      version: "test",
      npmPackage: "bailian-cli",
      clientName: "bailian-cli",
    },
    settings: SETTINGS,
    flags,
    client: { requestJson, request, url: createUrlResolver(baseUrl) },
  } as never);

  const recorded = requestJson.mock.calls[0]?.[0] ?? request.mock.calls[0]?.[0];
  if (!recorded) throw new Error("Expected the command to issue one request.");
  expect(requestJson.mock.calls.length + request.mock.calls.length).toBe(1);
  return recorded;
}

describe("Sandbox request input", () => {
  test("--body accepts inline and @file JSON objects", async () => {
    expect(await readRequestBody('{"name":"inline"}')).toEqual({ name: "inline" });

    const directory = mkdtempSync(join(tmpdir(), "bl-sandbox-body-"));
    const bodyPath = join(directory, "body.json");
    writeFileSync(bodyPath, '{"name":"file"}', "utf8");
    try {
      expect(await readRequestBody(`@${bodyPath}`)).toEqual({ name: "file" });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("instance flags override body scalars and merge key-value maps", async () => {
    const body = await buildSandboxCreateBody({
      body: JSON.stringify({
        templateID: "template-body",
        timeout: 600,
        metadata: { body: "kept", override: "body" },
        envVars: { BODY: "kept", OVERRIDE: "body" },
        network: { allowOut: ["body.example"], maskRequestHost: "body.example" },
      }),
      templateId: "template-flag",
      instanceTimeout: 900,
      metadata: ["override=flag"],
      env: ["OVERRIDE=flag"],
      allowOut: ["flag.example"],
      maskRequestHost: "flag.example",
      showCredentials: false,
    });
    expect(body).toEqual({
      templateID: "template-flag",
      timeout: 900,
      metadata: { body: "kept", override: "flag" },
      envVars: { BODY: "kept", OVERRIDE: "flag" },
      network: { allowOut: ["flag.example"], maskRequestHost: "flag.example" },
    });
  });

  test("validates instance timeout and paired template CPU/memory fields", async () => {
    await expect(
      buildSandboxCreateBody({
        templateId: "template-test",
        instanceTimeout: 299,
        showCredentials: false,
      }),
    ).rejects.toMatchObject({ exitCode: ExitCode.USAGE });

    await expect(
      buildTemplateUpdateBody({
        templateId: "template-test",
        cpuCount: 2,
        async: false,
      }),
    ).rejects.toMatchObject({ exitCode: ExitCode.USAGE });
  });

  test("template create flags map max-running-time and nested overrides", async () => {
    const body = await buildTemplateCreateBody({
      body: JSON.stringify({ networkConfig: { allowOut: ["body.example"] } }),
      name: "python",
      cpuCount: 2,
      memoryMb: 4096,
      maxRunningTime: 3600,
      allowOut: ["flag.example"],
      tag: ["latest"],
      async: false,
    });
    expect(body).toEqual({
      name: "python",
      cpuCount: 2,
      memoryMB: 4096,
      maxRunningTimeout: 3600,
      tags: ["latest"],
      networkConfig: { allowOut: ["flag.example"] },
    });
  });

  test("redacts returned connection credentials and request environment secrets recursively", () => {
    expect(
      redactConnectionCredentials({
        sandboxID: "sandbox-test",
        envdAccessToken: "envd-secret",
        connection: { trafficAccessToken: "traffic-secret", hostname: "example.test" },
      }),
    ).toEqual({
      sandboxID: "sandbox-test",
      envdAccessToken: "[REDACTED]",
      connection: { trafficAccessToken: "[REDACTED]", hostname: "example.test" },
    });
    expect(
      redactRequestSecrets({ envVars: { PUBLIC_NAME: "secret" }, nested: { apiKey: "secret" } }),
    ).toEqual({
      envVars: { PUBLIC_NAME: "[REDACTED]" },
      nested: { apiKey: "[REDACTED]" },
    });
  });
});

describe("Sandbox command transport", () => {
  test.each([
    {
      name: "create instance",
      command: sandboxCreate,
      flags: { workspaceId: "ws-test", templateId: "template-test", showCredentials: false },
      response: { sandboxID: "sandbox-test" },
      request: {
        method: "POST",
        path: "https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio/sandbox/sandboxes",
        body: { templateID: "template-test" },
      },
    },
    {
      name: "list instances",
      command: sandboxList,
      flags: { workspaceId: "ws-test", templateId: "template-test", state: "running", limit: 10 },
      response: [],
      request: {
        method: "GET",
        path: "https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio/sandbox/v2/sandboxes?templateID=template-test&state=running&limit=10",
      },
    },
    {
      name: "get instance",
      command: sandboxGet,
      flags: { workspaceId: "ws-test", sandboxId: "sandbox/a", showCredentials: false },
      response: { sandboxID: "sandbox/a" },
      request: {
        method: "GET",
        path: "https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio/sandbox/sandboxes/sandbox%2Fa",
      },
    },
    {
      name: "connect instance",
      command: sandboxConnect,
      flags: {
        workspaceId: "ws-test",
        sandboxId: "sandbox-test",
        instanceTimeout: 900,
        showCredentials: false,
      },
      response: { sandboxID: "sandbox-test" },
      request: {
        method: "POST",
        path: "https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio/sandbox/sandboxes/sandbox-test/connect",
        body: { timeout: 900 },
      },
    },
    {
      name: "pause instance",
      command: sandboxPause,
      flags: { workspaceId: "ws-test", sandboxId: "sandbox-test" },
      response: undefined,
      request: {
        method: "POST",
        path: "https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio/sandbox/sandboxes/sandbox-test/pause",
      },
    },
    {
      name: "resume instance",
      command: sandboxResume,
      flags: { workspaceId: "ws-test", sandboxId: "sandbox-test", showCredentials: false },
      response: { sandboxID: "sandbox-test" },
      request: {
        method: "POST",
        path: "https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio/sandbox/sandboxes/sandbox-test/resume",
      },
    },
    {
      name: "delete instance",
      command: sandboxDelete,
      flags: { workspaceId: "ws-test", sandboxId: "sandbox-test" },
      response: undefined,
      request: {
        method: "DELETE",
        path: "https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio/sandbox/sandboxes/sandbox-test",
      },
    },
    {
      name: "create template",
      command: sandboxTemplateCreate,
      flags: {
        workspaceId: "ws-test",
        name: "python",
        cpuCount: 1,
        memoryMb: 2048,
        async: true,
      },
      response: { templateID: "template-test", buildID: "build-test" },
      request: {
        method: "POST",
        path: "https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio/sandbox/v3/templates",
        body: { name: "python", cpuCount: 1, memoryMB: 2048 },
      },
    },
    {
      name: "list templates",
      command: sandboxTemplateList,
      flags: { workspaceId: "ws-test", limit: 20, cursor: "cursor/a" },
      response: [],
      request: {
        method: "GET",
        path: "https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio/sandbox/v2/templates?limit=20&cursor=cursor%2Fa",
      },
    },
    {
      name: "get template",
      command: sandboxTemplateGet,
      flags: { workspaceId: "ws-test", templateId: "template/a" },
      response: { templateID: "template/a" },
      request: {
        method: "GET",
        path: "https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio/sandbox/templates/template%2Fa",
      },
    },
    {
      name: "update template",
      command: sandboxTemplateUpdate,
      flags: {
        workspaceId: "ws-test",
        templateId: "template-test",
        description: "updated",
        async: true,
      },
      response: { templateID: "template-test", buildID: "build-test" },
      request: {
        method: "PUT",
        path: "https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio/sandbox/templates/template-test",
        body: { description: "updated" },
      },
    },
    {
      name: "get template build status",
      command: sandboxTemplateBuildStatus,
      flags: { workspaceId: "ws-test", templateId: "template-test", buildId: "build/a" },
      response: { status: "ready" },
      request: {
        method: "GET",
        path: "https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio/sandbox/templates/template-test/builds/build%2Fa/status",
      },
    },
    {
      name: "delete template",
      command: sandboxTemplateDelete,
      flags: { workspaceId: "ws-test", templateId: "template-test" },
      response: undefined,
      request: {
        method: "DELETE",
        path: "https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio/sandbox/templates/template-test",
      },
    },
  ])(
    "maps $name to its documented method and path",
    async ({ command, flags, response, request }) => {
      expect(await runCommand(command, flags, response)).toEqual(request);
      expect(
        await runCommand(
          command,
          { ...flags, workspaceId: undefined },
          response,
          "https://gateway.example.test",
        ),
      ).toEqual({
        ...request,
        path: request.path.replace(
          "https://ws-test.cn-beijing.maas.aliyuncs.com",
          "https://gateway.example.test",
        ),
      });
    },
  );

  test.each([
    { showCredentials: false, expectedToken: "[REDACTED]" },
    { showCredentials: true, expectedToken: "envd-secret" },
  ])("show-credentials=$showCredentials controls connection token output", async (testCase) => {
    let stdout = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });
    await sandboxGet.run({
      identity: { binName: "bl" },
      settings: { ...SETTINGS, quiet: false },
      flags: {
        workspaceId: "ws-test",
        sandboxId: "sandbox-test",
        showCredentials: testCase.showCredentials,
      },
      client: {
        url: createUrlResolver(),
        requestJson: async () => ({
          sandboxID: "sandbox-test",
          envdAccessToken: "envd-secret",
        }),
      },
    } as never);
    expect(JSON.parse(stdout)).toMatchObject({ envdAccessToken: testCase.expectedToken });
  });
});

describe("Sandbox template build polling", () => {
  test("polls building until ready", async () => {
    const requestJson = vi
      .fn()
      .mockResolvedValueOnce({ status: "building" })
      .mockResolvedValueOnce({ status: "ready", buildID: "build-test" });
    const result = await waitForTemplateBuild(
      { requestJson } as never,
      SETTINGS,
      "https://example.test/build/status",
      0,
    );
    expect(result).toMatchObject({ status: "ready", buildID: "build-test" });
    expect(requestJson).toHaveBeenCalledTimes(2);
  });

  test("preserves the service build error message", async () => {
    const requestJson = vi.fn().mockResolvedValue({
      status: "error",
      reason: { code: "BuildFailed", message: "image download failed" },
    });
    await expect(
      waitForTemplateBuild(
        { requestJson } as never,
        SETTINGS,
        "https://example.test/build/status",
        0,
      ),
    ).rejects.toMatchObject({
      message: "image download failed",
      exitCode: ExitCode.GENERAL,
    });
  });

  test("returns a timeout error when the global timeout expires", async () => {
    const requestJson = vi.fn();
    await expect(
      waitForTemplateBuild(
        { requestJson } as never,
        { ...SETTINGS, timeout: 0 },
        "https://example.test/build/status",
        1,
      ),
    ).rejects.toEqual(expect.objectContaining({ exitCode: ExitCode.TIMEOUT }));
    expect(requestJson).not.toHaveBeenCalled();
  });

  test.each([
    { name: "create", command: sandboxTemplateCreate },
    { name: "update", command: sandboxTemplateUpdate },
  ])("$name preserves submitted IDs and the original polling failure", async ({ command }) => {
    const submission = { templateID: "template-test", buildID: "build-test" };
    const serviceCause = new Error("original cause");
    const serviceError = new BailianError("service message", ExitCode.GENERAL, "original hint", {
      api: { httpStatus: 503, apiCode: "Unavailable", requestId: "request-test" },
      rawResponse: "original response",
      cause: serviceCause,
    });
    const scenarios = [
      {
        timeout: 0,
        response: { status: "building" },
        exitCode: ExitCode.TIMEOUT,
        message: "Template build polling timed out.",
      },
      {
        timeout: 30,
        response: { status: "error", reason: { message: "image download failed" } },
        exitCode: ExitCode.GENERAL,
        message: "image download failed",
      },
      {
        timeout: 30,
        error: serviceError,
        exitCode: ExitCode.GENERAL,
        message: serviceError.message,
      },
    ];
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    for (const scenario of scenarios) {
      const requestJson = vi.fn().mockResolvedValueOnce(submission);
      if (scenario.error) requestJson.mockRejectedValue(scenario.error);
      else requestJson.mockResolvedValue(scenario.response);
      const operation = command.run({
        identity: { binName: "bl" },
        settings: { ...SETTINGS, timeout: scenario.timeout },
        flags: {
          workspaceId: "ws-test",
          templateId: "template-test",
          name: "python",
          cpuCount: 1,
          memoryMb: 2048,
          async: false,
        },
        client: { requestJson, url: createUrlResolver() },
      } as never);
      await expect(operation).rejects.toMatchObject({
        message: scenario.message,
        exitCode: scenario.exitCode,
        hint: expect.stringContaining("templateID=template-test, buildID=build-test"),
      });
      if (scenario.error) {
        await expect(operation).rejects.toMatchObject({
          api: serviceError.api,
          rawResponse: serviceError.rawResponse,
          cause: serviceCause,
          hint: expect.stringContaining("original hint"),
        });
      }
      expect(requestJson.mock.calls.filter(([request]) => request.method !== "GET")).toHaveLength(
        1,
      );
    }
    expect(stdout).not.toHaveBeenCalled();
  });

  test.each(["json", "text"] as const)(
    "transport failures retain their identity and emit build recovery in %s diagnostics",
    async (output) => {
      const failure = new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
      const requestJson = vi
        .fn()
        .mockResolvedValueOnce({ templateID: "template-test", buildID: "build-test" })
        .mockRejectedValue(failure);
      let stderr = "";
      vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
        stderr += String(chunk);
        return true;
      });
      await expect(
        sandboxTemplateCreate.run({
          identity: { binName: "bl" },
          settings: { ...SETTINGS, output },
          flags: {
            workspaceId: "ws-test",
            name: "python",
            cpuCount: 1,
            memoryMb: 2048,
            async: false,
          },
          client: { requestJson, url: createUrlResolver() },
        } as never),
      ).rejects.toBe(failure);
      if (output === "json") {
        expect(JSON.parse(stderr)).toMatchObject({
          templateID: "template-test",
          buildID: "build-test",
        });
      } else {
        expect(stderr).toContain("templateID=template-test, buildID=build-test");
      }
    },
  );

  test("async template creation returns after the submit request", async () => {
    let stdout = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });
    const requestJson = vi.fn().mockResolvedValue({
      templateID: "template-test",
      buildID: "build-test",
      buildStatus: "building",
    });
    await sandboxTemplateCreate.run({
      identity: { binName: "bl" },
      settings: SETTINGS,
      flags: {
        workspaceId: "ws-test",
        name: "python",
        cpuCount: 1,
        memoryMb: 2048,
        async: true,
      },
      client: { requestJson, url: createUrlResolver() },
    } as never);
    expect(requestJson).toHaveBeenCalledTimes(1);
    expect(stdout).toBe("template-test\tbuild-test\n");
  });

  test.each([undefined, "https://gateway.example.test"])(
    "template creation polls the selected origin %s and emits the final envelope",
    async (baseUrl) => {
      let stdout = "";
      vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
        stdout += String(chunk);
        return true;
      });
      const requestJson = vi
        .fn()
        .mockResolvedValueOnce({
          templateID: "template-test",
          buildID: "build-test",
          buildStatus: "building",
        })
        .mockResolvedValueOnce({
          templateID: "template-test",
          buildID: "build-test",
          status: "ready",
        });
      await sandboxTemplateCreate.run({
        identity: { binName: "bl" },
        settings: { ...SETTINGS, quiet: false },
        flags: {
          workspaceId: "ws-test",
          name: "python",
          cpuCount: 1,
          memoryMb: 2048,
          async: false,
          pollInterval: 1,
        },
        client: { requestJson, url: createUrlResolver(baseUrl) },
      } as never);

      expect(requestJson).toHaveBeenCalledTimes(2);
      expect(requestJson.mock.calls[1]?.[0]).toMatchObject({
        method: "GET",
        path: `${baseUrl ?? "https://ws-test.cn-beijing.maas.aliyuncs.com"}/api/v1/agentstudio/sandbox/templates/template-test/builds/build-test/status`,
      });
      expect(JSON.parse(stdout)).toEqual({
        template: {
          templateID: "template-test",
          buildID: "build-test",
          buildStatus: "building",
        },
        build: {
          templateID: "template-test",
          buildID: "build-test",
          status: "ready",
        },
      });
    },
  );
});

test("Sandbox validation errors use CLI usage exit codes", async () => {
  await expect(buildSandboxCreateBody({ showCredentials: false })).rejects.toBeInstanceOf(
    BailianError,
  );
});
