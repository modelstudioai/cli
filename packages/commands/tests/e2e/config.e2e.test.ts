import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e } from "./helpers.ts";
import { CONFIG_ROUTES } from "./topic-routes.ts";

/**
 * Config 相关 E2E
 */

describe("e2e: config", () => {
  test("config show --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, ["config", "show", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/show|config/i);
  });

  test("config set --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, ["config", "set", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/set|--key|--value/i);
  });

  test("config list/use --help 正常退出", async () => {
    const listResult = await runCommandE2e(CONFIG_ROUTES, ["config", "list", "--help"]);
    expect(listResult.exitCode, listResult.stderr).toBe(0);
    expect(listResult.stderr).toMatch(/list|active|profile/i);

    const useResult = await runCommandE2e(CONFIG_ROUTES, ["config", "use", "--help"]);
    expect(useResult.exitCode, useResult.stderr).toBe(0);
    expect(useResult.stderr).toMatch(/use|--name|active/i);
  });

  test("config ui --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, ["config", "ui", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/ui|--port|--no-open|web/i);
  });

  test("config ui --dry-run 打印计划不起服务", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "ui",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ host?: string; routes?: string[] }>(stdout);
    expect(data.host).toBe("127.0.0.1");
    expect(Array.isArray(data.routes)).toBe(true);
  });

  test("config show --output json", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "show",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      config_file?: string;
      base_url?: string;
      timeout?: number;
    }>(stdout);
    expect(data.config_file).toBeDefined();
    expect(data.base_url).toBeDefined();
    expect(data.timeout).toBeDefined();
  });

  test("config show --output text", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "show",
      "--output",
      "text",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toMatch(/config_file|timeout|base_url/i);
  });

  test("config show 脱敏 security_token", async () => {
    const configDir = mkdtempSync(join(tmpdir(), "bl-config-show-secret-"));
    try {
      const securityToken = "sts-sensitive-token";
      writeFileSync(
        join(configDir, "config.json"),
        JSON.stringify({ security_token: securityToken }, null, 2) + "\n",
      );

      const { stdout, stderr, exitCode } = await runCommandE2e(
        CONFIG_ROUTES,
        ["config", "show", "--output", "json"],
        { BAILIAN_CONFIG_DIR: configDir },
      );
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ security_token?: string }>(stdout);
      expect(data.security_token).toBe("sts-...oken");
      expect(stdout).not.toContain(securityToken);
    } finally {
      rmSync(configDir, { recursive: true, force: true });
    }
  });

  test("config set 缺少 --key / --value 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, ["config", "set", "--quiet"]);
    expect(exitCode, stderr).toBe(2);
    expect(stderr).toMatch(/--key|--value|Usage:/i);
  });

  test("config use 缺少 --name 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, ["config", "use", "--quiet"]);
    expect(exitCode, stderr).toBe(2);
    expect(stderr).toMatch(/--name|Usage:/i);
  });

  test("config use 持久化激活项，config list 展示激活状态", async () => {
    const configDir = mkdtempSync(join(tmpdir(), "bl-config-use-"));
    try {
      const configPath = join(configDir, "config.json");
      writeFileSync(configPath, JSON.stringify({ dev: { output: "json" } }, null, 2) + "\n");
      const env = { BAILIAN_CONFIG_DIR: configDir };

      const useResult = await runCommandE2e(
        CONFIG_ROUTES,
        ["config", "use", "--name", "dev", "--output", "json"],
        env,
      );
      expect(useResult.exitCode, useResult.stderr).toBe(0);
      expect(parseStdoutJson<{ active_config?: string }>(useResult.stdout).active_config).toBe(
        "dev",
      );
      expect(JSON.parse(readFileSync(configPath, "utf8")).active_config).toBe("dev");

      const listResult = await runCommandE2e(
        CONFIG_ROUTES,
        ["config", "list", "--output", "json"],
        env,
      );
      expect(listResult.exitCode, listResult.stderr).toBe(0);
      const listData = parseStdoutJson<{
        active_config?: string;
        profiles?: string[];
      }>(listResult.stdout);
      expect(listData.active_config).toBe("dev");
      expect(listData.profiles).toEqual(["default", "dev"]);
    } finally {
      rmSync(configDir, { recursive: true, force: true });
    }
  });

  test("config use --dry-run 校验目标但不修改激活项", async () => {
    const configDir = mkdtempSync(join(tmpdir(), "bl-config-use-dry-run-"));
    try {
      const configPath = join(configDir, "config.json");
      writeFileSync(configPath, JSON.stringify({ dev: { output: "json" } }, null, 2) + "\n");
      const result = await runCommandE2e(
        CONFIG_ROUTES,
        ["config", "use", "--name", "dev", "--dry-run", "--output", "json"],
        { BAILIAN_CONFIG_DIR: configDir },
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(parseStdoutJson<{ would_activate?: string }>(result.stdout).would_activate).toBe(
        "dev",
      );
      expect(JSON.parse(readFileSync(configPath, "utf8")).active_config).toBeUndefined();
    } finally {
      rmSync(configDir, { recursive: true, force: true });
    }
  });

  test("config use 拒绝不存在的 Profile 且不写入状态", async () => {
    const configDir = mkdtempSync(join(tmpdir(), "bl-config-use-missing-"));
    try {
      const configPath = join(configDir, "config.json");
      writeFileSync(configPath, JSON.stringify({ output: "text" }, null, 2) + "\n");
      const result = await runCommandE2e(
        CONFIG_ROUTES,
        ["config", "use", "--name", "missing", "--output", "json"],
        { BAILIAN_CONFIG_DIR: configDir },
      );
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toMatch(/does not exist/);
      expect(JSON.parse(readFileSync(configPath, "utf8")).active_config).toBeUndefined();
    } finally {
      rmSync(configDir, { recursive: true, force: true });
    }
  });

  test("config set 非法 key 时退出为用法错误", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "set",
      "--key",
      "not-a-real-key",
      "--value",
      "x",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Invalid config key|not-a-real-key/i);
  });

  test("config set 非法 output", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "set",
      "--key",
      "output",
      "--value",
      "yaml",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Invalid output|text, json/i);
  });

  test("config set 非法 timeout", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "set",
      "--key",
      "timeout",
      "--value",
      "0",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Invalid timeout|positive/i);
  });

  test("config set 归一化 Base URL 并拒绝非法协议", async () => {
    const configDir = mkdtempSync(join(tmpdir(), "bl-config-base-url-"));
    try {
      const setResult = await runCommandE2e(
        CONFIG_ROUTES,
        [
          "config",
          "set",
          "--key",
          "base_url",
          "--value",
          "https://proxy.example.com/bailian/compatible-mode/v1/?x=1#fragment",
          "--output",
          "json",
        ],
        { BAILIAN_CONFIG_DIR: configDir },
      );
      expect(setResult.exitCode, setResult.stderr).toBe(0);
      expect(parseStdoutJson<{ base_url?: string }>(setResult.stdout).base_url).toBe(
        "https://proxy.example.com/bailian",
      );
      expect(JSON.parse(readFileSync(join(configDir, "config.json"), "utf8")).base_url).toBe(
        "https://proxy.example.com/bailian",
      );

      const invalidResult = await runCommandE2e(
        CONFIG_ROUTES,
        ["config", "set", "--key", "base_url", "--value", "ftp://example.com/models"],
        { BAILIAN_CONFIG_DIR: configDir },
      );
      expect(invalidResult.exitCode).toBe(2);
      expect(invalidResult.stderr).toMatch(/Invalid model base URL/);
    } finally {
      rmSync(configDir, { recursive: true, force: true });
    }
  });

  test("config set --dry-run 不落盘（仅输出 would_set）", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "set",
      "--dry-run",
      "--key",
      "output",
      "--value",
      "json",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ would_set?: { output?: string } }>(stdout);
    expect(data.would_set?.output).toBe("json");
  });

  test("config set --dry-run 支持连字符别名 key", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "set",
      "--dry-run",
      "--key",
      "default-text-model",
      "--value",
      "qwen3.7-max",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      would_set?: { default_text_model?: string };
    }>(stdout);
    expect(data.would_set?.default_text_model).toBe("qwen3.7-max");
  });

  test("config set --dry-run 支持图生视频默认模型别名", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "set",
      "--dry-run",
      "--key",
      "default-image-to-video-model",
      "--value",
      "happyhorse-1.1-i2v",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      would_set?: { default_image_to_video_model?: string };
    }>(stdout);
    expect(data.would_set?.default_image_to_video_model).toBe("happyhorse-1.1-i2v");
  });

  test("config set --dry-run 支持参考生视频默认模型别名", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "set",
      "--dry-run",
      "--key",
      "default-reference-to-video-model",
      "--value",
      "happyhorse-1.1-r2v",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      would_set?: { default_reference_to_video_model?: string };
    }>(stdout);
    expect(data.would_set?.default_reference_to_video_model).toBe("happyhorse-1.1-r2v");
  });

  test("config set --dry-run 展示归一化后的 Base URL", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "set",
      "--dry-run",
      "--key",
      "base-url",
      "--value",
      "https://proxy.example.com/apps/anthropic/?x=1#fragment",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ would_set?: { base_url?: string } }>(stdout);
    expect(data.would_set?.base_url).toBe("https://proxy.example.com");
  });

  test("config set --dry-run 支持 AccessKey 短字段别名", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "set",
      "--dry-run",
      "--key",
      "access-key-id",
      "--value",
      "LTAI-config-placeholder",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ would_set?: { access_key_id?: string } }>(stdout);
    expect(data.would_set?.access_key_id).toBe("LTAI-config-placeholder");
  });

  test("config set 不接受旧 OpenAPI AccessKey 字段名", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "set",
      "--key",
      "openapi_access_key_id",
      "--value",
      "LTAI-config-placeholder",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Invalid config key|openapi_access_key_id/);
  });

  test("config agent --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, ["config", "agent", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/agent|--base-url|--model/i);
  });

  test("config agent 缺少 --api-key/--key 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "agent",
      "--agent",
      "claude-code",
      "--base-url",
      "https://dashscope.aliyuncs.com/apps/anthropic",
      "--model",
      "qwen3-max",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--api-key|--key|Usage:/i);
  });

  test("config agent --api-key 与 --key 同传时报用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "agent",
      "--agent",
      "claude-code",
      "--base-url",
      "https://dashscope.aliyuncs.com/apps/anthropic",
      "--api-key",
      "sk-placeholder",
      "--key",
      "o1_AbC123kaQ9JHCXF2GepMW4oJTD7ODPw_Hx",
      "--model",
      "qwen3-max",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/mutually exclusive|--api-key/i);
  });

  test("config agent --key 非法值时报用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "agent",
      "--agent",
      "claude-code",
      "--base-url",
      "https://dashscope.aliyuncs.com/apps/anthropic",
      "--key",
      "not-an-encoded-key",
      "--model",
      "qwen3-max",
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Invalid obfuscated API key|o1_/i);
  });

  test("config agent --key 合法值 --dry-run 解码成功且输出脱敏", async () => {
    const home = mkdtempSync(join(tmpdir(), "bl-config-agent-key-"));
    try {
      const { stdout, stderr, exitCode } = await runCommandE2e(
        CONFIG_ROUTES,
        [
          "config",
          "agent",
          "--agent",
          "claude-code",
          "--base-url",
          "https://dashscope.aliyuncs.com/apps/anthropic",
          "--key",
          // encode("sk-e2e-key-placeholder", salt "AbC123") 的固定产物
          "o1_AbC123kaQ9JHCXF2GepMW4oJTD7ODPw_Hx",
          "--model",
          "qwen3-max",
          "--dry-run",
          "--output",
          "json",
        ],
        { HOME: home },
      );
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ agent?: string; api_key?: string }>(stdout);
      expect(data.agent).toBe("claude-code");
      // 解码后的真实 key 不得明文出现，且脱敏值非空
      expect(stdout).not.toContain("sk-e2e-key-placeholder");
      expect(data.api_key).toBeTruthy();
      expect(existsSync(join(home, ".claude", "settings.json"))).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("config agent --region 转为 base URL，--dry-run 成功", async () => {
    const home = mkdtempSync(join(tmpdir(), "bl-config-agent-region-"));
    try {
      const { stdout, stderr, exitCode } = await runCommandE2e(
        CONFIG_ROUTES,
        [
          "config",
          "agent",
          "--agent",
          "qwen-code",
          "--region",
          "cn-beijing",
          "--api-key",
          "sk-region-placeholder",
          "--model",
          "qwen3.8-max-preview",
          "--dry-run",
          "--output",
          "json",
        ],
        { HOME: home },
      );
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ agent?: string; base_url?: string }>(stdout);
      expect(data.agent).toBe("qwen-code");
      expect(data.base_url).toBe(
        "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("config agent --base-url 与 --region 同传时报用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "agent",
      "--agent",
      "qwen-code",
      "--base-url",
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "--region",
      "cn-beijing",
      "--api-key",
      "sk-placeholder",
      "--model",
      "qwen3-coder-plus",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/mutually exclusive|--base-url|--region/i);
  });

  test("config agent 既缺 --base-url 又缺 --region 时报用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "agent",
      "--agent",
      "qwen-code",
      "--api-key",
      "sk-placeholder",
      "--model",
      "qwen3-coder-plus",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--base-url|--region|Usage:/i);
  });

  test("config agent 非法 --agent 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(CONFIG_ROUTES, [
      "config",
      "agent",
      "--agent",
      "not-an-agent",
      "--base-url",
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "--api-key",
      "sk-placeholder",
      "--model",
      "qwen3-max",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/not-an-agent|claude-code|agent/i);
  });

  test("config agent --dry-run 输出脱敏信息且不写盘", async () => {
    const home = mkdtempSync(join(tmpdir(), "bl-config-agent-dry-"));
    try {
      const { stdout, stderr, exitCode } = await runCommandE2e(
        CONFIG_ROUTES,
        [
          "config",
          "agent",
          "--agent",
          "claude-code",
          "--base-url",
          "https://dashscope.aliyuncs.com/apps/anthropic",
          "--api-key",
          "sk-secret-placeholder",
          "--model",
          "qwen3-max",
          "--dry-run",
          "--output",
          "json",
        ],
        { HOME: home },
      );
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{
        agent?: string;
        base_url?: string;
        model?: string;
        api_key?: string;
      }>(stdout);
      expect(data.agent).toBe("claude-code");
      expect(data.base_url).toBe("https://dashscope.aliyuncs.com/apps/anthropic");
      expect(data.model).toBe("qwen3-max");
      expect(stdout).not.toContain("sk-secret-placeholder");
      expect(existsSync(join(home, ".claude", "settings.json"))).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("config agent codex 写入 config.toml 与 auth.json（官方 env_key 结构）", async () => {
    const home = mkdtempSync(join(tmpdir(), "bl-config-agent-codex-"));
    try {
      const { stderr, exitCode } = await runCommandE2e(
        CONFIG_ROUTES,
        [
          "config",
          "agent",
          "--agent",
          "codex",
          "--base-url",
          "https://dashscope.aliyuncs.com/compatible-mode/v1",
          "--api-key",
          "sk-codex-placeholder",
          "--model",
          "qwen3-coder-plus",
        ],
        { HOME: home },
      );
      expect(exitCode, stderr).toBe(0);
      const toml = readFileSync(join(home, ".codex", "config.toml"), "utf8");
      expect(toml).toContain('model_provider = "bailian-cli"');
      expect(toml).toContain('env_key = "OPENAI_API_KEY"');
      expect(toml).toContain("requires_openai_auth = true");
      // 默认即 responses（新版 Codex 已不支持 chat）
      expect(toml).toContain('wire_api = "responses"');
      const auth = JSON.parse(readFileSync(join(home, ".codex", "auth.json"), "utf8"));
      expect(auth.OPENAI_API_KEY).toBe("sk-codex-placeholder");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("config agent hermes 写入官方扁平 model.* 结构", async () => {
    const home = mkdtempSync(join(tmpdir(), "bl-config-agent-hermes-"));
    try {
      const { stderr, exitCode } = await runCommandE2e(
        CONFIG_ROUTES,
        [
          "config",
          "agent",
          "--agent",
          "hermes",
          "--base-url",
          "https://dashscope.aliyuncs.com/compatible-mode/v1",
          "--api-key",
          "sk-hermes-placeholder",
          "--model",
          "qwen3-coder-plus",
        ],
        { HOME: home },
      );
      expect(exitCode, stderr).toBe(0);
      const yamlText = readFileSync(join(home, ".hermes", "config.yaml"), "utf8");
      expect(yamlText).toContain("default: qwen3-coder-plus");
      expect(yamlText).toContain("provider: custom");
      expect(yamlText).toContain("base_url: https://dashscope.aliyuncs.com/compatible-mode/v1");
      expect(yamlText).toContain("api_key: sk-hermes-placeholder");
      // OpenAI 兼容端点不写 api_mode
      expect(yamlText).not.toContain("api_mode");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
