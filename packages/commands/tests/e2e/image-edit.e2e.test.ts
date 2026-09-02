import { describe, expect, test } from "vite-plus/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  e2eFixturesDir,
  e2eLabelFromMetaUrl,
  isBailianE2EMediaEnabled,
  isDashScopeE2EReady,
  makeE2eOutputDir,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
} from "./helpers.ts";
import { IMAGE_ROUTES } from "./topic-routes.ts";

/**
 * Image edit E2E
 */

describe("e2e: image edit", () => {
  test("image edit --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(IMAGE_ROUTES, ["image", "edit", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/edit|--image|--prompt|--async|--concurrent/i);
  });

  test("image edit --dry-run 接受 async 模型的 --async 与 --concurrent", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(IMAGE_ROUTES, [
      "image",
      "edit",
      "--dry-run",
      "--model",
      "wan2.6-t2i",
      "--image",
      "https://example.com/source.png",
      "--prompt",
      "Change the background to blue",
      "--async",
      "--concurrent",
      "2",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ mode?: string; request?: { input?: { messages?: unknown[] } } }>(
      stdout,
    );
    expect(data.mode).toBe("async");
    expect(data.request?.input?.messages?.length).toBeGreaterThan(0);
  });

  test("Token Plan 使用 Base64 传入 wan2.7-image 本地图片", async () => {
    const configDir = makeE2eOutputDir("image-edit-token-plan-local-image");
    writeFileSync(
      join(configDir, "config.json"),
      JSON.stringify({
        "token-plan": {
          api_key: "sk-sp-e2e-placeholder",
          base_url: "https://token-plan.cn-beijing.maas.aliyuncs.com",
          default_image_model: "wan2.7-image",
        },
      }),
    );

    const { stdout, stderr, exitCode } = await runCommandE2e(
      IMAGE_ROUTES,
      [
        "image",
        "edit",
        "--config",
        "token-plan",
        "--image",
        join(e2eFixturesDir, ".smoke-32.png"),
        "--prompt",
        "改成蓝色",
        "--dry-run",
        "--output",
        "json",
      ],
      {
        BAILIAN_CONFIG_DIR: configDir,
        DASHSCOPE_API_KEY: "",
        DASHSCOPE_BASE_URL: "",
      },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      mode?: string;
      request?: {
        model?: string;
        input?: { messages?: Array<{ content?: Array<{ image?: string }> }> };
      };
    }>(stdout);
    expect(data.mode).toBe("sync");
    expect(data.request?.model).toBe("wan2.7-image");
    expect(data.request?.input?.messages?.[0]?.content?.[0]?.image).toBe(
      "data:image/png;base64,<omitted>",
    );
  });

  test("wan2.5-i2i-preview dry-run 走 prompt+images", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(IMAGE_ROUTES, [
      "image",
      "edit",
      "--model",
      "wan2.5-i2i-preview",
      "--image",
      "https://example.com/source.png",
      "--prompt",
      "Place on a table",
      "--size",
      "1:1",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      mode?: string;
      path?: string;
      request?: {
        input?: { prompt?: string; images?: string[]; messages?: unknown };
        parameters?: { size?: string };
      };
    }>(stdout);
    expect(data.mode).toBe("async");
    expect(data.path).toBe("/api/v1/services/aigc/image2image/image-synthesis");
    expect(data.request?.input?.prompt).toBe("Place on a table");
    expect(data.request?.input?.images).toEqual(["https://example.com/source.png"]);
    expect(data.request?.input?.messages).toBeUndefined();
    expect(data.request?.parameters?.size).toBe("1280*1280");
  });

  test("wanx2.1-imageedit dry-run 走 function + base_image_url", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(IMAGE_ROUTES, [
      "image",
      "edit",
      "--model",
      "wanx2.1-imageedit",
      "--image",
      "https://example.com/source.png",
      "--prompt",
      "转换成绘本风格",
      "--function",
      "stylization_all",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      mode?: string;
      path?: string;
      request?: {
        input?: {
          function?: string;
          prompt?: string;
          base_image_url?: string;
          images?: unknown;
          messages?: unknown;
        };
      };
    }>(stdout);
    expect(data.mode).toBe("async");
    expect(data.path).toBe("/api/v1/services/aigc/image2image/image-synthesis");
    expect(data.request?.input?.function).toBe("stylization_all");
    expect(data.request?.input?.prompt).toBe("转换成绘本风格");
    expect(data.request?.input?.base_image_url).toBe("https://example.com/source.png");
    expect(data.request?.input?.images).toBeUndefined();
    expect(data.request?.input?.messages).toBeUndefined();
  });
});

describe.skipIf(!isBailianE2EMediaEnabled() || !isDashScopeE2EReady())("e2e: image edit", () => {
  test("image edit 缺少 --image 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(IMAGE_ROUTES, [
      "image",
      "edit",
      "--prompt",
      "仅提示词",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--image|Usage:/i);
  });

  test("image edit 缺少 --prompt 时报用法错误并退出 (2)", async () => {
    const testPng = join(e2eFixturesDir, ".smoke-32.png");
    const { stderr, exitCode } = await runCommandE2e(IMAGE_ROUTES, [
      "image",
      "edit",
      "--image",
      testPng,
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--prompt|Usage:/i);
  });

  test("【qwen-image-3.0】图片编辑", async () => {
    const outDir = makeE2eOutputDir(e2eLabelFromMetaUrl(import.meta.url));
    const gen = await runCommandE2e(IMAGE_ROUTES, [
      "image",
      "generate",
      "--model",
      "qwen-image-3.0",
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

    const ed = await runCommandE2e(IMAGE_ROUTES, [
      "image",
      "edit",
      "--model",
      "qwen-image-3.0",
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
