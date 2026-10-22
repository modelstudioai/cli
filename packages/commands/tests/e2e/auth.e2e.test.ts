import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { createServer, type Server } from "http";
import { tmpdir } from "os";
import { join } from "path";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { readConfigFile, readConfigProfiles, writeConfigFile } from "bailian-cli-core";
import { buildIsolatedCliEnv, withIsolatedHome } from "e2e/isolation";
import {
  isDashScopeE2EReady,
  isOpenApiE2EReady,
  makeE2eOutputDir,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
  runCommandInProcess,
} from "./helpers.ts";
import { AUTH_ROUTES } from "./topic-routes.ts";

/** Auth E2E：本地参数/持久化契约默认执行；真实鉴权请求按对应 readiness gate 执行。 */

let modelsServer: Server;
let modelsOrigin: string;

beforeAll(async () => {
  modelsServer = createServer((request, response) => {
    if (request.method !== "GET" || !request.url?.includes("/models")) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ code: "NotFound", message: "models route required" }));
      return;
    }
    if (request.headers.authorization === "Bearer sk-rejected-placeholder") {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ code: "InvalidApiKey", message: "invalid key" }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: [{ model: "qwen-plus" }] }));
  });
  await new Promise<void>((resolveListen) => modelsServer.listen(0, "127.0.0.1", resolveListen));
  const address = modelsServer.address();
  if (!address || typeof address === "string") throw new Error("models server did not start");
  modelsOrigin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolveClose) => modelsServer.close(() => resolveClose()));
});

