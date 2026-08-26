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

  test("Token Plan 图生视频将本地首帧转换为 Base64", async () => {
    const configDir = makeE2eOutputDir("video-i2v-token-plan-local-image");
    const imagePath = join(configDir, "first-frame.png");
    writeFileSync(imagePath, Buffer.from([1, 2, 3]));
    writeFileSync(
      join(configDir, "config.json"),
      JSON.stringify({
        "token-plan": {
          api_key: "sk-sp-e2e-placeholder",
          base_url: "https://token-plan.cn-beijing.maas.aliyuncs.com",
          default_image_to_video_model: "happyhorse-1.1-i2v",
        },
      }),
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
        imagePath,
        "--prompt",
        "让画面动起来",
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
      request?: { input?: { media?: Array<{ url?: string }> } };
    }>(stdout);
    expect(data.request?.input?.media?.[0]?.url).toBe("data:image/png;base64,<omitted>");
  });

  test.each([
    // wan2.1~2.6 (legacy) use flat img_url; wan2.7+ / wan3.0 / happyhorse use media[].
    // 用普通 dry-run（不绑 token-plan）：TP 不支持 wan3.0，绑 TP 会形成错误测试契约。
    ["wan2.5-i2v-preview", "img_url"],
    ["wan2.6-i2v", "img_url"],
    ["wan2.7-i2v", "media"],
    ["wan3.0-video", "media"],
    ["happyhorse-1.1-i2v", "media"],
  ])("video generate --dry-run %s 首帧走 %s 字段", async (model, field) => {
    const { stdout, stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
      "video",
      "generate",
      "--dry-run",
      "--model",
      model,
      "--image",
      "https://example.com/placeholder.png",
      "--prompt",
      "干跑校验",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      request?: {
        input?: { img_url?: string; media?: Array<{ type?: string; url?: string }> };
      };
    }>(stdout);
    if (field === "img_url") {
      expect(data.request?.input?.img_url).toBe("https://example.com/placeholder.png");
      expect(data.request?.input?.media).toBeUndefined();
    } else {
      expect(data.request?.input?.media?.[0]?.type).toBe("first_frame");
      expect(data.request?.input?.img_url).toBeUndefined();
    }
  });

  test("video generate --dry-run --file 走 media file 字段", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
      "video",
      "generate",
      "--dry-run",
      "--model",
      "wan3.0-video",
      "--file",
      "https://example.com/reference.pdf",
      "--prompt",
      "文件生视频干跑",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      request?: {
        model?: string;
        input?: {
          media?: Array<{ type?: string; url?: string }>;
          img_url?: string;
          first_frame_url?: string;
        };
      };
    }>(stdout);
    expect(data.request?.model).toBe("wan3.0-video");
    expect(data.request?.input?.media?.[0]?.type).toBe("file");
    expect(data.request?.input?.media?.[0]?.url).toBe("https://example.com/reference.pdf");
    expect(data.request?.input?.img_url).toBeUndefined();
    expect(data.request?.input?.first_frame_url).toBeUndefined();
  });

  test("--file 与 --image 互斥时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
      "video",
      "generate",
      "--dry-run",
      "--model",
      "wan3.0-video",
      "--file",
      "https://example.com/reference.pdf",
      "--image",
      "https://example.com/placeholder.png",
      "--prompt",
      "互斥校验",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--file.*mutually exclusive|--file.*互斥|mutually exclusive/i);
  });

  test("--file 与 --last-frame 互斥时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
      "video",
      "generate",
      "--dry-run",
      "--model",
      "wan3.0-video",
      "--file",
      "https://example.com/reference.pdf",
      "--last-frame",
      "https://example.com/last-frame.png",
      "--prompt",
      "互斥校验",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--file.*mutually exclusive|--file.*互斥|mutually exclusive/i);
  });

  test("非 wan3.0 模型使用 --file 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
      "video",
      "generate",
      "--dry-run",
      "--model",
      "wan2.6-i2v",
      "--file",
      "https://example.com/reference.pdf",
      "--prompt",
      "模型限制校验",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(
      /--file.*only supported by wan3\.0-video|--file.*仅.*wan3\.0-video|only supported by wan3\.0-video/i,
    );
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
        "wan3.0-video",
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
        "wan3.0-video",
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

    test("【wan3.0-video】图片生成视频", async () => {
      const outDir = makeE2eOutputDir(e2eLabelFromMetaUrl(import.meta.url));
      const png = join(outDir, "e2e-gen.png");
      const gen = await runCommandE2e(VIDEO_ROUTES, [
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
      const genData = parseStdoutJson<{ saved?: string[] }>(gen.stdout);
      const imagePath = genData.saved?.[0] ?? png;

      const { stdout, stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
        "video",
        "generate",
        ...cliTimeoutPrefix(),
        "--model",
        "wan3.0-video",
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
