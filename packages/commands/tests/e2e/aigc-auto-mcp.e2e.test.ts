import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import {
  isBailianE2EMediaEnabled,
  isBailianE2EVideoEnabled,
  isDashScopeE2EReady,
  makeE2eOutputDir,
  parseStdoutJson,
  runCommandE2e,
} from "./helpers.ts";
import type { E2eRouteExports } from "./topic-routes.ts";

/**
 * AIGC `auto` 模式（`--model auto` 或配置默认模型为 `auto`）改走百炼官方 MCP。
 *
 * 全部用例都是离线 dry-run：auto 分支在任何联网 / 上传之前先做 gate 校验并打印
 * 预览，因此无需密钥、不触发真实请求（dry-run 下 authStage 也会放行凭证缺失）。
 * 覆盖三类契约：
 *   1) 每命令 auto dry-run 预览（server / tool / arguments / mode:mcp）；
 *   2) auto + MCP 不支持的 flag → USAGE(2)，双语消息均含 flag 名；
 *   3) 本地文件入参内联为 base64 data URI，且预览中脱敏为 `<omitted>`。
 */

const AUTO_ROUTES: E2eRouteExports = {
  "image generate": "imageGenerate",
  "image edit": "imageEdit",
  "video generate": "videoGenerate",
  "speech synthesize": "speechSynthesize",
  "speech recognize": "speechRecognize",
};

/** Shape of the `auto`/MCP dry-run preview emitted by every AIGC command. */
interface McpPreview {
  server?: string;
  url?: string;
  tool?: string;
  mode?: string;
  arguments?: Record<string, unknown>;
}