describe("e2e: auth", () => {
  test("auth login --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(AUTH_ROUTES, ["auth", "login", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/login|api-key/i);
    expect(stderr).toMatch(/--console-site.*ordinary API key/i);
    expect(stderr).toMatch(/subscription plans.*--api-key/i);
    expect(stderr).toMatch(/--open-api/);
    expect(stderr).toContain("--no-browser");
    expect(stderr).toContain("--token-stdin");
    expect(stderr).toContain("--console-region");
    expect(stderr).toContain("bl auth login --console\n");
    expect(stderr).not.toContain("bl auth login --console --console-site domestic");
  });

  test("auth login 一次只能选择一种登录模式", async () => {
    const { stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "login",
      "--console",
      "--api-key",
      "sk-e2e-placeholder",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Choose exactly one login mode/);
  });

  test("auth login 模式专属参数不能脱离对应模式", async () => {
    const openApiFlagOnly = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "login",
      "--access-key-id",
      "LTAI-e2e",
    ]);
    expect(openApiFlagOnly.exitCode).toBe(2);
    expect(openApiFlagOnly.stderr).toMatch(/Use --open-api with --access-key-id/);

    const baseUrlWithoutApiKey = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "login",
      "--console",
      "--base-url",
      "https://dashscope.aliyuncs.com",
    ]);
    expect(baseUrlWithoutApiKey.exitCode).toBe(2);
    expect(baseUrlWithoutApiKey.stderr).toMatch(/Use --base-url only with --api-key/);

    const consoleSiteWithoutConsole = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "login",
      "--api-key",
      "sk-e2e-placeholder",
      "--console-site",
      "international",
    ]);
    expect(consoleSiteWithoutConsole.exitCode).toBe(2);
    expect(consoleSiteWithoutConsole.stderr).toMatch(/Use --console-site only with --console/);
  });

  test("auth login --open-api 要求 AK/SK 成对输入", async () => {
    const { stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "login",
      "--open-api",
      "--access-key-id",
      "LTAI-e2e",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Provide --access-key-id and --access-key-secret with --open-api/);
  });

  test("auth login --open-api --dry-run 使用 placeholder 时不请求服务端、不写配置", async () => {
    const configDir = mkdtempSync(join(tmpdir(), "bl-auth-openapi-dry-run-"));
    try {
      const { stdout, stderr, exitCode } = await runCommandE2e(
        AUTH_ROUTES,
        [
          "auth",
          "login",
          "--open-api",
          "--access-key-id",
          "LTAI-e2e-placeholder",
          "--access-key-secret",
          "secret-e2e-placeholder",
          "--dry-run",
        ],
        {
          BAILIAN_CONFIG_DIR: configDir,
          ALIBABA_CLOUD_ACCESS_KEY_ID: "",
          ALIBABA_CLOUD_ACCESS_KEY_SECRET: "",
        },
      );
      expect(exitCode, stderr).toBe(0);
      expect(stdout).toContain("Would save OpenAPI AK/SK credentials");
      expect(existsSync(join(configDir, "config.json"))).toBe(false);
    } finally {
      rmSync(configDir, { recursive: true, force: true });
    }
  });

  test.each(["success", "NotLogined", "network", "invalid-response", "empty-token"])(
    "auth login --open-api 校验 %s 后才写入并激活 Profile",
    async (outcome) => {
      await withIsolatedHome(async (home, configDir) => {
        await writeConfigFile({ access_token: "default-token" });
        const previous = {
          access_token: "browser-token",
          access_key_id: "old-ak",
          access_key_secret: "old-secret",
          base_url: "https://token-plan.ap-southeast-1.maas.aliyuncs.com",
          console_site: "international" as const,
          console_switch_agent: 123,
        };
        await writeConfigFile(previous, "token-plan");
        const originalFetch = globalThis.fetch;
        const requests: string[] = [];
        globalThis.fetch = async (input, init) => {
          const endpoint = new URL(input instanceof Request ? input.url : input);
          requests.push(endpoint.hostname);
          expect(readConfigFile("token-plan")).toEqual(previous);
          expect(readConfigProfiles().active).toBe("default");
          if (endpoint.pathname === "/modelstudio/cli/generateAccessToken") {
            return new Response(
              JSON.stringify({ cliAccessToken: outcome === "empty-token" ? " " : "new-token" }),
            );
          }
          expect(endpoint.searchParams.get("api")).toBe(
            "zeldaEasy.cornerstone-portal.cs-console.loginInfo",
          );
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer new-token");
          const payload = JSON.parse(new URLSearchParams(init?.body as string).get("params")!);
          expect(payload.Data.cornerstoneParam.switchAgent).toBe(123);
          if (outcome === "network") throw new TypeError("fetch failed");
          if (outcome === "NotLogined") {
            return new Response(
              JSON.stringify({
                data: { success: false, errorCode: "BailianGateway.Login.NotLogined" },
              }),
            );
          }
          if (outcome === "invalid-response") return new Response("{}");
          return new Response(
            JSON.stringify({
              data: { success: true, DataV2: { data: { data: { aliyun: { uid: "test-user" } } } } },
            }),
          );
        };
        try {
          const result = await runCommandInProcess(
            AUTH_ROUTES,
            [
              "auth",
              "login",
              "--open-api",
              "--access-key-id",
              "mock-ak",
              "--access-key-secret",
              "mock-secret",
              "--config",
              "token-plan",
            ],
            {
              HOME: home,
              BAILIAN_CONFIG_DIR: configDir,
              DASHSCOPE_BASE_URL: "",
              NODE_OPTIONS: "",
              HTTP_PROXY: "",
              HTTPS_PROXY: "",
              http_proxy: "",
              https_proxy: "",
            },
          );
          if (outcome === "success") {
            expect(result.exitCode, result.stderr).toBe(0);
            expect(readConfigFile("token-plan")).toMatchObject({
              ...previous,
              access_token: "new-token",
              access_key_id: "mock-ak",
              access_key_secret: "mock-secret",
              console_region: "ap-southeast-1",
            });
            expect(readConfigProfiles().active).toBe("token-plan");
          } else {
            expect(result.exitCode, result.stderr).not.toBe(0);
            expect(readConfigFile("token-plan")).toEqual(previous);
            expect(readConfigProfiles().active).toBe("default");
          }
          expect(readConfigFile().access_token).toBe("default-token");
          expect(requests).toEqual(
            outcome === "empty-token"
              ? ["modelstudio.ap-southeast-1.aliyuncs.com"]
              : [
                  "modelstudio.ap-southeast-1.aliyuncs.com",
                  "bailian-singapore-cs.alibabacloud.com",
                ],
          );
        } finally {
          globalThis.fetch = originalFetch;
        }
      });
    },
  );

  test.each([
    ["--no-browser"],
    ["--token-stdin"],
    ["--console", "--token-stdin"],
    ["--console", "--token-stdin", "--console-region", "unknown-region"],
    ["--console", "--console-region", "ap-southeast-1"],
    ["--console", "--token-stdin", "--no-browser", "--console-region", "ap-southeast-1"],
  ])("Console 兜底参数组合 %j 返回用法错误", async (...flags) => {
    const result = await runCommandInProcess(AUTH_ROUTES, ["auth", "login", ...flags, "--dry-run"]);
    expect(result.exitCode, result.stderr).toBe(2);
    expect(result.stderr).not.toContain("Unknown flag");
  });

  test.each(["--no-browser", "--token-stdin"])(
    "Console %s dry-run 不读 stdin、不打开浏览器、不写配置",
    async (flag) => {
      await withIsolatedHome(async (home, configDir) => {
        const extra = flag === "--token-stdin" ? ["--console-region", "ap-southeast-1"] : [];
        const previous = readFileSync(join(configDir, "config.json"), "utf8");
        const result = await runCommandE2e(
          AUTH_ROUTES,
          ["auth", "login", "--console", flag, ...extra, "--dry-run"],
          { HOME: home, BAILIAN_CONFIG_DIR: configDir },
        );
        expect(result.exitCode, result.stderr).toBe(0);
        expect(result.stdout).toContain(
          flag === "--token-stdin" ? "stdin" : "without opening a browser",
        );
        expect(readFileSync(join(configDir, "config.json"), "utf8")).toBe(previous);
      });
    },
  );

  test("Console stdin 子进程读取真实管道并拒绝非原始 token，不回显或写配置", async () => {
    await withIsolatedHome(async (home, configDir) => {
      const previous = readFileSync(join(configDir, "config.json"), "utf8");
      const isolated = buildIsolatedCliEnv({
        overrides: {
          HOME: home,
          BAILIAN_CONFIG_DIR: configDir,
          DO_NOT_TRACK: "1",
          NODE_NO_WARNINGS: "1",
          NODE_OPTIONS: "",
          BAILIAN_E2E_ROUTES: JSON.stringify(
            Object.entries(AUTH_ROUTES).map(([path, exportName]) => ({ path, export: exportName })),
          ),
        },
      });
      try {
        const result = await new Promise<{ code: number | string | undefined; output: string }>(
          (resolve) => {
            const child = execFile(
              process.execPath,
              [
                "--import",
                import.meta.resolve("tsx"),
                fileURLToPath(new URL("./harness/main.ts", import.meta.url)),
                "auth",
                "login",
                "--console",
                "--token-stdin",
                "--console-region",
                "ap-southeast-1",
                "--console-site",
                "international",
              ],
              { env: isolated.env, timeout: 10_000 },
              (error, stdout, stderr) => {
                resolve({ code: error?.code, output: stdout + stderr });
              },
            );
            child.stdin!.on("error", () => {});
            child.stdin!.end("Bearer pipe-secret-placeholder\n");
          },
        );
        expect(result.code, result.output).toBe(2);
        expect(result.output).toContain("stdin must contain one raw console access token");
        expect(result.output).not.toContain("pipe-secret-placeholder");
        expect(readFileSync(join(configDir, "config.json"), "utf8")).toBe(previous);
      } finally {
        isolated.dispose();
      }
    });
  });

  test.each(["success", "rejected", "network", "empty", "oversized"])(
    "Console stdin 导入 %s：验证成功才保存并激活 Profile",
    async (outcome) => {
      await withIsolatedHome(async (home, configDir) => {
        await writeConfigFile({ access_token: "default-token" });
        const previous = { access_token: "old-token", api_key: "sk-kept", access_key_id: "old-ak" };
        await writeConfigFile(previous, "imported");
        const input = Readable.from([
          outcome === "empty"
            ? " \n"
            : outcome === "oversized"
              ? "x".repeat(65537)
              : " pasted-console-token\n",
        ]);
        const stdin = vi
          .spyOn(process, "stdin", "get")
          .mockReturnValue(input as typeof process.stdin);
        const originalFetch = globalThis.fetch;
        let validations = 0;
        globalThis.fetch = async (url, init) => {
          const endpoint = new URL(url instanceof Request ? url.url : url);
          expect(endpoint.hostname).toBe("bailian-singapore-cs.alibabacloud.com");
          expect(endpoint.searchParams.get("api")).toBe(
            "zeldaEasy.cornerstone-portal.cs-console.loginInfo",
          );
          expect(new Headers(init?.headers).get("authorization")).toBe(
            "Bearer pasted-console-token",
          );
          expect(readConfigFile("imported")).toEqual(previous);
          expect(readConfigProfiles().active).toBe("default");
          validations++;
          if (outcome === "network") throw new TypeError("fetch failed");
          return new Response(
            JSON.stringify({
              data:
                outcome === "rejected"
                  ? { success: false, errorCode: "BailianGateway.Login.NotLogined" }
                  : { success: true },
            }),
          );
        };
        try {
          const result = await runCommandInProcess(
            AUTH_ROUTES,
            [
              "auth",
              "login",
              "--console",
              "--token-stdin",
              "--console-site",
              "international",
              "--console-region",
              "ap-southeast-1",
              "--config",
              "imported",
              "--verbose",
            ],
            {
              HOME: home,
              BAILIAN_CONFIG_DIR: configDir,
              NODE_OPTIONS: "",
              HTTP_PROXY: "",
              HTTPS_PROXY: "",
              http_proxy: "",
              https_proxy: "",
            },
          );
          expect(result.stdout + result.stderr).not.toContain("pasted-console-token");
          expect(validations).toBe(["empty", "oversized"].includes(outcome) ? 0 : 1);
          if (outcome === "success") {
            expect(result.exitCode, result.stderr).toBe(0);
            expect(readConfigFile("imported")).toMatchObject({
              ...previous,
              access_token: "pasted-console-token",
              console_site: "international",
              console_region: "ap-southeast-1",
            });
            expect(readConfigProfiles().active).toBe("imported");
          } else {
            expect(result.exitCode, result.stderr).not.toBe(0);
            expect(readConfigFile("imported")).toEqual(previous);
            expect(readConfigProfiles().active).toBe("default");
          }
          expect(readConfigFile().access_token).toBe("default-token");
        } finally {
          stdin.mockRestore();
          input.destroy();
          globalThis.fetch = originalFetch;
        }
      });
    },
  );

  test("auth logout --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(AUTH_ROUTES, ["auth", "logout", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/logout|dry-run|yes/i);
  });

  test("auth status --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(AUTH_ROUTES, ["auth", "status", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/status|output/i);
  });

  test("auth login 缺少 --api-key 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, ["auth", "login", "--quiet"]);
    expect(exitCode, stderr).toBe(2);
    expect(stderr).toMatch(/Choose exactly one login mode/);
  });

  test("auth login --dry-run --api-key 不发起落盘", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "login",
      "--dry-run",
      "--api-key",
      "sk-e2e-dry-run-placeholder",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("Would validate and save API key.");
  });

  test("auth login --dry-run 仍校验显式 Base URL", async () => {
    const { stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "login",
      "--dry-run",
      "--api-key",
      "sk-e2e-dry-run-placeholder",
      "--base-url",
      "ftp://example.com/models",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Invalid model base URL/);
  });

  test("auth login --api-key 通过 /models 校验后原子保存凭证和 Base URL", async () => {
    const configDir = makeE2eOutputDir("auth-api-key-login");
    const login = await runCommandE2e(
      AUTH_ROUTES,
      [
        "auth",
        "login",
        "--api-key",
        "sk-e2e-placeholder",
        "--base-url",
        `${modelsOrigin}/compatible-mode/v1/?source=login#fragment`,
      ],
      {
        BAILIAN_CONFIG_DIR: configDir,
        DASHSCOPE_API_KEY: "",
        DASHSCOPE_BASE_URL: "",
      },
    );
    expect(login.exitCode, login.stderr).toBe(0);
    expect(login.stderr).toMatch(/API key validated and saved to/);

    const config = JSON.parse(readFileSync(join(configDir, "config.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(config.api_key).toBe("sk-e2e-placeholder");
    expect(config.base_url).toBe(modelsOrigin);
  });

  test("auth login --config token-plan 接受 Anthropic SDK Base URL", async () => {
    const configDir = makeE2eOutputDir("auth-token-plan-anthropic-base-url");
    const login = await runCommandE2e(
      AUTH_ROUTES,
      [
        "auth",
        "login",
        "--config",
        "token-plan",
        "--api-key",
        "sk-sp-e2e-placeholder",
        "--base-url",
        `${modelsOrigin}/apps/anthropic?source=sdk#fragment`,
      ],
      {
        BAILIAN_CONFIG_DIR: configDir,
        DASHSCOPE_API_KEY: "",
        DASHSCOPE_BASE_URL: "",
      },
    );
    expect(login.exitCode, login.stderr).toBe(0);

    const config = JSON.parse(readFileSync(join(configDir, "config.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(config["token-plan"]).toMatchObject({
      api_key: "sk-sp-e2e-placeholder",
      base_url: modelsOrigin,
      default_text_model: "qwen3.8-max",
      default_video_model: "happyhorse-1.1-t2v",
      default_image_to_video_model: "happyhorse-1.1-i2v",
      default_reference_to_video_model: "happyhorse-1.1-r2v",
      default_image_model: "wan2.7-image",
      default_speech_model: "qwen-audio-3.0-tts-plus",
      default_speech_recognition_model: "qwen-audio-3.0-asr-flash",
      api_key_capabilities: [
        "text.chat",
        "vision.describe",
        "image.generate",
        "image.edit",
        "speech.recognize",
        "speech.synthesize",
        "video.generate",
        "video.ref",
        "video.task.get",
        "video.download",
      ],
    });
  });

  test("auth login --config token-plan 追加新版 capability preset 且不删除已有能力", async () => {
    const configDir = makeE2eOutputDir("auth-token-plan-preset-login");
    writeFileSync(
      join(configDir, "config.json"),
      JSON.stringify(
        {
          "token-plan": {
            default_text_model: "custom-text-model",
            default_video_model: "custom-video-model",
            default_image_to_video_model: "custom-image-to-video-model",
            default_reference_to_video_model: "custom-reference-to-video-model",
            default_image_model: "custom-image-model",
            api_key_capabilities: ["text.chat", "custom.command"],
          },
        },
        null,
        2,
      ) + "\n",
    );

    const login = await runCommandE2e(
      AUTH_ROUTES,
      [
        "auth",
        "login",
        "--config",
        "token-plan",
        "--api-key",
        "sk-sp-e2e-placeholder",
        "--base-url",
        modelsOrigin,
      ],
      {
        BAILIAN_CONFIG_DIR: configDir,
        DASHSCOPE_API_KEY: "sk-env-must-not-be-persisted",
        DASHSCOPE_BASE_URL: "https://env-must-not-override-preset.example.test",
      },
    );
    expect(login.exitCode, login.stderr).toBe(0);

    const config = JSON.parse(readFileSync(join(configDir, "config.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(config.api_key).toBeUndefined();
    expect(config.active_config).toBe("token-plan");
    expect(config["token-plan"]).toMatchObject({
      api_key: "sk-sp-e2e-placeholder",
      base_url: modelsOrigin,
      default_text_model: "qwen3.8-max",
      default_video_model: "happyhorse-1.1-t2v",
      default_image_to_video_model: "happyhorse-1.1-i2v",
      default_reference_to_video_model: "happyhorse-1.1-r2v",
      default_image_model: "wan2.7-image",
      default_speech_model: "qwen-audio-3.0-tts-plus",
      default_speech_recognition_model: "qwen-audio-3.0-asr-flash",
      api_key_capabilities: [
        "text.chat",
        "custom.command",
        "vision.describe",
        "image.generate",
        "image.edit",
        "speech.recognize",
        "speech.synthesize",
        "video.generate",
        "video.ref",
        "video.task.get",
        "video.download",
      ],
    });
    expect((config["token-plan"] as Record<string, unknown>).base_url).not.toBe(
      "https://env-must-not-override-preset.example.test",
    );
    expect((config["token-plan"] as Record<string, unknown>).api_key).not.toBe(
      "sk-env-must-not-be-persisted",
    );
  });

  test("auth login 根据 sk-sp 前缀自动写入并激活 Token Plan Profile", async () => {
    const configDir = makeE2eOutputDir("auth-token-plan-key-inference");
    writeFileSync(
      join(configDir, "config.json"),
      JSON.stringify(
        {
          active_config: "dev",
          dev: { base_url: "https://dev-profile.example.test" },
        },
        null,
        2,
      ) + "\n",
    );

    const login = await runCommandE2e(
      AUTH_ROUTES,
      ["auth", "login", "--api-key", "sk-sp-e2e-inferred", "--base-url", modelsOrigin],
      {
        BAILIAN_CONFIG_DIR: configDir,
        DASHSCOPE_API_KEY: "",
        DASHSCOPE_BASE_URL: "",
      },
    );
    expect(login.exitCode, login.stderr).toBe(0);

    const config = JSON.parse(readFileSync(join(configDir, "config.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(config.active_config).toBe("token-plan");
    expect(config.api_key).toBeUndefined();
    expect(config.dev).toEqual({ base_url: "https://dev-profile.example.test" });
    expect(config["token-plan"]).toMatchObject({
      api_key: "sk-sp-e2e-inferred",
      base_url: modelsOrigin,
      default_text_model: "qwen3.8-max",
      api_key_capabilities: [
        "text.chat",
        "vision.describe",
        "image.generate",
        "image.edit",
        "speech.recognize",
        "speech.synthesize",
        "video.generate",
        "video.ref",
        "video.task.get",
        "video.download",
      ],
    });
  });

  test("auth login 显式 Profile 和 Base URL 优先且保留 sk-sp 的 Token Plan 预设", async () => {
    const configDir = makeE2eOutputDir("auth-explicit-profile-precedence");
    const login = await runCommandE2e(
      AUTH_ROUTES,
      [
        "auth",
        "login",
        "--config",
        "custom-plan",
        "--api-key",
        "sk-sp-e2e-explicit",
        "--base-url",
        `${modelsOrigin}/compatible-mode/v1`,
      ],
      {
        BAILIAN_CONFIG_DIR: configDir,
        DASHSCOPE_API_KEY: "",
        DASHSCOPE_BASE_URL: "",
      },
    );
    expect(login.exitCode, login.stderr).toBe(0);

    const config = JSON.parse(readFileSync(join(configDir, "config.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(config.active_config).toBe("custom-plan");
    expect(config["custom-plan"]).toMatchObject({
      api_key: "sk-sp-e2e-explicit",
      base_url: modelsOrigin,
      default_text_model: "qwen3.8-max",
      api_key_capabilities: [
        "text.chat",
        "vision.describe",
        "image.generate",
        "image.edit",
        "speech.recognize",
        "speech.synthesize",
        "video.generate",
        "video.ref",
        "video.task.get",
        "video.download",
      ],
    });
    expect(config["token-plan"]).toBeUndefined();
  });

  test("auth login --config token-plan 为显式空白名单追加 capability preset", async () => {
    const configDir = makeE2eOutputDir("auth-token-plan-empty-capabilities-login");
    writeFileSync(
      join(configDir, "config.json"),
      JSON.stringify(
        {
          "token-plan": {
            api_key_capabilities: [],
          },
        },
        null,
        2,
      ) + "\n",
    );

    const login = await runCommandE2e(
      AUTH_ROUTES,
      [
        "auth",
        "login",
        "--config",
        "token-plan",
        "--api-key",
        "sk-sp-e2e-placeholder",
        "--base-url",
        modelsOrigin,
      ],
      {
        BAILIAN_CONFIG_DIR: configDir,
        DASHSCOPE_API_KEY: "",
        DASHSCOPE_BASE_URL: "https://env-ignored-for-persist.example.test",
      },
    );
    expect(login.exitCode, login.stderr).toBe(0);

    const config = JSON.parse(readFileSync(join(configDir, "config.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(config["token-plan"]).toMatchObject({
      api_key_capabilities: [
        "text.chat",
        "vision.describe",
        "image.generate",
        "image.edit",
        "speech.recognize",
        "speech.synthesize",
        "video.generate",
        "video.ref",
        "video.task.get",
        "video.download",
      ],
    });
  });

  test("auth login 普通 Key 保留当前激活的非 Token Plan Profile", async () => {
    const configDir = makeE2eOutputDir("auth-active-profile-login");
    const storedBaseUrl = modelsOrigin;
    writeFileSync(
      join(configDir, "config.json"),
      JSON.stringify(
        {
          active_config: "dev",
          dev: { base_url: storedBaseUrl },
        },
        null,
        2,
      ) + "\n",
    );

    const env = {
      BAILIAN_CONFIG_DIR: configDir,
      DASHSCOPE_API_KEY: "",
      DASHSCOPE_BASE_URL: "",
    };
    const activeLogin = await runCommandE2e(
      AUTH_ROUTES,
      ["auth", "login", "--api-key", "sk-active-placeholder"],
      env,
    );
    expect(activeLogin.exitCode, activeLogin.stderr).toBe(0);

    const config = JSON.parse(readFileSync(join(configDir, "config.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(config.api_key).toBeUndefined();
    expect(config.active_config).toBe("dev");
    expect(config.dev).toEqual({
      api_key: "sk-active-placeholder",
      base_url: storedBaseUrl,
    });
  });

  test("auth login 普通 Key 校验成功后为新 Profile 保存匹配的 Base URL", async () => {
    const configDir = makeE2eOutputDir("auth-standard-key-without-base-url");
    const login = await runCommandE2e(
      AUTH_ROUTES,
      [
        "auth",
        "login",
        "--config",
        "standard",
        "--api-key",
        "sk-standard-placeholder",
        "--base-url",
        modelsOrigin,
      ],
      {
        BAILIAN_CONFIG_DIR: configDir,
        DASHSCOPE_API_KEY: "",
        DASHSCOPE_BASE_URL: "",
      },
    );
    expect(login.exitCode, login.stderr).toBe(0);

    const config = JSON.parse(readFileSync(join(configDir, "config.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(config.active_config).toBe("standard");
    expect(config["standard"]).toEqual({
      api_key: "sk-standard-placeholder",
      base_url: modelsOrigin,
    });
  });

  test("auth login /models 拒绝 Key 时不写配置、不激活 Profile", async () => {
    const configDir = makeE2eOutputDir("auth-api-key-validation-rejected");
    const login = await runCommandE2e(
      AUTH_ROUTES,
      [
        "auth",
        "login",
        "--config",
        "rejected",
        "--api-key",
        "sk-rejected-placeholder",
        "--base-url",
        modelsOrigin,
      ],
      {
        BAILIAN_CONFIG_DIR: configDir,
        DASHSCOPE_API_KEY: "",
        DASHSCOPE_BASE_URL: "",
      },
    );
    expect(login.exitCode).toBe(3);
    expect(login.stderr).toMatch(/API key validation failed/);
    expect(existsSync(join(configDir, "config.json"))).toBe(false);
  });

  test("auth login --api-key 非法 Base URL 失败时不留下半配置", async () => {
    const configDir = makeE2eOutputDir("auth-api-key-login-failure");
    const login = await runCommandE2e(
      AUTH_ROUTES,
      [
        "auth",
        "login",
        "--config",
        "failed-profile",
        "--api-key",
        "sk-invalid",
        "--base-url",
        "ftp://example.com/models",
      ],
      {
        BAILIAN_CONFIG_DIR: configDir,
        DASHSCOPE_API_KEY: "",
        DASHSCOPE_BASE_URL: "",
      },
    );
    expect(login.exitCode).not.toBe(0);
    expect(login.stderr).toMatch(/Invalid model base URL/);
    expect(existsSync(join(configDir, "config.json"))).toBe(false);
  });

  test("auth login --dry-run 覆盖全局参数 --output json --timeout", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "login",
      "--dry-run",
      "--api-key",
      "sk-e2e-dry-run-placeholder",
      "--output",
      "json",
      "--timeout",
      "120",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("Would validate and save API key.");
  });

  test("auth login 缺少密钥且 --output json 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "login",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    const err = JSON.parse(stderr.trim()) as { error?: { code?: number; message?: string } };
    expect(err.error?.code).toBe(2);
    expect(err.error?.message).toMatch(/Choose exactly one login mode/);
  });

  test("auth logout --dry-run 不写入配置", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "logout",
      "--dry-run",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("No changes made.");
    expect(stderr).not.toContain("Cleared api_key");
  });

  test("auth logout --dry-run --quiet", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "logout",
      "--dry-run",
      "--quiet",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("No changes made.");
  });

  test("auth logout --dry-run --output json（不清除密钥）", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "logout",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("No changes made.");
    expect(stderr).not.toContain("Cleared api_key");
  });

  test("auth status 在只有控制台会话时标明模型 API Key 仍未配置", async () => {
    const configDir = makeE2eOutputDir("auth-status-console-only");
    writeFileSync(
      join(configDir, "config.json"),
      JSON.stringify({
        language: "zh-CN",
        access_token: "console-token-placeholder",
        console_region: "cn-beijing",
        console_site: "domestic",
      }),
    );
    const env = {
      BAILIAN_CONFIG_DIR: configDir,
      DASHSCOPE_API_KEY: undefined,
      DASHSCOPE_BASE_URL: undefined,
      ALIBABA_CLOUD_ACCESS_KEY_ID: undefined,
      ALIBABA_CLOUD_ACCESS_KEY_SECRET: undefined,
      ALIBABA_CLOUD_SECURITY_TOKEN: undefined,
    };

    const json = await runCommandE2e(AUTH_ROUTES, ["auth", "status", "--output", "json"], env);
    expect(json.exitCode, json.stderr).toBe(0);
    const data = parseStdoutJson<{
      authenticated?: boolean;
      api_key?: unknown;
      console?: { region?: string };
      hint?: string;
    }>(json.stdout);
    expect(data.authenticated).toBe(true);
    expect(data.api_key).toBeUndefined();
    expect(data.console?.region).toBe("cn-beijing");
    expect(data.hint).toContain("尚未配置模型 API Key");
    expect(data.hint).toContain("bl auth login --api-key <key>");
    expect(json.stdout).not.toContain("console-token-placeholder");

    const text = await runCommandE2e(AUTH_ROUTES, ["auth", "status", "--output", "text"], env);
    expect(text.exitCode, text.stderr).toBe(0);
    expect(text.stdout).toContain("API key (model):  not configured");
    expect(text.stdout).toContain("尚未配置模型 API Key");
  });

  test("auth logout 清除当前 Config 的全部凭证和 Base URL，保留普通配置", async () => {
    const configDir = makeE2eOutputDir("auth-logout-all");
    writeFileSync(
      join(configDir, "config.json"),
      JSON.stringify(
        {
          api_key: "sk-e2e-placeholder",
          base_url: "https://model.example.com",
          access_token: "console-token-placeholder",
          access_key_id: "LTAI-e2e-placeholder",
          access_key_secret: "secret-e2e-placeholder",
          security_token: "sts-e2e-placeholder",
          output: "json",
        },
        null,
        2,
      ) + "\n",
    );

    const { stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, ["auth", "logout"], {
      BAILIAN_CONFIG_DIR: configDir,
    });
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("api_key / base_url / access_token");

    const config = JSON.parse(readFileSync(join(configDir, "config.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(config).toEqual({ output: "json" });
  });

  test.skipIf(!isDashScopeE2EReady())("auth status 文本输出", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "status",
      "--output",
      "text",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toMatch(
      /Authentication Status|API key:|Console token:|DashScope API:|Console gateway:/,
    );
  });

  test.skipIf(!isDashScopeE2EReady())("auth status --output json", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "status",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      authenticated?: boolean;
      api_key?: { source?: string; masked?: string; base_url?: string };
    }>(stdout);
    expect(data.authenticated).toBe(true);
    expect(data.api_key?.source).toBeDefined();
  });

  test.skipIf(!isDashScopeE2EReady())(
    "auth status --output json --quiet(base_url 经 env 指定;凭证域 flag 对 status 不可见)",
    async () => {
      const { stdout, stderr, exitCode } = await runCommandE2e(
        AUTH_ROUTES,
        ["auth", "status", "--output", "json", "--quiet"],
        { DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com" },
      );
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ authenticated?: boolean; api_key?: unknown }>(stdout);
      expect(data.authenticated).toBe(true);
      expect(data.api_key).toBeDefined();
    },
  );

  test("auth status 不接受凭证域覆盖 flag(--base-url 报 Unknown flag)", async () => {
    const { stderr, exitCode } = await runCommandE2e(AUTH_ROUTES, [
      "auth",
      "status",
      "--base-url",
      "https://x.test",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/(?:Unknown flag|未知参数).*--base-url/);
  });

  test("auth status 展示 env OpenAPI AK/SK 且不接受 OpenAPI flag 覆盖", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(
      AUTH_ROUTES,
      ["auth", "status", "--output", "json"],
      {
        ALIBABA_CLOUD_ACCESS_KEY_ID: "LTAI-e2e-placeholder",
        ALIBABA_CLOUD_ACCESS_KEY_SECRET: "secret-e2e-placeholder",
      },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      authenticated?: boolean;
      openapi?: { source?: string; access_key_id?: string; access_key_secret?: string };
    }>(stdout);
    expect(data.authenticated).toBe(true);
    expect(data.openapi?.source).toBe("env");
    expect(data.openapi?.access_key_id).not.toBe("LTAI-e2e-placeholder");
    expect(data.openapi?.access_key_secret).not.toBe("secret-e2e-placeholder");

    const denied = await runCommandE2e(AUTH_ROUTES, ["auth", "status", "--access-key-id", "ak"]);
    expect(denied.exitCode).toBe(2);
    expect(denied.stderr).toMatch(/(?:Unknown flag|未知参数).*--access-key-id/);
  });

  test.skipIf(!isOpenApiE2EReady())(
    "auth login --open-api 使用环境中的真实 AK/SK，持久化后支持单独 logout",
    async () => {
      const accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID!.trim();
      const accessKeySecret = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET!.trim();
      const configDir = mkdtempSync(join(tmpdir(), "bl-auth-openapi-login-"));
      const env = {
        BAILIAN_CONFIG_DIR: configDir,
        ALIBABA_CLOUD_ACCESS_KEY_ID: "",
        ALIBABA_CLOUD_ACCESS_KEY_SECRET: "",
      };

      try {
        const login = await runCommandE2e(
          AUTH_ROUTES,
          [
            "auth",
            "login",
            "--open-api",
            "--access-key-id",
            accessKeyId,
            "--access-key-secret",
            accessKeySecret,
          ],
          env,
        );
        expect(login.exitCode, login.stderr).toBe(0);
        expect(login.stderr).toMatch(/OpenAPI credentials saved/);

        const config = JSON.parse(readFileSync(join(configDir, "config.json"), "utf8")) as Record<
          string,
          unknown
        >;
        // 只断言布尔结果，避免失败 diff 把真实凭证打印到测试日志。
        expect(config.access_key_id === accessKeyId).toBe(true);
        expect(config.access_key_secret === accessKeySecret).toBe(true);
        expect(config.openapi_access_key_id).toBeUndefined();
        expect(config.openapi_access_key_secret).toBeUndefined();

        const status = await runCommandE2e(
          AUTH_ROUTES,
          ["auth", "status", "--output", "json"],
          env,
        );
        expect(status.exitCode, status.stderr).toBe(0);
        const data = parseStdoutJson<{
          authenticated?: boolean;
          openapi?: { source?: string; access_key_id?: string; access_key_secret?: string };
        }>(status.stdout);
        expect(data.authenticated).toBe(true);
        expect(data.openapi?.source).toBe("config");
        expect(data.openapi?.access_key_id === accessKeyId).toBe(false);
        expect(data.openapi?.access_key_secret === accessKeySecret).toBe(false);

        const logout = await runCommandE2e(AUTH_ROUTES, ["auth", "logout", "--open-api"], env);
        expect(logout.exitCode, logout.stderr).toBe(0);
        expect(logout.stderr).toMatch(/Cleared access_key_id/);

        const after = await runCommandE2e(AUTH_ROUTES, ["auth", "status", "--output", "json"], env);
        expect(after.exitCode, after.stderr).toBe(0);
        const afterData = parseStdoutJson<{ authenticated?: boolean; openapi?: unknown }>(
          after.stdout,
        );
        expect(afterData.openapi).toBeUndefined();
      } finally {
        rmSync(configDir, { recursive: true, force: true });
      }
    },
  );
});
