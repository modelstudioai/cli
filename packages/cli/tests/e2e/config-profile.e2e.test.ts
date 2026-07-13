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
      });
      expect(devStatus.exitCode, devStatus.stderr).toBe(0);
      const devData = parseStdoutJson<Record<string, unknown>>(devStatus.stdout);
      expect(devData.authenticated).toBe(false);
      expect(devData.config).toBe("dev");

      const defaultStatus = await runCli(["auth", "status", "--output", "json"], {
        BAILIAN_CONFIG_DIR: dir,
      });
      expect(defaultStatus.exitCode, defaultStatus.stderr).toBe(0);
      const defaultData = parseStdoutJson<Record<string, unknown>>(defaultStatus.stdout);
      expect(defaultData.authenticated).toBe(true);
      expect(defaultData.config).toBe("default");
    });
  });

  test("--config default 等价默认配置", async () => {
    await withTempConfigDir(async (dir) => {
      writeConfig(dir, { output: "json", api_key: "sk-default" });
      const { stdout, stderr, exitCode } = await runCli(
        ["config", "show", "--config", "default", "--output", "json"],
        { BAILIAN_CONFIG_DIR: dir },
      );
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<Record<string, unknown>>(stdout);
      expect(data.config).toBe("default");
      expect(data.api_key).toBeDefined();
    });
  });

  test("非法 --config 名称报 usage error", async () => {
    const { stderr, exitCode } = await runCli(["auth", "status", "--config", "../evil"]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Invalid config name/);
  });
});
