import { describe, expect, test } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSandboxEnv, prepareTaskHome } from "../src/index.ts";
import { withIsolatedHome } from "./helpers/isolation.ts";

const POSIX_INPUT = {
  homeDir: "/task/home",
  tmpDir: "/task/tmp",
  cacheDir: "/task/cache",
  runtimeRoot: "/runtime/rl/abc",
  apiKey: "sk-test-key",
  proxyPort: 8080,
  platform: "linux" as NodeJS.Platform,
  hostEnv: {} as Record<string, string | undefined>,
};

describe("buildSandboxEnv", () => {
  test("injects credential, proxy and python hardening variables", () => {
    const env = buildSandboxEnv({ ...POSIX_INPUT, baseUrl: "https://example.com" });
    expect(env.DASHSCOPE_API_KEY).toBe("sk-test-key");
    expect(env.DASHSCOPE_HTTP_BASE_URL).toBe("https://example.com");
    expect(env.HTTP_PROXY).toBe("http://127.0.0.1:8080");
    expect(env.HTTPS_PROXY).toBe("http://127.0.0.1:8080");
    expect(env.NO_PROXY).toBe("");
    expect(env.PYTHONDONTWRITEBYTECODE).toBe("1");
    expect(env.XDG_CACHE_HOME).toBe("/task/cache");
    expect(env.LOG_LEVEL).toBe("info");
  });

  test("omits base url when not provided", () => {
    const env = buildSandboxEnv(POSIX_INPUT);
    expect(env.DASHSCOPE_HTTP_BASE_URL).toBeUndefined();
  });

  test("does not inherit credential / hijack variables from host env", () => {
    const env = buildSandboxEnv({
      ...POSIX_INPUT,
      hostEnv: {
        DASHSCOPE_CONFIG: "/real/home/.dashscope",
        DASHSCOPE_API_KEY_FILE_PATH: "/real/key",
        PYTHONPATH: "/evil",
        PYTHONHOME: "/evil",
        SSH_AUTH_SOCK: "/tmp/sock",
        AWS_SECRET_ACCESS_KEY: "secret",
        ALIBABA_CLOUD_ACCESS_KEY_SECRET: "secret",
        HTTPS_PROXY: "http://user-proxy:1080",
      },
    });
    for (const key of [
      "DASHSCOPE_CONFIG",
      "DASHSCOPE_API_KEY_FILE_PATH",
      "PYTHONPATH",
      "PYTHONHOME",
      "SSH_AUTH_SOCK",
      "AWS_SECRET_ACCESS_KEY",
      "ALIBABA_CLOUD_ACCESS_KEY_SECRET",
    ]) {
      expect(env[key]).toBeUndefined();
    }
    // 代理被强制重写为本地白名单代理，而非继承用户代理。
    expect(env.HTTPS_PROXY).toBe("http://127.0.0.1:8080");
  });

  test("injects controlled sdkEnv (FC_PYPI_LIB) without inheriting it from host", () => {
    const env = buildSandboxEnv({
      ...POSIX_INPUT,
      sdkEnv: { FC_PYPI_LIB: "dashscope==1.25.23" },
      hostEnv: { FC_PYPI_LIB: "dashscope==9.9.9" },
    });
    // 受控注入优先，宿主同名变量绝不继承。
    expect(env.FC_PYPI_LIB).toBe("dashscope==1.25.23");
  });

  test("omits FC_PYPI_LIB when sdkEnv is not provided", () => {
    const env = buildSandboxEnv({
      ...POSIX_INPUT,
      hostEnv: { FC_PYPI_LIB: "dashscope==9.9.9" },
    });
    expect(env.FC_PYPI_LIB).toBeUndefined();
  });

  test("POSIX redirects HOME / TMPDIR and builds a minimal PATH", () => {
    const env = buildSandboxEnv({ ...POSIX_INPUT, hostEnv: { LANG: "en_US.UTF-8" } });
    expect(env.HOME).toBe("/task/home");
    expect(env.TMPDIR).toBe("/task/tmp");
    expect(env.PATH).toBe("/runtime/rl/abc/bin:/usr/bin:/bin");
    expect(env.LANG).toBe("en_US.UTF-8");
    expect(env.USERPROFILE).toBeUndefined();
  });

  test("win32 redirects the three home variables consistently", () => {
    const env = buildSandboxEnv({
      ...POSIX_INPUT,
      homeDir: "C:\\task\\home",
      tmpDir: "C:\\task\\tmp",
      runtimeRoot: "C:\\runtime\\rl\\abc",
      platform: "win32",
      hostEnv: { SystemRoot: "C:\\Windows" },
    });
    expect(env.USERPROFILE).toBe("C:\\task\\home");
    expect(env.HOMEDRIVE).toBe("C:");
    expect(env.HOMEPATH).toBe("\\task\\home");
    expect(env.TEMP).toBe("C:\\task\\tmp");
    expect(env.TMP).toBe("C:\\task\\tmp");
    expect(env.SystemRoot).toBe("C:\\Windows");
    expect(env.HOME).toBeUndefined();
  });
});

describe("prepareTaskHome", () => {
  test("writes a controlled config.toml without persisting the API key", async () => {
    await withIsolatedHome(async (home) => {
      const taskHome = join(home, "task-home");
      const configPath = prepareTaskHome(taskHome, "https://example.com");
      const content = readFileSync(configPath, "utf8");
      expect(configPath).toBe(join(taskHome, ".dashscope", "config.toml"));
      expect(content).toContain('base_url = "https://example.com"');
      expect(content).not.toContain("sk-");
      expect(content).not.toContain("api_key");
    });
  });
});
