/**
 * 全量压测共享前置资源生成：一次性生成 audio + image + video 到共享目录。
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CLI_PACKAGE, resolveMainTs } from "./paths.mjs";
import { buildDisplayCommand, executeSingleCli } from "./cli-runner.mjs";
import { parseImageResult, parseSpeechSynthesizeResult, parseVideoResult } from "./parsers.mjs";
import { writeFileSync } from "node:fs";

/**
 * 生成全部前置资源（audio / image / video），写入统一 manifest。
 * @param {{ suiteRoot: string, cliPackage?: string }} opts
 * @returns {Promise<string>} fixturesDir — 包含 prerequisites.json 的目录路径
 */
export async function generateCombinedFixtures({ suiteRoot, cliPackage }) {
  const CLI_PACKAGE = cliPackage || DEFAULT_CLI_PACKAGE;
  const MAIN_TS = resolveMainTs(CLI_PACKAGE);
  const fixturesDir = join(suiteRoot, "shared-fixtures");
  mkdirSync(fixturesDir, { recursive: true });

  const MAX_LOG = 65536;
  const manifest = { createdAt: new Date().toISOString() };
  const voice = process.env.STRESS_TTS_VOICE?.trim() || "longanyang";

  const runSetup = async (label, cliArgs, parseStdout, timeoutMs = 600_000) => {
    const displayCommand = buildDisplayCommand(cliArgs);
    console.error(`[前置资源] 生成 ${label}…`);
    const res = await executeSingleCli({
      MAIN_TS,
      CLI_PACKAGE,
      TIMEOUT_MS: timeoutMs,
      MAX_LOG_CAPTURE: MAX_LOG,
      index: 0,
      displayCommand,
      cliArgs,
      baseRecord: { prompt: `(前置资源:${label})`, runDir: fixturesDir },
      parseStdout: (out) => Promise.resolve(parseStdout(out)),
    });
    if (res.status !== "success") {
      console.error(`[前置资源] 「${label}」失败: ${res.error ?? res.stderr}`);
      throw new Error(`前置资源「${label}」生成失败`);
    }
    return { result: res, displayCommand };
  };

  // Audio
  const outAudio = join(fixturesDir, "setup-audio.mp3");
  const { result: audioRes, displayCommand: audioCmd } = await runSetup(
    "audio",
    [
      "speech",
      "synthesize",
      "--model",
      "cosyvoice-v3-flash",
      "--voice",
      voice,
      "--text",
      "压测前置语音样本，用于语音识别链路。",
      "--out",
      outAudio,
      "--non-interactive",
      "--output",
      "json",
    ],
    (out) => {
      const p = parseSpeechSynthesizeResult(out);
      return p.ok
        ? { ok: true, data: { setupAudioUrls: p.data.audioUrls, setupAudioSaved: p.data.saved } }
        : p;
    },
  );
  manifest.audio = {
    url: audioRes.setupAudioUrls?.[0],
    urls: audioRes.setupAudioUrls,
    saved:
      typeof audioRes.setupAudioSaved === "string"
        ? audioRes.setupAudioSaved
        : audioRes.setupAudioSaved?.[0],
    command: audioCmd,
  };

  // Image
  const imgTimeoutMs = 600_000;
  const { result: imgRes, displayCommand: imgCmd } = await runSetup(
    "image",
    [
      "image",
      "generate",
      "--model",
      "qwen-image-2.0",
      "--prompt",
      "压测前置图片：一只橘猫坐在窗台，柔和日光。",
      "--out-dir",
      fixturesDir,
      "--out-prefix",
      "stress-setup-image",
      "--non-interactive",
      "--output",
      "json",
      "--timeout",
      String(Math.ceil(imgTimeoutMs / 1000)),
      "--poll-interval",
      "10",
    ],
    (out) => {
      const p = parseImageResult(out);
      return p.ok ? { ok: true, data: { setupUrls: p.data.urls, setupSaved: p.data.saved } } : p;
    },
    imgTimeoutMs,
  );
  manifest.image = {
    urls: imgRes.setupUrls ?? imgRes.urls,
    saved: imgRes.setupSaved ?? imgRes.saved,
    command: imgCmd,
  };
  const firstUrl = manifest.image.urls?.[0];
  const firstSaved = manifest.image.saved?.[0];
  manifest.image.primaryUrl =
    typeof firstUrl === "string"
      ? firstUrl
      : typeof firstSaved === "string"
        ? firstSaved
        : undefined;

  // Video
  const videoTimeoutMs = 3_600_000;
  const downloadPath = join(fixturesDir, "setup-video.mp4");
  const { result: vidRes, displayCommand: vidCmd } = await runSetup(
    "video",
    [
      "video",
      "generate",
      "--model",
      "happyhorse-1.0-t2v",
      "--prompt",
      "压测前置短视频：海浪与静态远景，无明显人物。",
      "--duration",
      "5",
      "--download",
      downloadPath,
      "--non-interactive",
      "--output",
      "json",
      "--timeout",
      String(Math.ceil(videoTimeoutMs / 1000)),
      "--poll-interval",
      "5",
    ],
    (out) => {
      const p = parseVideoResult(out);
      return p.ok
        ? { ok: true, data: { setupVideoUrls: p.data.videoUrls, setupVideoSaved: p.data.saved } }
        : p;
    },
    videoTimeoutMs,
  );
  manifest.video = {
    video_url: vidRes.setupVideoUrls?.[0] ?? vidRes.videoUrls?.[0],
    saved: vidRes.setupVideoSaved?.[0] ?? vidRes.saved?.[0],
    command: vidCmd,
  };

  const manifestPath = join(fixturesDir, "prerequisites.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.error(`[前置资源] 全部就绪: ${manifestPath}`);

  return fixturesDir;
}
