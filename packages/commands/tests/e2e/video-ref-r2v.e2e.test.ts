import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import {
  cliTimeoutPrefix,
  e2eLabelFromMetaUrl,
  isBailianE2EVideoEnabled,
  isDashScopeE2EReady,
  makeE2eOutputDir,
  parseStdoutJson,
  runCommandE2e,
} from "./helpers.ts";
import { VIDEO_ROUTES } from "./topic-routes.ts";

/**
 * Video ref (r2v)：help / 分组不依赖密钥；参考生成需视频 E2E + DashScope。
 */

describe("e2e: video ref (r2v)", () => {
  test("video ref --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, ["video", "ref", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/ref|--prompt|--image|model|--async|--concurrent/i);
  });

  test("video ref --dry-run 接受 --async 与 --concurrent", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
      "video",
      "ref",
      "--dry-run",
      "--prompt",
      "Image 1 waves",
      "--image",
      "https://example.com/person.png",
      "--async",
      "--concurrent",
      "2",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ request?: { input?: { media?: Array<{ url?: string }> } } }>(
      stdout,
    );
    expect(data.request?.input?.media?.[0]?.url).toBe("https://example.com/person.png");
  });

  test("Token Plan 使用独立的参考生视频默认模型", async () => {
    const configDir = makeE2eOutputDir("video-r2v-token-plan-default");
    writeFileSync(
      join(configDir, "config.json"),
      JSON.stringify(
        {
          "token-plan": {
            api_key: "sk-sp-e2e-placeholder",
            base_url: "https://token-plan.cn-beijing.maas.aliyuncs.com",
            default_reference_to_video_model: "custom-reference-to-video-model",
          },
        },
        null,
        2,
      ) + "\n",
    );

    const { stdout, stderr, exitCode } = await runCommandE2e(
      VIDEO_ROUTES,
      [
        "video",
        "ref",
        "--config",
        "token-plan",
        "--dry-run",
        "--prompt",
        "Image 1 waves",
        "--image",
        "https://example.com/person.png",
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
    const data = parseStdoutJson<{ request?: { model?: string } }>(stdout);
    expect(data.request?.model).toBe("custom-reference-to-video-model");
  });
});

describe.skipIf(!isBailianE2EVideoEnabled() || !isDashScopeE2EReady())(
  "e2e: video ref (r2v)（DashScope 视频）",
  () => {
    test("video ref 缺少 --prompt 时报用法错误并退出 (2)", async () => {
      const { stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
        "video",
        "ref",
        ...cliTimeoutPrefix(),
        "--model",
        "happyhorse-1.1-r2v",
        "--image",
        "https://example.com/x.png",
      ]);
      expect(exitCode).toBe(2);
      expect(stderr).toMatch(/--prompt|Usage:/i);
    });

    test("video ref 缺少 --image 与 --ref-video 时退出为用法错误 (2)", async () => {
      const { stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
        "video",
        "ref",
        ...cliTimeoutPrefix(),
        "--model",
        "happyhorse-1.1-r2v",
        "--prompt",
        "仅有描述无素材",
      ]);
      expect(exitCode).toBe(2);
      expect(stderr).toMatch(/--image|ref-video|At least one|required/i);
    });

    test("【happyhorse-1.1-r2v】视频参考生成", async () => {
      const outDir = makeE2eOutputDir(e2eLabelFromMetaUrl(import.meta.url));
      const gen = await runCommandE2e(VIDEO_ROUTES, [
        "image",
        "generate",
        "--model",
        "qwen-image-2.0",
        "--prompt",
        "一片绿色的树叶，白底",
        "--out-dir",
        outDir,
        "--out-prefix",
        "e2e-gen",
        "--output",
        "json",
      ]);
      expect(gen.exitCode, gen.stderr).toBe(0);
      const genData = parseStdoutJson<{ saved?: string[] }>(gen.stdout);
      const imagePath = genData.saved?.[0];
      expect(imagePath).toBeTruthy();

      const { stdout, stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
        "video",
        "ref",
        ...cliTimeoutPrefix(),
        "--model",
        "happyhorse-1.1-r2v",
        "--prompt",
        "图1在画面中心轻微晃动",
        "--image",
        imagePath!,
        "--download",
        join(outDir, "e2e-video-r2v.mp4"),
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ status?: string; video_url?: string }>(stdout);
      expect(data.status).toBe("SUCCEEDED");
      expect(data.video_url?.startsWith("https://")).toBe(true);
    }, 3_600_000);
  },
);
