import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import {
  isSpeechGenerateE2EReady,
  makeE2eOutputDir,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
  runCommandInProcess,
} from "./helpers.ts";
import { SPEECH_GENERATE_ROUTES } from "./topic-routes.ts";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

function makeTempWav(size = 44): string {
  const tempDir = mkdtempSync(join(tmpdir(), "bl-speech-gen-"));
  tempDirs.push(tempDir);
  const filePath = join(tempDir, "ref.wav");
  writeFileSync(filePath, Buffer.alloc(size, 1));
  return filePath;
}

describe("e2e: speech generate help / validation", () => {
  test("help is bilingual and has no voice/async flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(SPEECH_GENERATE_ROUTES, [
      "speech",
      "generate",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--text-prompt/i);
    expect(stderr).toMatch(/Audio generation prompt|音频生成提示词/);
    expect(stderr).not.toMatch(/--voice\b/);
    expect(stderr).not.toMatch(/--async\b/);
  });

  test("missing/blank text-prompt → 2", async () => {
    const missing = await runCommandE2e(SPEECH_GENERATE_ROUTES, ["speech", "generate", "--quiet"]);
    expect(missing.exitCode).toBe(2);

    const blank = await runCommandInProcess(SPEECH_GENERATE_ROUTES, [
      "speech",
      "generate",
      "--text-prompt",
      "   ",
      "--quiet",
    ]);
    expect(blank.exitCode).toBe(2);
  });

  test("rejects overlong prompt, 4 references, missing local file, @voice overflow", async () => {
    const tooLong = await runCommandInProcess(SPEECH_GENERATE_ROUTES, [
      "speech",
      "generate",
      "--text-prompt",
      "x".repeat(3001),
      "--workspace-id",
      "ws_test",
      "--quiet",
    ]);
    expect(tooLong.exitCode).toBe(2);
    expect(tooLong.stderr).toMatch(/3000/);

    const fourAudio = await runCommandInProcess(SPEECH_GENERATE_ROUTES, [
      "speech",
      "generate",
      "--text-prompt",
      "hello",
      "--audio",
      "https://a",
      "--audio",
      "https://b",
      "--audio",
      "https://c",
      "--audio",
      "https://d",
      "--workspace-id",
      "ws_test",
      "--quiet",
    ]);
    expect(fourAudio.exitCode).toBe(2);
    expect(fourAudio.stderr).toMatch(/at most 3|--audio/i);

    const missingFile = await runCommandInProcess(SPEECH_GENERATE_ROUTES, [
      "speech",
      "generate",
      "--text-prompt",
      "用 @voice1 介绍天气",
      "--audio",
      "/tmp/bl-speech-gen-does-not-exist.wav",
      "--workspace-id",
      "ws_test",
      "--dry-run",
      "--quiet",
    ]);
    expect(missingFile.exitCode).toBe(2);
    expect(missingFile.stderr).toMatch(/not found|找不到|Audio file/i);

    const overflow = await runCommandInProcess(SPEECH_GENERATE_ROUTES, [
      "speech",
      "generate",
      "--text-prompt",
      "用 @voice2 说话",
      "--audio",
      "https://example.com/a.wav",
      "--workspace-id",
      "ws_test",
      "--quiet",
    ]);
    expect(overflow.exitCode).toBe(2);
    expect(overflow.stderr).toMatch(/@voice2|reference/i);
  });

  test("rejects malicious workspace id and unsupported region via us base-url", async () => {
    const badWorkspace = await runCommandInProcess(SPEECH_GENERATE_ROUTES, [
      "speech",
      "generate",
      "--text-prompt",
      "hello",
      "--workspace-id",
      "evil.example.com",
      "--dry-run",
      "--quiet",
    ]);
    expect(badWorkspace.exitCode).toBe(2);
    expect(badWorkspace.stderr).toMatch(/Workspace ID|点号|underscores/i);

    const usBase = await runCommandInProcess(SPEECH_GENERATE_ROUTES, [
      "speech",
      "generate",
      "--text-prompt",
      "hello",
      "--base-url",
      "https://dashscope-us.aliyuncs.com",
      "--api-key",
      "sk-e2e",
      "--dry-run",
      "--quiet",
    ]);
    expect(usBase.exitCode).toBe(2);
    expect(usBase.stderr).toMatch(/us|美国|not available/i);
  });
});

