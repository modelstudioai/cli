import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { makeE2eOutputDir, parseStdoutJson, runCommandE2e } from "./helpers.ts";
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

  test("speech synthesize auto dry-run 预览走 TextGenerateSpeech/bailian_tts（透传 voice）", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(AUTO_ROUTES, [
      "speech",
      "synthesize",
      "--model",
      "auto",
      "--text",
      "hello",
      "--voice",
      "longxiaochun_v3",
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
    expect(data.arguments?.voice).toBe("longxiaochun_v3");
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

  test("speech recognize auto 本地音频内联为脱敏 data URI", async () => {
    const configDir = makeE2eOutputDir("aigc-auto-speech-recognize-local");
    const audioPath = join(configDir, "input.wav");
    writeFileSync(audioPath, Buffer.from([1, 2, 3]));

    const { stdout, stderr, exitCode } = await runCommandE2e(AUTO_ROUTES, [
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
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<McpPreview>(stdout);
    expect(data.arguments?.file_urls).toEqual(["data:audio/wav;base64,<omitted>"]);
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
        "longxiaochun_v3",
        "--format",
        "mp3",
      ],
      /--format/,
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
