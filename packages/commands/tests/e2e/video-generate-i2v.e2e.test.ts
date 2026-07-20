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
 * Video generate (i2v)：help / 分组不依赖密钥；长任务需视频 E2E + DashScope。
 */

describe("e2e: video generate (i2v)", () => {
  test("video generate --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, ["video", "generate", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/generate|--prompt|--image|model/i);
  });

  test("Token Plan 使用独立的图生视频默认模型", async () => {
    const configDir = makeE2eOutputDir("video-i2v-token-plan-default");
    writeFileSync(
      join(configDir, "config.json"),
      JSON.stringify(
        {
          "token-plan": {
            api_key: "sk-sp-e2e-placeholder",
            base_url: "https://token-plan.cn-beijing.maas.aliyuncs.com",
            default_video_model: "happyhorse-1.1-t2v",
            default_image_to_video_model: "custom-image-to-video-model",
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
        "generate",
        "--config",
        "token-plan",
        "--dry-run",
        "--image",
        "https://example.com/placeholder.png",
        "--prompt",
        "干跑校验",
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
      request?: { model?: string; input?: { media?: Array<{ type?: string }> } };
    }>(stdout);
    expect(data.request?.model).toBe("custom-image-to-video-model");
    expect(data.request?.input?.media?.[0]?.type).toBe("first_frame");
  });
});

describe.skipIf(!isBailianE2EVideoEnabled() || !isDashScopeE2EReady())(
  "e2e: video generate (i2v)（DashScope 视频）",
  () => {
    test("video generate 缺少 --prompt 时报用法错误并退出 (2)", async () => {
      const { stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
        "video",
        "generate",
        ...cliTimeoutPrefix(),
        "--model",
        "happyhorse-1.1-i2v",
        "--image",
        "https://example.com/placeholder.png",
      ]);
      expect(exitCode).toBe(2);
      expect(stderr).toMatch(/--prompt|Usage:/i);
    });

    test("video generate --dry-run（无 --image）仅输出 request（t2v 路径不调上传）", async () => {
      const { stdout, stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
        "video",
        "generate",
        ...cliTimeoutPrefix(),
        "--dry-run",
        "--model",
        "happyhorse-1.1-t2v",
        "--prompt",
        "干跑无图",
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ request?: { input?: { prompt?: string; media?: unknown } } }>(
        stdout,
      );
      expect(data.request?.input?.prompt).toBe("干跑无图");
      expect(data.request?.input?.media).toBeUndefined();
    });

    test("【happyhorse-1.1-i2v】图片生成视频", async () => {
      const outDir = makeE2eOutputDir(e2eLabelFromMetaUrl(import.meta.url));
      const png = join(outDir, "e2e-gen.png");
      const gen = await runCommandE2e(VIDEO_ROUTES, [
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
      const genData = parseStdoutJson<{ saved?: string[] }>(gen.stdout);
      const imagePath = genData.saved?.[0] ?? png;

      const { stdout, stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
        "video",
        "generate",
        ...cliTimeoutPrefix(),
        "--model",
        "happyhorse-1.1-i2v",
        "--image",
        imagePath,
        "--prompt",
        "镜头缓慢推进，小猫微微动一下",
        "--download",
        join(outDir, "e2e-video-i2v.mp4"),
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ status?: string; video_url?: string; saved?: string }>(stdout);
      expect(data.status).toBe("SUCCEEDED");
      expect(data.video_url?.startsWith("https://")).toBe(true);
    }, 3_600_000);
  },
);
