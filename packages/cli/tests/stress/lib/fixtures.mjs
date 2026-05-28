/**
 * 压测前置资源：音频 / 图片 / 短视频，写入 fixtures/prerequisites.json。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildDisplayCommand, executeSingleCli } from "./cli-runner.mjs";
import { parseImageResult, parseSpeechSynthesizeResult, parseVideoResult } from "./parsers.mjs";

/** 按压测 target 决定需要哪些前置类型 */
export function fixtureKindsForCanonicalTarget(name) {
  const map = {
    "speech-asr": ["audio"],
    "image-edit": ["image"],
    "video-i2v": ["image"],
    "video-ref": ["image"],
    "video-edit": ["video"],
  };
  return map[name] ?? [];
}

/**
 * @param {object} ctx
 * @param {string} ctx.canonicalTarget
 * @param {string} ctx.batchRoot
 * @param {string} ctx.mainTs
 * @param {string} ctx.cliPackage
 * @param {{ reuseFixtures?: boolean, fixturesDir?: string }} ctx.globals
 */
export async function ensurePrerequisites(ctx) {
  const kinds = new Set(fixtureKindsForCanonicalTarget(ctx.canonicalTarget));
  if (kinds.size === 0) {
    return { createdAt: new Date().toISOString(), prerequisites: {} };
  }

  /** 从外部目录拷贝已有 manifest（不改文件，只读） */
  if (ctx.globals?.fixturesDir) {
    const external = ctx.globals.fixturesDir;
    const manifestPath = join(external, "prerequisites.json");
    if (!existsSync(manifestPath)) {
      console.error(`未找到外部 fixtures: ${manifestPath}`);
      process.exit(1);
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    validateManifestHasKinds(manifest, kinds);
    return manifest;
  }

  const fixturesDir = join(ctx.batchRoot, "fixtures");
  mkdirSync(fixturesDir, { recursive: true });
  const manifestPath = join(fixturesDir, "prerequisites.json");

  if (ctx.globals?.reuseFixtures && existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    validateManifestHasKinds(manifest, kinds);
    return manifest;
  }

  const MAX_LOG = Math.max(4096, parseInt(process.env.MAX_LOG_CAPTURE ?? "65536", 10) || 65536);

  /** @type {{ createdAt: string, audio?: object, image?: object, video?: object }} */
  const manifest = { createdAt: new Date().toISOString() };

  const voice = process.env.STRESS_TTS_VOICE?.trim() || "longanyang";

  /** 执行一次 setup CLI，失败则 exit */
  const runSetup = async (label, cliArgs, parseStdout, timeoutOverrideMs) => {
    const displayCommand = buildDisplayCommand(cliArgs);
    const res = await executeSingleCli({
      MAIN_TS: ctx.mainTs,
      CLI_PACKAGE: ctx.cliPackage,
      TIMEOUT_MS: timeoutOverrideMs ?? ctx.setupTimeoutMs ?? 600_000,
      MAX_LOG_CAPTURE: MAX_LOG,
      index: 0,
      displayCommand,
      cliArgs,
      baseRecord: { prompt: `(前置资源:${label})`, runDir: fixturesDir },
      parseStdout: (out) => Promise.resolve(parseStdout(out)),
    });

    if (res.status !== "success") {
      console.error(`前置资源「${label}」失败: ${res.error ?? res.stderr}`);
      process.exit(1);
    }
    return { result: res, displayCommand };
  };

  if (kinds.has("audio")) {
    const outAudio = join(fixturesDir, "setup-audio.mp3");
    const args = [
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
    ];
    const { result, displayCommand } = await runSetup("tts-audio", args, (out) => {
      const p = parseSpeechSynthesizeResult(out);
      return p.ok
        ? {
            ok: true,
            data: {
              setupAudioUrls: p.data.audioUrls,
              setupAudioSaved: p.data.saved,
            },
          }
        : p;
    });
    manifest.audio = {
      url: result.setupAudioUrls?.[0],
      urls: result.setupAudioUrls,
      saved:
        typeof result.setupAudioSaved === "string"
          ? result.setupAudioSaved
          : result.setupAudioSaved?.[0],
      command: displayCommand,
    };
  }

  if (kinds.has("image")) {
    const cliTimeoutSec = Math.ceil((ctx.setupTimeoutMs ?? 600_000) / 1000);
    const args = [
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
      String(cliTimeoutSec),
      "--poll-interval",
      "10",
    ];
    const { result, displayCommand } = await runSetup("image", args, (out) => {
      const p = parseImageResult(out);
      return p.ok
        ? {
            ok: true,
            data: {
              setupUrls: p.data.urls,
              setupSaved: p.data.saved,
            },
          }
        : p;
    });
    manifest.image = {
      urls: result.setupUrls ?? result.urls,
      saved: result.setupSaved ?? result.saved,
      command: displayCommand,
    };
    const firstUrl = manifest.image.urls?.[0];
    const firstSaved = manifest.image.saved?.[0];
    manifest.image.primaryUrl =
      typeof firstUrl === "string"
        ? firstUrl
        : typeof firstSaved === "string"
          ? firstSaved
          : undefined;
  }

  if (kinds.has("video")) {
    const videoTimeout = ctx.videoSetupTimeoutMs ?? 3_600_000;
    const cliTimeoutSec = Math.ceil(videoTimeout / 1000);
    const downloadPath = join(fixturesDir, "setup-video.mp4");
    const args = [
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
      String(cliTimeoutSec),
      "--poll-interval",
      "5",
    ];
    const { result, displayCommand } = await runSetup(
      "video-t2v",
      args,
      (out) => {
        const p = parseVideoResult(out);
        return p.ok
          ? {
              ok: true,
              data: {
                setupVideoUrls: p.data.videoUrls,
                setupVideoSaved: p.data.saved,
              },
            }
          : p;
      },
      videoTimeout,
    );
    manifest.video = {
      video_url: result.setupVideoUrls?.[0] ?? result.videoUrls?.[0],
      saved: result.setupVideoSaved?.[0] ?? result.saved?.[0],
      command: displayCommand,
    };
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  process.stderr.write(`[前置资源] 已写入 ${manifestPath}\n`);

  validateManifestHasKinds(manifest, kinds);
  return manifest;
}

/** @param {object} manifest @param {Set<string>} kinds */
function validateManifestHasKinds(manifest, kinds) {
  for (const k of kinds) {
    if (k === "audio") {
      const a = manifest.audio;
      const savedPath = typeof a?.saved === "string" ? a.saved : undefined;
      const ok =
        a &&
        ((typeof a.url === "string" && a.url.startsWith("http")) ||
          (savedPath && existsSync(savedPath)));
      if (!ok) {
        console.error("manifest 缺少有效 audio（http url 或可读的本地 saved）");
        process.exit(1);
      }
    }
    if (k === "image") {
      const im = manifest.image;
      const urls = im?.urls;
      const savedRaw = im?.saved;
      const saved0 = Array.isArray(savedRaw) ? savedRaw[0] : savedRaw;
      const u =
        typeof im?.primaryUrl === "string"
          ? im.primaryUrl
          : typeof urls?.[0] === "string"
            ? urls[0]
            : saved0;
      if (!u) {
        console.error("manifest 缺少有效 image 资源");
        process.exit(1);
      }
      if (typeof saved0 === "string" && !saved0.startsWith("http") && !existsSync(saved0)) {
        console.error(`manifest 指向的本地图片不存在: ${saved0}`);
        process.exit(1);
      }
    }
    if (k === "video") {
      const v = manifest.video;
      const p = v?.saved || v?.video_url;
      if (!p) {
        console.error("manifest 缺少有效 video 资源");
        process.exit(1);
      }
      if (typeof v?.saved === "string" && !existsSync(v.saved)) {
        console.error(`manifest 指向的本地视频不存在: ${v.saved}`);
        process.exit(1);
      }
    }
  }
}
