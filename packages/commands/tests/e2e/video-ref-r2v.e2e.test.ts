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
  runCommandHelp,
  runCommandE2e,
} from "./helpers.ts";
import { VIDEO_ROUTES } from "./topic-routes.ts";

/**
 * Video ref (r2v)：help / 分组不依赖密钥；参考生成需视频 E2E + DashScope。
 */

describe("e2e: video ref (r2v)", () => {
  test("video ref --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(VIDEO_ROUTES, ["video", "ref", "--help"]);
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

  test("video ref --dry-run 在 wan3.0-video 上将 --image-voice 转为独立 reference_audio 条目", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
      "video",
      "ref",
      "--dry-run",
      "--model",
      "wan3.0-video",
      "--prompt",
      "Image 1 speaks with Audio 1",
      "--image",
      "https://example.com/a.jpg",
      "--ref-video",
      "https://example.com/b.mp4",
      "--image-voice",
      "https://example.com/va.mp3",
      "--video-voice",
      "https://example.com/vb.mp3",
      "--resolution",
      "720P",
      "--ratio",
      "16:9",
      "--duration",
      "5",
      "--prompt-extend",
      "true",
      "--watermark",
      "false",
      "--seed",
      "42",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      request?: {
        input?: {
          media?: Array<{ type?: string; url?: string; reference_voice?: string }>;
        };
        parameters?: { prompt_extend?: boolean; watermark?: boolean; seed?: number };
      };
    }>(stdout);
    const media = data.request?.input?.media ?? [];
    // wan3.0: image/video 条目不挂 reference_voice
    const imageEntry = media.find((m) => m.type === "reference_image");
    expect(imageEntry?.reference_voice).toBeUndefined();
    // 音色作为独立 reference_audio 条目，按 image-voice 再 video-voice 顺序追加
    const audioEntries = media.filter((m) => m.type === "reference_audio");
    expect(audioEntries).toHaveLength(2);
    expect(audioEntries[0]?.url).toBe("https://example.com/va.mp3");
    expect(audioEntries[1]?.url).toBe("https://example.com/vb.mp3");
    // 全部生成参数进入 parameters
    expect(data.request?.parameters?.prompt_extend).toBe(true);
    expect(data.request?.parameters?.watermark).toBe(false);
    expect(data.request?.parameters?.seed).toBe(42);
  });

  test("video ref --dry-run 在 wan2.7-r2v 上沿用 reference_voice 字段（既有逻辑）", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
      "video",
      "ref",
      "--dry-run",
      "--model",
      "wan2.7-r2v",
      "--prompt",
      "Image 1 speaks",
      "--image",
      "https://example.com/a.jpg",
      "--image-voice",
      "https://example.com/va.mp3",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      request?: { input?: { media?: Array<{ type?: string; reference_voice?: string }> } };
    }>(stdout);
    const media = data.request?.input?.media ?? [];
    expect(media).toHaveLength(1);
    expect(media[0]?.reference_voice).toBe("https://example.com/va.mp3");
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

  test("Token Plan 参考生视频将本地参考图转换为 Base64", async () => {
    const configDir = makeE2eOutputDir("video-r2v-token-plan-local-image");
    const imagePath = join(configDir, "reference.png");
    writeFileSync(imagePath, Buffer.from([1, 2, 3]));
    writeFileSync(
      join(configDir, "config.json"),
      JSON.stringify({
        "token-plan": {
          api_key: "sk-sp-e2e-placeholder",
          base_url: "https://token-plan.cn-beijing.maas.aliyuncs.com",
          default_reference_to_video_model: "happyhorse-1.1-r2v",
        },
      }),
    );

    const { stdout, stderr, exitCode } = await runCommandE2e(
      VIDEO_ROUTES,
      [
        "video",
        "ref",
        "--config",
        "token-plan",
        "--dry-run",
        "--image",
        imagePath,
        "--prompt",
        "Image 1 waves",
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
        "wan3.0-video",
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
        "wan3.0-video",
        "--prompt",
        "仅有描述无素材",
      ]);
      expect(exitCode).toBe(2);
      expect(stderr).toMatch(/--image|ref-video|At least one|required/i);
    });

    test("【wan3.0-video】视频参考生成", async () => {
      const outDir = makeE2eOutputDir(e2eLabelFromMetaUrl(import.meta.url));
      const gen = await runCommandE2e(VIDEO_ROUTES, [
        "image",
        "generate",
        "--model",
        "qwen-image-3.0",
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
        "wan3.0-video",
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

    test("【wan3.0-video】全参数参考生视频（图+视频+双音色+全部生成参数）", async () => {
      const outDir = makeE2eOutputDir(e2eLabelFromMetaUrl(import.meta.url));

      // 1. 参考图
      const gen = await runCommandE2e(VIDEO_ROUTES, [
        "image",
        "generate",
        "--model",
        "qwen-image-3.0",
        "--prompt",
        "一片绿色的树叶，白底",
        "--out-dir",
        outDir,
        "--out-prefix",
        "e2e-ref-img",
        "--output",
        "json",
      ]);
      expect(gen.exitCode, gen.stderr).toBe(0);
      const imagePath = parseStdoutJson<{ saved?: string[] }>(gen.stdout).saved?.[0];
      expect(imagePath).toBeTruthy();

      // 2. 参考视频（t2v 生成一段素材）
      const vid = await runCommandE2e(VIDEO_ROUTES, [
        "video",
        "generate",
        ...cliTimeoutPrefix(),
        "--model",
        "wan3.0-video",
        "--prompt",
        "海面波光粼粼，远景静态镜头",
        "--download",
        join(outDir, "e2e-ref-video.mp4"),
        "--output",
        "json",
      ]);
      expect(vid.exitCode, vid.stderr).toBe(0);
      const refVideoPath = parseStdoutJson<{ saved?: string }>(vid.stdout).saved;
      expect(refVideoPath).toBeTruthy();

      // 3. 两个参考音色（文本足够长确保 ≥1s，合计 ≤15s）
      const vaOut = join(outDir, "e2e-va.mp3");
      const va = await runCommandE2e(VIDEO_ROUTES, [
        "speech",
        "synthesize",
        "--model",
        "cosyvoice-v3-flash",
        "--voice",
        "longwan_v3",
        "--text",
        "你好，很高兴见到你，今天我们一起聊聊吧",
        "--out",
        vaOut,
        "--output",
        "json",
      ]);
      expect(va.exitCode, va.stderr).toBe(0);
      expect(parseStdoutJson<{ saved?: string }>(va.stdout).saved).toBe(vaOut);

      const vbOut = join(outDir, "e2e-vb.mp3");
      const vb = await runCommandE2e(VIDEO_ROUTES, [
        "speech",
        "synthesize",
        "--model",
        "cosyvoice-v3-flash",
        "--voice",
        "longxiaochun_v3",
        "--text",
        "你好呀，今天天气真不错，我们出去走走吧",
        "--out",
        vbOut,
        "--output",
        "json",
      ]);
      expect(vb.exitCode, vb.stderr).toBe(0);
      expect(parseStdoutJson<{ saved?: string }>(vb.stdout).saved).toBe(vbOut);

      // 4. 全参数 video ref：图1/视频1/音频1/音频2 + 全部生成参数
      const { stdout, stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
        "video",
        "ref",
        ...cliTimeoutPrefix(),
        "--model",
        "wan3.0-video",
        "--prompt",
        "图1中的人物看向视频1中的角色，并用音频1的音色说：你好，视频1中的角色用音频2的音色回应：你好呀",
        "--image",
        imagePath!,
        "--ref-video",
        refVideoPath!,
        "--image-voice",
        vaOut,
        "--video-voice",
        vbOut,
        "--resolution",
        "720P",
        "--ratio",
        "16:9",
        "--duration",
        "5",
        "--prompt-extend",
        "true",
        "--watermark",
        "false",
        "--seed",
        "42",
        "--poll-interval",
        "10",
        "--download",
        join(outDir, "e2e-video-ref-full.mp4"),
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ status?: string; video_url?: string; saved?: string }>(stdout);
      expect(data.status).toBe("SUCCEEDED");
      expect(data.video_url?.startsWith("https://")).toBe(true);
      expect(data.saved).toBeTruthy();
    }, 3_600_000);
  },
);
