import { describe, expect, test } from "vite-plus/test";
import { join } from "path";
import { isDashScopeE2EReady, parseStdoutJson, runCommandE2e, e2eFixturesDir } from "./helpers.ts";
import { FILE_UPLOAD_ROUTES } from "./topic-routes.ts";

/**
 * File upload E2E
 */

describe("e2e: file upload", () => {
  test("file upload --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(FILE_UPLOAD_ROUTES, [
      "file",
      "upload",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/upload|--file|--model/i);
  });
});

describe.skipIf(!isDashScopeE2EReady())("e2e: file upload（DashScope）", () => {
  test("file upload 缺少 --file 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(FILE_UPLOAD_ROUTES, [
      "file",
      "upload",
      "--model",
      "qwen3-vl-plus",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--file|Usage:/i);
  });

  test("file upload 缺少 --model 时报用法错误并退出 (2)", async () => {
    const testFile = join(e2eFixturesDir, ".smoke-32.png");
    const { stderr, exitCode } = await runCommandE2e(FILE_UPLOAD_ROUTES, [
      "file",
      "upload",
      "--file",
      testFile,
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--model|Usage:/i);
  });

  test("上传文件成功返回oss临时 URL", async () => {
    const testFile = join(e2eFixturesDir, ".smoke-32.png");
    const { stdout, stderr, exitCode } = await runCommandE2e(FILE_UPLOAD_ROUTES, [
      "file",
      "upload",
      "--file",
      testFile,
      "--model",
      "qwen3-vl-plus",
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