describe("e2e: speech generate dry-run / mock HTTP", () => {
  test("dry-run without --audio omits references and uses Beijing MaaS", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(SPEECH_GENERATE_ROUTES, [
      "speech",
      "generate",
      "--workspace-id",
      "ws_test",
      "--text-prompt",
      "hi",
      "--dry-run",
      "--output",
      "json",
      "--quiet",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      endpoint?: string;
      request?: { input?: Record<string, unknown> };
    }>(stdout);
    expect(body.endpoint).toBe(
      "https://ws_test.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer",
    );
    expect(body.request?.input).toBeDefined();
    expect("references" in (body.request?.input ?? {})).toBe(false);
  });

  test("dry-run with workspace builds MaaS endpoint and redacts local audio", async () => {
    const wav = makeTempWav();
    const { stdout, stderr, exitCode } = await runCommandInProcess(SPEECH_GENERATE_ROUTES, [
      "speech",
      "generate",
      "--workspace-id",
      "ws_test",
      "--text-prompt",
      "用 @voice1 的声音介绍今天的天气。",
      "--audio",
      wav,
      "--volume",
      "0",
      "--aigc-tag",
      "false",
      "--dry-run",
      "--output",
      "json",
      "--quiet",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      endpoint?: string;
      request?: {
        model?: string;
        input?: {
          text_prompt?: string;
          references?: Array<{ audio_data?: string; audio_url?: string }>;
          volume?: number;
          enable_aigc_tag?: boolean;
          format?: string;
        };
      };
    }>(stdout);
    expect(body.endpoint).toBe(
      "https://ws_test.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer",
    );
    expect(body.request?.model).toBe("qwen-audio-3.1-tts-next");
    expect(body.request?.input?.text_prompt).toBe("用 @voice1 的声音介绍今天的天气。");
    expect(body.request?.input?.format).toBe("wav");
    expect(body.request?.input?.volume).toBe(0);
    expect(body.request?.input?.enable_aigc_tag).toBe(false);
    expect(body.request?.input?.references?.[0]?.audio_data).toMatch(/pending-encode|<omitted>/);
  });

  test("explicit base-url dry-run does not require workspace", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(SPEECH_GENERATE_ROUTES, [
      "speech",
      "generate",
      "--text-prompt",
      "生成短播客",
      "--base-url",
      "https://proxy.example.test",
      "--api-key",
      "sk-e2e",
      "--dry-run",
      "--output",
      "json",
      "--quiet",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{ endpoint?: string }>(stdout);
    expect(body.endpoint).toBe(
      "https://proxy.example.test/api/v1/services/audio/tts/SpeechSynthesizer",
    );
  });

  test("default missing workspace → USAGE", async () => {
    const result = await runCommandInProcess(SPEECH_GENERATE_ROUTES, [
      "speech",
      "generate",
      "--text-prompt",
      "hello",
      "--dry-run",
      "--quiet",
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/Workspace ID|工作空间/i);
  });

  test("dry-run rejects bare PCM Data URI and non-allowlisted local formats", async () => {
    const pcmDataUri = await runCommandInProcess(SPEECH_GENERATE_ROUTES, [
      "speech",
      "generate",
      "--workspace-id",
      "ws_test",
      "--text-prompt",
      "用 @voice1 介绍",
      "--audio",
      "data:audio/pcm;base64,AAAA",
      "--dry-run",
      "--quiet",
    ]);
    expect(pcmDataUri.exitCode).toBe(2);
    expect(pcmDataUri.stderr).toMatch(/pcm|WAV.*MP3|OGG Opus|Unsupported reference/i);

    const tempDir = mkdtempSync(join(tmpdir(), "bl-speech-gen-size-"));
    tempDirs.push(tempDir);
    // Official generate limit is raw file size; ~8 MiB must still pass dry-run.
    const midWav = join(tempDir, "mid.wav");
    writeFileSync(midWav, Buffer.alloc(44, 0));
    truncateSync(midWav, 8 * 1024 * 1024);
    const midFile = await runCommandInProcess(SPEECH_GENERATE_ROUTES, [
      "speech",
      "generate",
      "--workspace-id",
      "ws_test",
      "--text-prompt",
      "用 @voice1 介绍",
      "--audio",
      midWav,
      "--dry-run",
      "--quiet",
      "--output",
      "json",
    ]);
    expect(midFile.exitCode, midFile.stderr).toBe(0);

    const oversizeWav = join(tempDir, "huge.wav");
    writeFileSync(oversizeWav, Buffer.alloc(44, 0));
    truncateSync(oversizeWav, 10 * 1024 * 1024 + 1);
    const oversizeFile = await runCommandInProcess(SPEECH_GENERATE_ROUTES, [
      "speech",
      "generate",
      "--workspace-id",
      "ws_test",
      "--text-prompt",
      "用 @voice1 介绍",
      "--audio",
      oversizeWav,
      "--dry-run",
      "--quiet",
    ]);
    expect(oversizeFile.exitCode).toBe(2);
    expect(oversizeFile.stderr).toMatch(/10 MB|exceeds/i);
    expect(oversizeFile.stderr).not.toMatch(/Base64/i);

    const badDir = mkdtempSync(join(tmpdir(), "bl-speech-gen-bad-"));
    tempDirs.push(badDir);
    const flacPath = join(badDir, "ref.flac");
    writeFileSync(flacPath, "fake-flac");
    const flac = await runCommandInProcess(SPEECH_GENERATE_ROUTES, [
      "speech",
      "generate",
      "--workspace-id",
      "ws_test",
      "--text-prompt",
      "用 @voice1 介绍",
      "--audio",
      flacPath,
      "--dry-run",
      "--quiet",
    ]);
    expect(flac.exitCode).toBe(2);
    expect(flac.stderr).toMatch(/\.flac|WAV.*MP3|OGG Opus|Unsupported reference/i);

    const pcmPath = join(badDir, "ref.pcm");
    writeFileSync(pcmPath, Buffer.alloc(16));
    const pcmFile = await runCommandInProcess(SPEECH_GENERATE_ROUTES, [
      "speech",
      "generate",
      "--workspace-id",
      "ws_test",
      "--text-prompt",
      "用 @voice1 介绍",
      "--audio",
      pcmPath,
      "--dry-run",
      "--quiet",
    ]);
    expect(pcmFile.exitCode).toBe(2);
    expect(pcmFile.stderr).toMatch(/\.pcm|WAV.*MP3|OGG Opus|Unsupported reference/i);
  });

  test("mock HTTP downloads audio.url; bad out-prefix fails with zero POSTs", async () => {
    const audioPayload = Buffer.from("fake-audio-bytes");
    let synthesizePosts = 0;
    const server = createServer((incoming, outgoing) => {
      const url = incoming.url ?? "";
      if (url.startsWith("/api/v1/services/audio/tts/SpeechSynthesizer")) {
        synthesizePosts += 1;
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
        incoming.on("end", () => {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
            model?: string;
            input?: { text_prompt?: string };
          };
          expect(body.model).toBe("qwen-audio-3.1-tts-next");
          expect(body.input?.text_prompt).toBeTruthy();
          expect(incoming.headers.authorization).toBe("Bearer sk-e2e");
          const address = server.address() as AddressInfo;
          outgoing.writeHead(200, { "Content-Type": "application/json" });
          outgoing.end(
            JSON.stringify({
              output: {
                audio: {
                  url: `http://127.0.0.1:${address.port}/audio.wav`,
                  data: "",
                  id: "audio-1",
                  expires_at: "2099-01-01T00:00:00Z",
                  duration: 1.5,
                },
              },
              usage: { characters: 10 },
              request_id: "req-gen",
            }),
          );
        });
        return;
      }
      if (url.startsWith("/audio.wav")) {
        outgoing.writeHead(200, { "Content-Type": "audio/wav" });
        outgoing.end(audioPayload);
        return;
      }
      outgoing.writeHead(404);
      outgoing.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const outDir = makeE2eOutputDir("speech-generate-mock");

    try {
      const badPrefix = await runCommandInProcess(SPEECH_GENERATE_ROUTES, [
        "speech",
        "generate",
        "--text-prompt",
        "短播客",
        "--base-url",
        `http://127.0.0.1:${address.port}`,
        "--api-key",
        "sk-e2e",
        "--out-dir",
        outDir,
        "--out-prefix",
        "../escape",
        "--quiet",
      ]);
      expect(badPrefix.exitCode).toBe(2);
      expect(badPrefix.stderr).toMatch(/out-prefix|filename/i);
      expect(synthesizePosts).toBe(0);

      const ok = await runCommandInProcess(SPEECH_GENERATE_ROUTES, [
        "speech",
        "generate",
        "--text-prompt",
        "短播客",
        "--base-url",
        `http://127.0.0.1:${address.port}`,
        "--api-key",
        "sk-e2e",
        "--out-dir",
        outDir,
        "--out-prefix",
        "sample",
        "--output",
        "json",
        "--quiet",
      ]);
      expect(ok.exitCode, ok.stderr).toBe(0);
      expect(synthesizePosts).toBe(1);
      const body = parseStdoutJson<{
        saved?: string;
        url?: string;
        model?: string;
        output?: { audio?: { id?: string; duration?: number } };
        request_id?: string;
      }>(ok.stdout);
      expect(body.model).toBe("qwen-audio-3.1-tts-next");
      expect(body.saved).toBe(join(outDir, "sample.wav"));
      expect(existsSync(body.saved!)).toBe(true);
      expect(readFileSync(body.saved!)).toEqual(audioPayload);
      expect(body.output?.audio?.id).toBe("audio-1");
      expect(body.output?.audio?.duration).toBe(1.5);
      expect(body.request_id).toBe("req-gen");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test("download HTTP failure keeps request_id and audio URL", async () => {
    let synthesizePosts = 0;
    const server = createServer((incoming, outgoing) => {
      const url = incoming.url ?? "";
      if (url.startsWith("/api/v1/services/audio/tts/SpeechSynthesizer")) {
        synthesizePosts += 1;
        const address = server.address() as AddressInfo;
        outgoing.writeHead(200, { "Content-Type": "application/json" });
        outgoing.end(
          JSON.stringify({
            output: {
              audio: {
                url: `http://127.0.0.1:${address.port}/audio.wav`,
                data: "",
                id: "audio-1",
                expires_at: "2099-01-01T00:00:00Z",
                duration: 1.5,
              },
            },
            usage: { characters: 10 },
            request_id: "req-gen-dl-fail",
          }),
        );
        return;
      }
      if (url.startsWith("/audio.wav")) {
        outgoing.writeHead(403, { "Content-Type": "text/plain" });
        outgoing.end("forbidden");
        return;
      }
      outgoing.writeHead(404);
      outgoing.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const outDir = makeE2eOutputDir("speech-generate-dl-fail");

    try {
      const failed = await runCommandInProcess(SPEECH_GENERATE_ROUTES, [
        "speech",
        "generate",
        "--text-prompt",
        "短播客",
        "--base-url",
        `http://127.0.0.1:${address.port}`,
        "--api-key",
        "sk-e2e",
        "--out-dir",
        outDir,
        "--out-prefix",
        "sample",
        "--quiet",
      ]);
      expect(failed.exitCode).not.toBe(0);
      expect(synthesizePosts).toBe(1);
      expect(failed.stderr).toMatch(/Download failed: HTTP 403/);
      expect(failed.stderr).toMatch(/request_id=req-gen-dl-fail/);
      // Signed URL stays in the hint (CLI recovery), not as message `url=` for telemetry.
      expect(failed.stderr).toMatch(
        new RegExp(`http://127\\.0\\.0\\.1:${address.port}/audio\\.wav`),
      );
      expect(failed.stderr).not.toMatch(/url=http:\/\//);
      expect(failed.stderr).toMatch(/do not regenerate|勿重新生成/i);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe.skipIf(!isSpeechGenerateE2EReady())("e2e: speech generate (live)", () => {
  test("generate downloads a decodable wav via workspace MaaS", async () => {
    const workspaceId = process.env.BAILIAN_WORKSPACE_ID!.trim();
    const outDir = makeE2eOutputDir("speech-generate-live");
    const savedPath = join(outDir, "live-sample.wav");
    const result = await runCommandE2e(SPEECH_GENERATE_ROUTES, [
      "speech",
      "generate",
      "--workspace-id",
      workspaceId,
      "--text-prompt",
      "用轻松的语气说一句：今天天气不错。",
      "--out-dir",
      outDir,
      "--out-prefix",
      "live-sample",
      "--format",
      "wav",
      "--output",
      "json",
      "--quiet",
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    const body = parseStdoutJson<{ saved?: string; model?: string }>(result.stdout);
    expect(body.model).toBe("qwen-audio-3.1-tts-next");
    expect(body.saved).toBe(savedPath);
    expect(existsSync(savedPath)).toBe(true);
    const bytes = readFileSync(savedPath);
    expect(bytes.byteLength).toBeGreaterThan(1024);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WAVE");
  }, 180_000);
});
