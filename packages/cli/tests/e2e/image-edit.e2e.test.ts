import { describe, expect, test } from "vite-plus/test";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  e2eLabelFromMetaUrl,
  isBailianE2EMediaEnabled,
  isDashScopeE2EReady,
  makeE2eOutputDir,
  parseStdoutJson,
  runCli,
} from "./helpers.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Image edit E2E
 */

describe("e2e: image edit", () => {
  test("image 分组展示子命令帮助且成功退出", async () => {
    const { stdout, stderr, exitCode } = await runCli(["image"]);
    expect(exitCode, stderr).toBe(0);
    const out = `${stdout}\n${stderr}`;
    expect(out).toMatch(/image|generate|edit/i);
  });

  test("image edit --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["image", "edit", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/edit|--image|--prompt/i);
  });
});

describe.skipIf(!isBailianE2EMediaEnabled() || !isDashScopeE2EReady())("e2e: image edit", () => {
  test("image edit 缺少 --image 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCli(["image", "edit", "--prompt", "仅提示词"]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--image|Usage:/i);
  });

  test("image edit 缺少 --prompt 时报用法错误并退出 (2)", async () => {
    const testPng = join(__dirname, ".smoke-32.png");
    const { stderr, exitCode } = await runCli(["image", "edit", "--image", testPng]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--prompt|Usage:/i);
  });

  test("【qwen-image-2.0】图片编辑", async () => {
    const outDir = makeE2eOutputDir(e2eLabelFromMetaUrl(import.meta.url));
    const gen = await runCli([
      "image",
      "generate",
      "--model",
      "qwen-image-2.0",
      "--prompt",
      "一只简笔画小猫，白底",
      "--out-dir",
      outDir,
      "--out-prefix",
      "e2e-gen",
      "--output",
      "json",
    ]);
    expect(gen.exitCode, gen.stderr).toBe(0);
    const genData = parseStdoutJson<{ urls?: string[] }>(gen.stdout);
    const imagePath = genData.urls?.[0];

    expect(imagePath).toBeTruthy();

    const ed = await runCli([
      "image",
      "edit",
      "--model",
      "qwen-image-2.0",
      "--image",
      imagePath!,
      "--prompt",
      "把背景改成浅蓝色",
      "--out-dir",
      outDir,
      "--out-prefix",
      "e2e-edit",
      "--output",
      "json",
    ]);
    expect(ed.exitCode, ed.stderr).toBe(0);
    const edData = parseStdoutJson<{ saved?: string[] }>(ed.stdout);
    expect(edData.saved?.length ?? 0).toBeGreaterThan(0);
  }, 600_000);
});
