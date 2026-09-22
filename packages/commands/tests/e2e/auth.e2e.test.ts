import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { createServer, type Server } from "http";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import {
  isDashScopeE2EReady,
  isOpenApiE2EReady,
  makeE2eOutputDir,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
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
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/Unknown flag.*--base-url/);
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
    expect(denied.exitCode).not.toBe(0);
    expect(denied.stderr).toMatch(/Unknown flag.*--access-key-id/);
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
