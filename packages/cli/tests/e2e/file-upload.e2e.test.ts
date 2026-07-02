import { describe, expect, test } from "vite-plus/test";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { isBailianE2EEnabled, isDashScopeE2EReady, parseStdoutJson, runCli } from "./helpers.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * File upload E2E
 */

describe("e2e: file upload", () => {
  test("file 分组展示子命令帮助且成功退出", async () => {
    const { stdout, stderr, exitCode } = await runCli(["file"]);
    expect(exitCode, stderr).toBe(0);
    const out = `${stdout}\n${stderr}`;
    expect(out).toMatch(/file|upload/i);
  });

  test("file upload --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["file", "upload", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/upload|--file|--model/i);
  });
});

// === DEBUG: worker 进程中的环境变量 ===
console.log(
  "[worker:file-upload] DASHSCOPE_API_KEY =",
  JSON.stringify(process.env.DASHSCOPE_API_KEY),
);
console.log("[worker:file-upload] isDashScopeE2EReady() =", isDashScopeE2EReady());
console.log("[worker:file-upload] isBailianE2EEnabled() =", isBailianE2EEnabled());
// === DEBUG END ===

describe.skipIf(!isDashScopeE2EReady())("e2e: file upload（DashScope）", () => {
  test("file upload 缺少 --file 时打印子命令帮助并退出 (0)", async () => {
    const { stderr, exitCode } = await runCli([
      "file",
      "upload",
      "--model",
      "qwen3-vl-plus",
      "--non-interactive",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toMatch(/--file|Usage:/i);
  });

  test("file upload 缺少 --model 时打印子命令帮助并退出 (0)", async () => {
    const testFile = join(__dirname, ".smoke-32.png");
    const { stderr, exitCode } = await runCli([
      "file",
      "upload",
      "--file",
      testFile,
      "--non-interactive",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toMatch(/--model|Usage:/i);
  });

  test("上传文件成功返回oss临时 URL", async () => {
    const testFile = join(__dirname, ".smoke-32.png");
    const { stdout, stderr, exitCode } = await runCli([
      "file",
      "upload",
      "--file",
      testFile,
      "--model",
      "qwen3-vl-plus",
      "--non-interactive",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ url?: string; model?: string; expires_in?: string }>(stdout);
    expect(data.url).toBeDefined();
    expect(data.url).toMatch(/^oss:\/\//);
    expect(data.model).toBe("qwen3-vl-plus");
    expect(data.expires_in).toBe("48 hours");
  }, 120_000);
});
