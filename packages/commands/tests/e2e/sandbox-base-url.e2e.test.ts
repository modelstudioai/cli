import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e } from "./helpers.ts";
import { SANDBOX_ROUTES } from "./topic-routes.ts";

const ROUTES = { ...SANDBOX_ROUTES, "auth login": "authLogin" } as const;
const tempDirectories: string[] = [];
const servers: Server[] = [];
const API_PATH = "/api/v1/agentstudio/sandbox";
const PROFILE_CONFIG = {
  api_key: "sk-default-test",
  base_url: "https://default.example.test",
  active_config: "sandbox-test",
  "sandbox-test": {
    api_key: "sk-profile-test",
    base_url: "https://profile.example.test",
  },
};

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function makeConfigEnv(config: Record<string, unknown> = {}): NodeJS.ProcessEnv {
  const directory = mkdtempSync(join(tmpdir(), "bl-sandbox-base-url-"));
  tempDirectories.push(directory);
  writeFileSync(join(directory, "config.json"), JSON.stringify(config));
  return {
    BAILIAN_CONFIG_DIR: directory,
    DASHSCOPE_API_KEY: "",
    DASHSCOPE_BASE_URL: "",
    BAILIAN_WORKSPACE_ID: "",
  };
}

describe("e2e: Sandbox shared base URL resolution", () => {
  test.each([
    {
      name: "flag overrides env and profile, normalizing paths and preserving the port",
      args: ["--base-url", "https://flag.example.test:8443/api/v1/agentstudio/?ignored=1#fragment"],
      envBaseUrl: "https://env.example.test",
      config: PROFILE_CONFIG,
      expectedOrigin: "https://flag.example.test:8443",
    },
    {
      name: "env overrides the active profile",
      args: [],
      envBaseUrl: "https://env.example.test/compatible-mode/v1/",
      config: PROFILE_CONFIG,
      expectedOrigin: "https://env.example.test",
    },
    {
      name: "the active profile supplies its configured origin",
      args: [],
      envBaseUrl: "",
      config: PROFILE_CONFIG,
      expectedOrigin: "https://profile.example.test",
    },
    {
      name: "an explicit profile selection uses that profile",
      args: ["--config", "default"],
      envBaseUrl: "",
      config: PROFILE_CONFIG,
      expectedOrigin: "https://default.example.test",
    },
    {
      name: "an explicit default model origin still overrides workspace inference",
      args: ["--base-url", "https://dashscope.aliyuncs.com", "--workspace-id", "unused"],
      envBaseUrl: "",
      config: {},
      expectedOrigin: "https://dashscope.aliyuncs.com",
    },
    {
      name: "without any base URL the workspace endpoint is preserved",
      args: ["--workspace-id", "ws-test"],
      envBaseUrl: "",
      config: {},
      expectedOrigin: "https://ws-test.cn-beijing.maas.aliyuncs.com",
    },
  ])("$name", async ({ args, envBaseUrl, config, expectedOrigin }) => {
    const result = await runCommandE2e(
      ROUTES,
      ["sandbox", "create", "--template-id", "tpl-test", ...args, "--dry-run", "--output", "json"],
      { ...makeConfigEnv(config), DASHSCOPE_BASE_URL: envBaseUrl },
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseStdoutJson(result.stdout)).toMatchObject({
      endpoint: `${expectedOrigin}${API_PATH}/sandboxes`,
    });
  });

  test("an unconfigured URL still requires a workspace, while malformed URLs fail validation", async () => {
    const env = makeConfigEnv();
    for (const args of [[], ["--base-url", "invalid"], ["--base-url", "file:///tmp/gateway"]]) {
      const result = await runCommandE2e(
        ROUTES,
        [
          "sandbox",
          "create",
          "--template-id",
          "tpl-test",
          ...args,
          "--dry-run",
          "--output",
          "json",
        ],
        env,
      );
      expect(result.exitCode).toBe(2);
      expect(JSON.parse(result.stderr).error.message).toMatch(
        /Workspace ID|Invalid model base URL/,
      );
    }
  });

  test("auth login persists a base URL that Sandbox uses without a workspace flag", async () => {
    const env = makeConfigEnv();
    const login = await runCommandE2e(
      ROUTES,
      [
        "auth",
        "login",
        "--config",
        "sandbox-test",
        "--api-key",
        "sk-login-test",
        "--base-url",
        "https://login.example.test/api/v1/agentstudio/sandbox/",
      ],
      env,
    );
    expect(login.exitCode, login.stderr).toBe(0);
    const stored = JSON.parse(readFileSync(join(env.BAILIAN_CONFIG_DIR!, "config.json"), "utf8"));
    expect(stored.active_config).toBe("sandbox-test");
    expect(stored["sandbox-test"].base_url).toBe("https://login.example.test");

    const result = await runCommandE2e(
      ROUTES,
      ["sandbox", "pause", "--sandbox-id", "sbx-test", "--dry-run", "--output", "json"],
      env,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseStdoutJson(result.stdout)).toMatchObject({
      endpoint: `https://login.example.test${API_PATH}/sandboxes/sbx-test/pause`,
    });
  });
});

