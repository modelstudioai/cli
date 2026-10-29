import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCli } from "./helpers.ts";

function withTempConfigDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "bl-config-profile-"));
  return fn(dir).finally(() => {
    rmSync(dir, { recursive: true, force: true });
  });
}

function writeConfig(dir: string, data: Record<string, unknown>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "config.json"), JSON.stringify(data, null, 2) + "\n");
}

describe("e2e: named config", () => {
  test("根帮助展示 --config 全局标志", async () => {
    const { stderr, exitCode } = await runCli(["--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--config <name>/);
  });

  test("config set --config 写入命名 block 且不影响默认配置", async () => {
    await withTempConfigDir(async (dir) => {
      writeConfig(dir, { output: "text", api_key: "sk-default" });

      const setResult = await runCli(
        [
          "config",
          "set",
          "--config",
          "dev",
          "--key",
          "output",
          "--value",
          "json",
          "--output",
          "json",
        ],
        { BAILIAN_CONFIG_DIR: dir },
      );
      expect(setResult.exitCode, setResult.stderr).toBe(0);
      const setData = parseStdoutJson<{
        output?: string;
        config?: string;
        config_file?: string;
      }>(setResult.stdout);
      expect(setData.output).toBe("json");
      expect(setData.config).toBe("dev");
      expect(setData.config_file).toBe(join(dir, "config.json"));

      const raw = JSON.parse(readFileSync(join(dir, "config.json"), "utf8")) as Record<
        string,
        unknown
      >;
      expect(raw.output).toBe("text");
      expect((raw.dev as Record<string, unknown>).output).toBe("json");
    });
  });

  test("config show --config 只展示命名 block", async () => {
    await withTempConfigDir(async (dir) => {
      writeConfig(dir, {
        output: "text",
        api_key: "sk-default",
        dev: { output: "json", access_token: "tok-dev" },
      });

      const { stdout, stderr, exitCode } = await runCli(
        ["config", "show", "--config", "dev", "--output", "json"],
        { BAILIAN_CONFIG_DIR: dir },
      );
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<Record<string, unknown>>(stdout);
      expect(data.config).toBe("dev");
      expect(data.config_file).toBe(join(dir, "config.json"));
      expect(data.output).toBe("json");
      expect(data.access_token).toBeDefined();
      expect(data.api_key).toBeUndefined();
    });
  });

  test("auth status --config 不继承默认凭证", async () => {
    await withTempConfigDir(async (dir) => {
      writeConfig(dir, { api_key: "sk-default", dev: { output: "json" } });

      const devStatus = await runCli(["auth", "status", "--config", "dev", "--output", "json"], {
        BAILIAN_CONFIG_DIR: dir,
        DASHSCOPE_API_KEY: "",
        ALIBABA_CLOUD_ACCESS_KEY_ID: "",
        ALIBABA_CLOUD_ACCESS_KEY_SECRET: "",
      });
      expect(devStatus.exitCode, devStatus.stderr).toBe(0);
      const devData = parseStdoutJson<Record<string, unknown>>(devStatus.stdout);
      expect(devData.authenticated).toBe(false);
      expect(devData.config).toBe("dev");

      const defaultStatus = await runCli(["auth", "status", "--output", "json"], {
        BAILIAN_CONFIG_DIR: dir,
        DASHSCOPE_API_KEY: "",
        ALIBABA_CLOUD_ACCESS_KEY_ID: "",
        ALIBABA_CLOUD_ACCESS_KEY_SECRET: "",
      });
      expect(defaultStatus.exitCode, defaultStatus.stderr).toBe(0);
      const defaultData = parseStdoutJson<Record<string, unknown>>(defaultStatus.stdout);
      expect(defaultData.authenticated).toBe(true);
      expect(defaultData.config).toBe("default");
    });
  });

  test.each(["config show", "auth status"])(
    "前置和后置 --config 为 %s 选择同一份非激活 Profile，且不修改配置",
    async (commandPath) => {
      await withTempConfigDir(async (configDir) => {
        const originalConfig = {
          active_config: "default",
          api_key: "sk-default-review",
          base_url: "https://default.example.test",
          work: {
            api_key: "sk-work-review",
            base_url: "https://work.example.test",
            access_token: "console-work-review",
            console_site: "international",
            console_region: "ap-southeast-1",
            workspace_id: "work-space-review",
            output: "json",
          },
        };
        writeConfig(configDir, originalConfig);
        const env = {
          BAILIAN_CONFIG_DIR: configDir,
          DASHSCOPE_API_KEY: "",
          DASHSCOPE_BASE_URL: "",
          DASHSCOPE_OUTPUT: "",
          ALIBABA_CLOUD_ACCESS_KEY_ID: "",
          ALIBABA_CLOUD_ACCESS_KEY_SECRET: "",
        };
        const leading = await runCli(["--config", "work", ...commandPath.split(" ")], env);
        const trailing = await runCli([...commandPath.split(" "), "--config=work"], env);
        expect(leading.exitCode, leading.stderr).toBe(0);
        expect(trailing.exitCode, trailing.stderr).toBe(0);
        const leadingData = parseStdoutJson<Record<string, unknown>>(leading.stdout);
        expect(leadingData).toEqual(parseStdoutJson(trailing.stdout));
        expect(leadingData.config).toBe("work");
        if (commandPath === "auth status") {
          expect(leadingData).toMatchObject({
            authenticated: true,
            api_key: { source: "config", base_url: "https://work.example.test" },
            console: { source: "config", site: "international", region: "ap-southeast-1" },
          });
        } else {
          expect(leadingData.base_url).toBe("https://work.example.test");
          expect(leadingData.api_key).toBeDefined();
          expect(String(leadingData.api_key)).not.toMatch(/active/);
          expect(leadingData.active).toEqual({ api_key: "config", base_url: "config" });
          expect(leadingData.workspace_id).toBe("work-space-review");
        }
        expect(JSON.parse(readFileSync(join(configDir, "config.json"), "utf8"))).toEqual(
          originalConfig,
        );
      });
    },
  );

  test.each([
    { language: "en-US", expectedMessage: /before the command path/, expectedHint: /after/ },
    { language: "zh-CN", expectedMessage: /命令路径之前/, expectedHint: /之后/ },
  ])(
    "前置非全局参数的 JSON 错误遵循选中 Profile 的语言 $language",
    async ({ language, expectedMessage, expectedHint }) => {
      await withTempConfigDir(async (configDir) => {
        writeConfig(configDir, { language: "en-US", work: { language } });
        const result = await runCli(
          ["--config=work", "--output=json", "--prompt", "hi", "text", "chat"],
          { BAILIAN_CONFIG_DIR: configDir },
        );
        expect(result.exitCode).toBe(2);
        expect(result.stdout).toBe("");
        const { error } = JSON.parse(result.stderr) as {
          error: { code: number; message: string; hint: string };
        };
        expect(error.code).toBe(2);
        expect(error.message).toMatch(expectedMessage);
        expect(error.hint).toMatch(expectedHint);
      });
    },
  );

  test.each([
    { argv: ["--config=work", "auth"], help: /Usage: bl auth <command>/ },
    { argv: ["--config=work"], help: /Usage: bl <resource> <command>/ },
  ])("合法前置参数保留相应帮助页: $argv", async ({ argv, help }) => {
    await withTempConfigDir(async (configDir) => {
      writeConfig(configDir, { work: { language: "en-US" } });
      const result = await runCli(argv, { BAILIAN_CONFIG_DIR: configDir });
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stderr).toMatch(help);
      expect(result.stdout).toBe("");
    });
  });

  test.each([
    ["auth", "--output=json", "--timeout"],
    ["--output=json", "--timeout", "--help"],
    ["--config=work", "--output=json", "--timeout", "--version"],
  ])("中文帮助分支缺少参数值时返回结构化用法错误: %j", async (...argv) => {
    await withTempConfigDir(async (configDir) => {
      writeConfig(configDir, { language: "zh-CN", work: { language: "zh-CN" } });
      const result = await runCli(argv, {
        BAILIAN_CONFIG_DIR: configDir,
      });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
      expect(JSON.parse(result.stderr)).toMatchObject({
        error: { code: 2, message: expect.stringMatching(/--timeout.*需要.*值/) },
      });
    });
  });

  test("--config default 等价默认配置", async () => {
    await withTempConfigDir(async (dir) => {
      writeConfig(dir, {
        active_config: "token-plan",
        output: "json",
        api_key: "sk-default",
        "token-plan": { output: "text", api_key: "sk-token" },
      });
      const { stdout, stderr, exitCode } = await runCli(
        ["config", "show", "--config", "default", "--output", "json"],
        {
          BAILIAN_CONFIG_DIR: dir,
          DASHSCOPE_API_KEY: "",
          DASHSCOPE_BASE_URL: "",
        },
      );
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<Record<string, unknown>>(stdout);
      expect(data.config).toBe("default");
      // `active` is credential-source provenance, not profile activation metadata.
      expect(data.active).toEqual({ api_key: "config" });
      expect(data).not.toHaveProperty("active_config");
      expect(data.api_key).toBeDefined();
      expect(String(data.api_key)).not.toMatch(/active/);
      const raw = JSON.parse(readFileSync(join(dir, "config.json"), "utf8")) as Record<
        string,
        unknown
      >;
      expect(raw.active_config).toBe("token-plan");
    });
  });

  test("非法 --config 名称报 usage error", async () => {
    const { stderr, exitCode } = await runCli(["auth", "status", "--config", "../evil"]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Invalid config name/);
  });

  test("auth status 文本输出分行展示选中 Config 和配置文件", async () => {
    await withTempConfigDir(async (dir) => {
      writeConfig(dir, {
        active_config: "token-plan",
        "token-plan": { api_key: "sk-token" },
      });

      const result = await runCli(["auth", "status", "--output", "text"], {
        BAILIAN_CONFIG_DIR: dir,
        DASHSCOPE_API_KEY: "",
        ALIBABA_CLOUD_ACCESS_KEY_ID: "",
        ALIBABA_CLOUD_ACCESS_KEY_SECRET: "",
      });
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toContain("Config: token-plan\n");
      expect(result.stdout).toContain(`Config file: ${join(dir, "config.json")}\n`);
      expect(result.stdout).not.toContain("Active config:");
    });
  });
});
