import { access, mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import { runManagement } from "../src/management.js";

describe("KB management configuration isolation", () => {
  it("uses current dsh values and an isolated config directory for every call", async () => {
    const resolveConfiguration = vi.fn(async () => ({ apiKey: "dsh-key", workspaceId: "dsh-ws" }));
    let configDirectory = "";
    const execute = vi.fn(async (args: string[], env: NodeJS.ProcessEnv) => {
      expect(args).toEqual(["knowledge", "list"]);
      expect(env.DASHSCOPE_API_KEY).toBe("dsh-key");
      expect(env.BAILIAN_WORKSPACE_ID).toBe("dsh-ws");
      expect(env.DASHSCOPE_BASE_URL).toBeUndefined();
      expect(env.BAILIAN_CONFIG_DIR).not.toBe("/user/bl");
      configDirectory = env.BAILIAN_CONFIG_DIR!;
      await access(configDirectory);
      return { stdout: "ok", stderr: "", exitCode: 0 };
    });
    await runManagement(["list"], {
      resolveConfiguration,
      execute,
      environment: {
        BAILIAN_CONFIG_DIR: "/user/bl",
        DASHSCOPE_API_KEY: "bl-key",
        DASHSCOPE_BASE_URL: "https://other",
      },
    });
    await expect(access(configDirectory)).rejects.toThrow();
    resolveConfiguration.mockResolvedValue({ apiKey: "new-key", workspaceId: "new-ws" });
    const nextExecute = vi.fn(async (_args: string[], env: NodeJS.ProcessEnv) => {
      expect(env.DASHSCOPE_API_KEY).toBe("new-key");
      expect(env.BAILIAN_WORKSPACE_ID).toBe("new-ws");
      return { stdout: "", stderr: "", exitCode: 0 };
    });
    await runManagement(["list"], { resolveConfiguration, execute: nextExecute });
  });

  it.each([
    ["list", "--workspace-id", "other"],
    ["list", "--api-key=other"],
    ["list", "--config", "other"],
    ["list", "--base-url", "https://other"],
    ["list", "--workspaceId=other"],
    ["list", "--apiKey", "other"],
  ])("refuses caller configuration overrides: %j", async (...args) => {
    const execute = vi.fn();
    await expect(
      runManagement(args, {
        resolveConfiguration: async () => ({ apiKey: "key", workspaceId: "ws" }),
        execute,
      }),
    ).rejects.toThrow(/dsh/);
    expect(execute).not.toHaveBeenCalled();
  });

  it("executes the subprocess in the session directory and removes its isolated config", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kb-management-test-"));
    try {
      await writeFile(
        join(directory, "bl"),
        `#!${process.execPath}
process.stdout.write(JSON.stringify({workspace: process.env.BAILIAN_WORKSPACE_ID, key: process.env.DASHSCOPE_API_KEY, config: process.env.BAILIAN_CONFIG_DIR, cwd: process.cwd(), args: process.argv.slice(2)}));
`,
        { mode: 0o700 },
      );
      const result = await runManagement(["list"], {
        resolveConfiguration: async () => ({
          apiKey: "test-secret",
          workspaceId: "test-workspace",
        }),
        environment: { PATH: directory },
        cwd: directory,
      });
      const output = JSON.parse(result.stdout) as {
        workspace: string;
        key: string;
        config: string;
        cwd: string;
        args: string[];
      };
      expect(result.exitCode).toBe(0);
      expect(output).toMatchObject({
        workspace: "test-workspace",
        key: "[redacted]",
        cwd: await realpath(directory),
        args: ["knowledge", "list"],
      });
      await expect(access(output.config)).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails before spawning when dsh credentials are missing", async () => {
    const execute = vi.fn();
    await expect(
      runManagement(["list"], {
        resolveConfiguration: async () => ({ apiKey: "", workspaceId: "" }),
        execute,
      }),
    ).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });
});