describe("e2e: aigc auto → mcp", () => {
  test("image generate auto dry-run 预览走 TextGenerateImage/bailian_image_gen", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTO_ROUTES, [
      "image",
      "generate",
      "--model",
      "auto",
      "--prompt",
      "a cat",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<McpPreview>(stdout);
    expect(data.mode).toBe("mcp");
    expect(data.server).toBe("TextGenerateImage");
    expect(data.tool).toBe("bailian_image_gen");
    expect(data.arguments?.prompt).toBe("a cat");
  });

  test("image edit auto dry-run 预览走 bailian_image_edit（公网 URL 透传）", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTO_ROUTES, [
      "image",
      "edit",
      "--model",
      "auto",
      "--image",
      "https://example.com/a.png",
      "--prompt",
      "make it blue",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<McpPreview>(stdout);
    expect(data.mode).toBe("mcp");
    expect(data.server).toBe("TextGenerateImage");
    expect(data.tool).toBe("bailian_image_edit");
    expect(data.arguments?.image_url).toBe("https://example.com/a.png");
  });

  test("image edit auto 本地图片内联为脱敏 data URI", async () => {
    const configDir = makeE2eOutputDir("aigc-auto-image-edit-local");
    const imagePath = join(configDir, "input.png");
    writeFileSync(imagePath, Buffer.from([1, 2, 3]));

    const { stdout, stderr, exitCode } = await runCommandE2e(AUTO_ROUTES, [
      "image",
      "edit",
      "--model",
      "auto",
      "--image",
      imagePath,
      "--prompt",
      "make it blue",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<McpPreview>(stdout);
    expect(data.arguments?.image_url).toBe("data:image/png;base64,<omitted>");
  });

  test("image edit auto 多图输入被拒 (USAGE 2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(AUTO_ROUTES, [
      "image",
      "edit",
      "--model",
      "auto",
      "--image",
      "https://example.com/a.png",
      "--image",
      "https://example.com/b.png",
      "--prompt",
      "merge",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(2);
    expect(stderr).toMatch(/--image/);
  });

  test("video generate auto(t2v) dry-run 预览走 bailian_text_to_video_submit_task", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTO_ROUTES, [
      "video",
      "generate",
      "--model",
      "auto",
      "--prompt",
      "ocean waves",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<McpPreview>(stdout);
    expect(data.mode).toBe("mcp");
    expect(data.server).toBe("VideoGenerate");
    expect(data.tool).toBe("bailian_text_to_video_submit_task");
    expect(data.arguments?.prompt).toBe("ocean waves");
  });

  test("video generate auto(i2v) dry-run 预览走 bailian_image_to_video_submit_task", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTO_ROUTES, [
      "video",
      "generate",
      "--model",
      "auto",
      "--prompt",
      "make it move",
      "--image",
      "https://example.com/a.png",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<McpPreview>(stdout);
    expect(data.mode).toBe("mcp");
    expect(data.server).toBe("VideoGenerate");
    expect(data.tool).toBe("bailian_image_to_video_submit_task");
    expect(data.arguments?.first_frame_url).toBe("https://example.com/a.png");
  });

  test("speech synthesize auto dry-run 预览走 TextGenerateSpeech/bailian_tts（MCP 枚举音色）", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTO_ROUTES, [
      "speech",
      "synthesize",
      "--model",
      "auto",
      "--text",
      "hello",
      "--voice",
      "温柔女声",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<McpPreview>(stdout);
    expect(data.mode).toBe("mcp");
    expect(data.server).toBe("TextGenerateSpeech");
    expect(data.tool).toBe("bailian_tts");
    expect(data.arguments?.text).toBe("hello");
    expect(data.arguments?.voice).toBe("温柔女声");
  });

  test("speech recognize auto dry-run 预览走 SpeechGenerateText/bailian_speech_to_text", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTO_ROUTES, [
      "speech",
      "recognize",
      "--model",
      "auto",
      "--url",
      "https://example.com/a.mp3",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<McpPreview>(stdout);
    expect(data.mode).toBe("mcp");
    expect(data.server).toBe("SpeechGenerateText");
    expect(data.tool).toBe("bailian_speech_to_text");
    expect(data.arguments?.file_urls).toEqual(["https://example.com/a.mp3"]);
  });

  test("speech recognize auto 拒绝本地音频（服务端仅转写公网 URL）", async () => {
    // The live MCP ASR server silently returns an empty transcript for data
    // URIs, so local inputs must fail up front with a USAGE error.
    const configDir = makeE2eOutputDir("aigc-auto-speech-recognize-local");
    const audioPath = join(configDir, "input.wav");
    writeFileSync(audioPath, Buffer.from([1, 2, 3]));

    const { stderr, exitCode } = await runCommandE2e(AUTO_ROUTES, [
      "speech",
      "recognize",
      "--model",
      "auto",
      "--url",
      audioPath,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--model/);
  });

  test("speech recognize auto dry-run 预览公网 URL 透传", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTO_ROUTES, [
      "speech",
      "recognize",
      "--model",
      "auto",
      "--url",
      "https://example.com/audio.wav",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<McpPreview>(stdout);
    expect(data.arguments?.file_urls).toEqual(["https://example.com/audio.wav"]);
  });

  test("image generate auto dry-run 预览把 --size 比例映射为 MCP 宽*高", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTO_ROUTES, [
      "image",
      "generate",
      "--model",
      "auto",
      "--prompt",
      "sunset",
      "--size",
      "16:9",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<McpPreview>(stdout);
    expect(data.arguments?.size).toBe("1664*928");
  });

  // auto + MCP 承接不了的 flag → USAGE(2)，绝不静默回退 REST。
  const gateCases: Array<[string, string[], RegExp]> = [
    [
      "image generate --seed",
      ["image", "generate", "--model", "auto", "--prompt", "x", "--seed", "42"],
      /--seed/,
    ],
    [
      "image edit --size",
      [
        "image",
        "edit",
        "--model",
        "auto",
        "--image",
        "https://example.com/a.png",
        "--prompt",
        "x",
        "--size",
        "1024*1024",
      ],
      /--size/,
    ],
    [
      "video generate t2v --seed",
      ["video", "generate", "--model", "auto", "--prompt", "x", "--seed", "1"],
      /--seed/,
    ],
    [
      "video generate i2v --ratio",
      [
        "video",
        "generate",
        "--model",
        "auto",
        "--prompt",
        "x",
        "--image",
        "https://example.com/a.png",
        "--ratio",
        "16:9",
      ],
      /--ratio/,
    ],
    [
      "speech synthesize --format",
      [
        "speech",
        "synthesize",
        "--model",
        "auto",
        "--text",
        "x",
        "--voice",
        "温柔女声",
        "--format",
        "mp3",
      ],
      /--format/,
    ],
    [
      "speech synthesize 非 MCP 枚举音色",
      ["speech", "synthesize", "--model", "auto", "--text", "x", "--voice", "longxiaochun_v3"],
      /longxiaochun_v3/,
    ],
    [
      "image generate 不可映射的 --size",
      ["image", "generate", "--model", "auto", "--prompt", "x", "--size", "2:3"],
      /--size/,
    ],
    [
      "speech synthesize --list-voices",
      ["speech", "synthesize", "--model", "auto", "--list-voices"],
      /--list-voices/,
    ],
    [
      "speech recognize --language",
      [
        "speech",
        "recognize",
        "--model",
        "auto",
        "--url",
        "https://example.com/a.mp3",
        "--language",
        "zh",
      ],
      /--language/,
    ],
    [
      "speech recognize --async",
      ["speech", "recognize", "--model", "auto", "--url", "https://example.com/a.mp3", "--async"],
      /--async/,
    ],
  ];

  test.each(gateCases)("auto 拒绝不支持的 flag: %s (USAGE 2)", async (label, args, pattern) => {
    const { stderr, exitCode } = await runCommandE2e(AUTO_ROUTES, [
      ...args,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, `${label} → ${stderr}`).toBe(2);
    expect(stderr, label).toMatch(pattern);
  });
});

// ---- 真实 MCP 调用（live gated）----
//
// 以上全部是离线 dry-run。以下三条真实打百炼 AIGC MCP，验证 auto 确实能经 MCP
// 出结果并落地文件。默认 skip：需 BAILIAN_E2E=1 + DASHSCOPE_API_KEY；图像 / 语音
// 另受媒体开关控制（默认开），视频耗时长、另需 BAILIAN_E2E_VIDEO=1。
//
// image edit / speech recognize 的真实链路需要合法的图片 / 音频二进制 fixture
// （静音音频会被下游判为“无语音”而 isError），其请求契约已由上面的 dry-run 预览
// 与 data URI 脱敏覆盖，故 live 只覆盖纯 prompt/text 输入的这三条命令。

describe.skipIf(!isBailianE2EMediaEnabled() || !isDashScopeE2EReady())(
  "e2e: aigc auto → mcp（DashScope 媒体，真实调用）",
  () => {
    test("【auto】image generate 真实经 MCP(bailian_image_gen) 出图并落地", async () => {
      const outDir = makeE2eOutputDir("aigc-auto-live-image-generate");
      const { stdout, stderr, exitCode } = await runCommandE2e(AUTO_ROUTES, [
        "image",
        "generate",
        "--model",
        "auto",
        "--prompt",
        "一只简笔画小猫，白底",
        "--out-dir",
        outDir,
        "--out-prefix",
        "e2e-auto-gen",
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ urls?: string[]; saved?: string[]; total?: number }>(stdout);
      expect(data.saved?.length ?? 0).toBeGreaterThan(0);
      expect(data.saved?.[0]).toContain("e2e-auto-gen");
      expect(data.urls?.length ?? 0).toBeGreaterThan(0);
    }, 300_000);

    test("【auto】speech synthesize 真实经 MCP(bailian_tts) 合成并落地", async () => {
      const outDir = makeE2eOutputDir("aigc-auto-live-speech-synthesize");
      const outWav = join(outDir, "e2e-auto-tts.wav");
      const { stdout, stderr, exitCode } = await runCommandE2e(AUTO_ROUTES, [
        "speech",
        "synthesize",
        "--model",
        "auto",
        "--text",
        "端到端 auto 语音测试",
        // voice 需为 MCP 音色枚举内的值（REST 音色 ID 会被前置校验拒绝）。
        "--voice",
        "温柔女声",
        "--out",
        outWav,
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ saved?: string; audio_url?: string; voice?: string }>(stdout);
      expect(data.saved).toBe(outWav);
      expect(data.audio_url?.length ?? 0).toBeGreaterThan(0);
      expect(data.voice).toBe("温柔女声");
    }, 180_000);

    test("【auto】image edit 真实经 MCP(bailian_image_edit) 内联本地图并落地", async () => {
      // Self-contained chain: generate a source image first (local path exercises
      // the auto-mode base64 data-URI inlining against the live server).
      const outDir = makeE2eOutputDir("aigc-auto-live-image-edit");
      const generated = await runCommandE2e(AUTO_ROUTES, [
        "image",
        "generate",
        "--model",
        "auto",
        "--prompt",
        "一个红色圆点，白底",
        "--out-dir",
        outDir,
        "--out-prefix",
        "e2e-auto-edit-src",
        "--output",
        "json",
      ]);
      expect(generated.exitCode, generated.stderr).toBe(0);
      const sourceImage = parseStdoutJson<{ saved?: string[] }>(generated.stdout).saved?.[0];
      expect(sourceImage).toBeDefined();

      const { stdout, stderr, exitCode } = await runCommandE2e(AUTO_ROUTES, [
        "image",
        "edit",
        "--model",
        "auto",
        "--image",
        sourceImage!,
        "--prompt",
        "把红色圆点改成蓝色圆点",
        "--out-dir",
        outDir,
        "--out-prefix",
        "e2e-auto-edit-out",
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ saved?: string[]; total?: number }>(stdout);
      expect(data.saved?.length ?? 0).toBeGreaterThan(0);
      expect(data.saved?.[0]).toContain("e2e-auto-edit-out");
    }, 600_000);

    test("【auto】speech recognize 真实经 MCP(bailian_speech_to_text) 转写公网音频", async () => {
      // The live MCP ASR server only transcribes public http(s) URLs now:
      // data-URI input returns an empty transcript without error, so the live
      // case feeds the official sample audio instead of a local file.
      const { stdout, stderr, exitCode } = await runCommandE2e(AUTO_ROUTES, [
        "speech",
        "recognize",
        "--model",
        "auto",
        "--url",
        "https://dashscope.oss-cn-beijing.aliyuncs.com/samples/audio/paraformer/hello_world_female2.wav",
      ]);
      expect(exitCode, stderr).toBe(0);
      // The auto ASR branch emits bare transcript lines on stdout.
      expect(stdout).toContain("hello world");
    }, 300_000);
  },
);

describe.skipIf(!isBailianE2EVideoEnabled() || !isDashScopeE2EReady())(
  "e2e: aigc auto → mcp（DashScope 视频，真实调用）",
  () => {
    test("【auto】video generate(t2v) 真实经 MCP 提交→轮询→下载", async () => {
      const outDir = makeE2eOutputDir("aigc-auto-live-video-generate");
      const outMp4 = join(outDir, "e2e-auto-t2v.mp4");
      const { stdout, stderr, exitCode } = await runCommandE2e(AUTO_ROUTES, [
        "video",
        "generate",
        "--model",
        "auto",
        "--prompt",
        "海浪拍打礁石，慢镜头",
        "--download",
        outMp4,
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{
        task_id?: string;
        video_url?: string;
        status?: string;
        saved?: string;
      }>(stdout);
      expect(data.status).toBe("SUCCEEDED");
      expect(data.saved).toBe(outMp4);
      expect(data.video_url?.length ?? 0).toBeGreaterThan(0);
      expect(data.task_id?.length ?? 0).toBeGreaterThan(0);
    }, 600_000);
  },
);