describe("e2e: Sandbox custom gateway transport", () => {
  test.each([
    {
      action: "create",
      args: ["--name", "python", "--cpu-count", "1", "--memory-mb", "2048"],
      method: "POST",
      suffix: "/v3/templates",
    },
    {
      action: "update",
      args: ["--template-id", "template/a", "--description", "updated"],
      method: "PUT",
      suffix: "/templates/template%2Fa",
    },
  ])(
    "template $action and build polling use the same gateway and Bearer key",
    async ({ action, args, method, suffix }) => {
      const received: {
        method?: string;
        path?: string;
        authorization?: string;
        e2bKey?: string | string[];
      }[] = [];
      const server = createServer((request, response) => {
        request.resume();
        received.push({
          method: request.method,
          path: request.url,
          authorization: request.headers.authorization,
          e2bKey: request.headers["x-api-key"],
        });
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            templateID: "template/a",
            buildID: "build a",
            status: request.method === "GET" ? "ready" : "building",
          }),
        );
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected a local TCP server.");
      const origin = `http://127.0.0.1:${address.port}`;
      const result = await runCommandE2e(
        ROUTES,
        ["sandbox", "template", action, ...args, "--poll-interval", "1", "--output", "json"],
        makeConfigEnv({ api_key: "sk-gateway-test", base_url: origin }),
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(received).toEqual([
        {
          method,
          path: `${API_PATH}${suffix}`,
          authorization: "Bearer sk-gateway-test",
          e2bKey: undefined,
        },
        {
          method: "GET",
          path: `${API_PATH}/templates/template%2Fa/builds/build%20a/status`,
          authorization: "Bearer sk-gateway-test",
          e2bKey: undefined,
        },
      ]);
      expect(parseStdoutJson(result.stdout)).toMatchObject({ build: { status: "ready" } });
    },
  );
});

describe("e2e: Sandbox submitted build recovery", () => {
  test.each([
    { action: "create", output: "json", failure: "timeout", exitCode: 5 },
    { action: "update", output: "text", failure: "service", exitCode: 1 },
    { action: "create", output: "json", failure: "network", exitCode: 6 },
  ])(
    "$action retains IDs after a $failure in $output output",
    async ({ action, output, failure, exitCode }) => {
      let submissionCount = 0;
      const server = createServer((request, response) => {
        request.resume();
        response.setHeader("content-type", "application/json");
        if (request.method !== "GET") {
          submissionCount += 1;
          response.end(
            JSON.stringify({
              templateID: "template-recovery",
              buildID: "build-recovery",
              buildStatus: "building",
            }),
          );
        } else if (failure === "network") {
          request.socket.destroy();
        } else if (failure === "service") {
          response.writeHead(503);
          response.end(
            JSON.stringify({
              code: 100005,
              message: "original service failure",
              requestID: "request-recovery",
            }),
          );
        } else {
          response.end(JSON.stringify({ status: "building" }));
        }
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected a local TCP server.");
      const args =
        action === "create"
          ? ["--name", "recovery", "--cpu-count", "1", "--memory-mb", "2048"]
          : ["--template-id", "template-recovery", "--description", "updated"];
      const result = await runCommandE2e(
        ROUTES,
        ["sandbox", "template", action, ...args, "--timeout", "1", "--quiet", "--output", output],
        makeConfigEnv({
          api_key: "sk-recovery-test",
          base_url: `http://127.0.0.1:${address.port}`,
        }),
      );
      expect(result.exitCode, result.stderr).toBe(exitCode);
      expect(result.stdout).toBe("");
      expect(submissionCount).toBe(1);
      expect(result.stderr).toContain("templateID=template-recovery, buildID=build-recovery");
      expect(result.stderr).toContain("sandbox template build-status");
      if (output === "json") {
        const diagnostics = result.stderr
          .trim()
          .split(/\n\s*\n/)
          .map((diagnostic) => JSON.parse(diagnostic));
        expect(diagnostics.at(-1)).toMatchObject({ error: { code: exitCode } });
        if (failure === "timeout") {
          expect(diagnostics).toHaveLength(1);
          expect(diagnostics[0].error.message).toBe("Template build polling timed out.");
        } else {
          expect(diagnostics[0]).toMatchObject({
            templateID: "template-recovery",
            buildID: "build-recovery",
          });
          expect(diagnostics.at(-1).error.message).toContain("Network request failed");
        }
      } else {
        expect(result.stderr).toContain("original service failure");
        expect(result.stderr).toContain("HTTP 503 (100005)");
        expect(result.stderr).toContain("request-recovery");
      }
    },
  );
});
