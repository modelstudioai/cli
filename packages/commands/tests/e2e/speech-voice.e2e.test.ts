import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  truncateSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import {
  e2eLabelFromMetaUrl,
  isBailianE2EMediaEnabled,
  isDashScopeE2EReady,
  makeE2eOutputDir,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
  runCommandInProcess,
} from "./helpers.ts";
import { SPEECH_VOICE_ROUTES } from "./topic-routes.ts";

const tempDirs: string[] = [];

const CLONE_TARGET_MODEL = "cosyvoice-v3-flash";
const CLONE_SYSTEM_VOICE = "longxiaochun_v3";
const OMNI_CLONE_TARGET_MODEL = "qwen3.5-omni-flash";

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

/** Build a short mono 16-bit PCM WAV (silence) for offline dry-run / validation only. */
function makeTempWav(seconds = 0.05): string {
  const tempDir = mkdtempSync(join(tmpdir(), "bl-voice-e2e-"));
  tempDirs.push(tempDir);
  const filePath = join(tempDir, "reference.wav");
  const sampleRate = 16000;
  const sampleCount = Math.max(1, Math.floor(sampleRate * seconds));
  const dataBytes = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  writeFileSync(filePath, buffer);
  return filePath;
}

/** Assert a saved audio file exists, has payload, and looks like WAV/MP3. */
function assertDecodableAudioFile(filePath: string, minBytes = 1024): void {
  expect(existsSync(filePath), `missing audio: ${filePath}`).toBe(true);
  const bytes = readFileSync(filePath);
  expect(bytes.byteLength, `audio too small: ${filePath}`).toBeGreaterThanOrEqual(minBytes);
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".wav")) {
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WAVE");
    return;
  }
  if (lower.endsWith(".mp3")) {
    const hasId3 = bytes.subarray(0, 3).toString("ascii") === "ID3";
    const hasFrameSync = bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0;
    expect(hasId3 || hasFrameSync).toBe(true);
  }
}

async function waitForVoiceStatus(
  voiceId: string,
  acceptable: ReadonlySet<string>,
  timeoutMs = 90_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "";
  while (Date.now() < deadline) {
    const got = await runCommandE2e(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "get",
      "--id",
      voiceId,
      "--output",
      "json",
      "--quiet",
    ]);
    expect(got.exitCode, got.stderr).toBe(0);
    lastStatus = parseStdoutJson<{ output?: { status?: string } }>(got.stdout).output?.status ?? "";
    if (acceptable.has(lastStatus)) return lastStatus;
    await new Promise<void>((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`voice ${voiceId} status stayed "${lastStatus}" (wanted ${[...acceptable]})`);
}

describe("e2e: speech voice help / validation", () => {
  test("speech voice --help lists leaf commands", async () => {
    const { stderr, exitCode } = await runCommandHelp(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/clone/i);
    expect(stderr).toMatch(/design/i);
    expect(stderr).toMatch(/list/i);
    expect(stderr).toMatch(/get/i);
    expect(stderr).toMatch(/update/i);
    expect(stderr).toMatch(/delete/i);
    expect(stderr).toMatch(/preview/i);
  });

  test("clone --help shows bilingual audio / prefix flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "clone",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--audio/i);
    expect(stderr).toMatch(/--prefix/i);
    expect(stderr).toMatch(/--target-model/i);
    expect(stderr).toMatch(/Reference audio|参考音频/);
    expect(stderr).toMatch(/omni --model.*--voice|omni --model <同一/);
    expect(stderr).toMatch(/exit 2|退出码 2/);
  });

  test("update/delete --help show Risk and --yes", async () => {
    for (const action of ["update", "delete"] as const) {
      const { stderr, exitCode } = await runCommandHelp(SPEECH_VOICE_ROUTES, [
        "speech",
        "voice",
        action,
        "--help",
      ]);
      expect(exitCode, stderr).toBe(0);
      expect(stderr).toMatch(/--yes/i);
      expect(stderr).toMatch(/Risk|风险/);
    }
  });

  test("clone missing required flags → 2", async () => {
    const { exitCode } = await runCommandE2e(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "clone",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
  });

  test("clone rejects empty/invalid prefix and page bounds", async () => {
    const wav = makeTempWav();
    const badPrefix = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "clone",
      "--audio",
      wav,
      "--prefix",
      "too_long_prefix",
      "--target-model",
      "cosyvoice-v3-flash",
      "--quiet",
    ]);
    expect(badPrefix.exitCode).toBe(2);
    expect(badPrefix.stderr).toMatch(/prefix/i);

    const uppercaseOk = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "clone",
      "--audio",
      "https://example.com/a.wav",
      "--prefix",
      "Demo01",
      "--target-model",
      "cosyvoice-v3-flash",
      "--dry-run",
      "--output",
      "json",
      "--quiet",
    ]);
    expect(uppercaseOk.exitCode, uppercaseOk.stderr).toBe(0);

    const badPage = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "list",
      "--page",
      "0",
      "--quiet",
    ]);
    expect(badPage.exitCode).toBe(2);
    expect(badPage.stderr).toMatch(/--page/i);
  });

  test("clone rejects max-prompt-audio-length outside 3-30", async () => {
    const result = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "clone",
      "--audio",
      "https://example.com/a.wav",
      "--prefix",
      "demo",
      "--target-model",
      "cosyvoice-v3-flash",
      "--max-prompt-audio-length",
      "2",
      "--quiet",
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/max-prompt-audio-length|3 and 30/i);
  });

  test("get rejects blank id", async () => {
    const result = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "get",
      "--id",
      "   ",
      "--quiet",
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/--id/i);
  });

  test("clone dry-run rejects unsupported audio extension and non-audio Data URI", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bl-voice-bad-audio-"));
    tempDirs.push(tempDir);
    const badPath = join(tempDir, "ref.txt");
    writeFileSync(badPath, "not-audio");

    const badExt = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "clone",
      "--audio",
      badPath,
      "--prefix",
      "demo",
      "--target-model",
      "cosyvoice-v3-flash",
      "--dry-run",
      "--quiet",
    ]);
    expect(badExt.exitCode).toBe(2);
    expect(badExt.stderr).toMatch(/Unsupported audio|\.txt/i);

    const badDataUri = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "clone",
      "--audio",
      "data:text/plain;base64,YQ==",
      "--prefix",
      "demo",
      "--target-model",
      "cosyvoice-v3-flash",
      "--dry-run",
      "--quiet",
    ]);
    expect(badDataUri.exitCode).toBe(2);
    expect(badDataUri.stderr).toMatch(/audio\/\*|MIME/i);
  });

  test("CosyVoice uses raw 10 MB file limit; Omni uses Base64 payload limit", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bl-voice-oversize-"));
    tempDirs.push(tempDir);
    // ~8 MiB raw is under CosyVoice file-size limit but over Omni Base64 (~10.67 MiB).
    const midPath = join(tempDir, "mid.wav");
    writeFileSync(midPath, Buffer.alloc(44, 0));
    truncateSync(midPath, 8 * 1024 * 1024);

    const cosyMid = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "clone",
      "--audio",
      midPath,
      "--prefix",
      "demo",
      "--target-model",
      "cosyvoice-v3-flash",
      "--dry-run",
      "--quiet",
      "--output",
      "json",
    ]);
    expect(cosyMid.exitCode, cosyMid.stderr).toBe(0);

    const omniMid = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "clone",
      "--audio",
      midPath,
      "--prefix",
      "guanyu",
      "--target-model",
      "qwen3.5-omni-flash",
      "--dry-run",
      "--quiet",
    ]);
    expect(omniMid.exitCode).toBe(2);
    expect(omniMid.stderr).toMatch(/Base64|10 MB|exceeds/i);

    const rawOverPath = join(tempDir, "raw-over.wav");
    writeFileSync(rawOverPath, Buffer.alloc(44, 0));
    truncateSync(rawOverPath, 10 * 1024 * 1024 + 1);

    const cosyOver = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "clone",
      "--audio",
      rawOverPath,
      "--prefix",
      "demo",
      "--target-model",
      "cosyvoice-v3-flash",
      "--dry-run",
      "--quiet",
    ]);
    expect(cosyOver.exitCode).toBe(2);
    expect(cosyOver.stderr).toMatch(/10 MB|exceeds/i);
    expect(cosyOver.stderr).not.toMatch(/Base64/i);

    const updateOver = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "update",
      "--id",
      "voice-x",
      "--audio",
      rawOverPath,
      "--dry-run",
      "--quiet",
    ]);
    expect(updateOver.exitCode).toBe(2);
    expect(updateOver.stderr).toMatch(/10 MB|exceeds/i);
  });
});

describe("e2e: speech voice dry-run / confirmation", () => {
  test("clone --dry-run redacts local wav and keeps false volume normalize", async () => {
    const wav = makeTempWav();
    const { stdout, stderr, exitCode } = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "clone",
      "--audio",
      wav,
      "--prefix",
      "demo",
      "--target-model",
      "cosyvoice-v3-flash",
      "--volume-normalize",
      "false",
      "--preprocess",
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
        input?: Record<string, unknown>;
      };
    }>(stdout);
    expect(body.endpoint).toMatch(/\/api\/v1\/services\/audio\/tts\/customization$/);
    expect(body.request?.model).toBe("voice-enrollment");
    expect(body.request?.input?.action).toBe("create_voice");
    expect(body.request?.input?.enable_volume_normalization).toBe("false");
    expect(body.request?.input?.enable_preprocess).toBe(false);
    expect(String(body.request?.input?.audio)).toMatch(/pending-encode|<omitted>/);
  });

  test("list --page 2 --dry-run maps page_index=1 with defaults", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "list",
      "--page",
      "2",
      "--dry-run",
      "--output",
      "json",
      "--quiet",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      request?: { input?: { page_index?: number; page_size?: number; action?: string } };
    }>(stdout);
    expect(body.request?.input?.action).toBe("list_voice");
    expect(body.request?.input?.page_index).toBe(1);
    expect(body.request?.input?.page_size).toBe(10);
  });

  test("Omni clone dry-run uses qwen-voice-enrollment create + audio.data", async () => {
    const wav = makeTempWav();
    const { stdout, stderr, exitCode } = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "clone",
      "--audio",
      wav,
      "--prefix",
      "guanyu",
      "--target-model",
      "qwen3.5-omni-flash",
      "--language-hint",
      " zh ",
      "--dry-run",
      "--output",
      "json",
      "--quiet",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      request?: {
        model?: string;
        input?: {
          action?: string;
          preferred_name?: string;
          language?: string;
          audio?: { data?: string };
        };
        parameters?: Record<string, unknown>;
      };
    }>(stdout);
    expect(body.request?.model).toBe("qwen-voice-enrollment");
    expect(body.request?.input?.action).toBe("create");
    expect(body.request?.input?.preferred_name).toBe("guanyu");
    expect(body.request?.input?.language).toBe("zh");
    expect(body.request?.input?.audio?.data).toMatch(/pending-encode|<omitted>/);
    expect(body.request?.parameters).toBeUndefined();
  });

  test("rejects Realtime Omni clone target at create time", async () => {
    const rejected = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "clone",
      "--audio",
      "https://example.com/ref.wav",
      "--prefix",
      "chinese",
      "--target-model",
      "qwen3.5-omni-flash-realtime",
      "--dry-run",
      "--quiet",
    ]);
    expect(rejected.exitCode).toBe(2);
    expect(rejected.stderr).toMatch(/Realtime|实时|qwen3\.5-omni-flash(?!-realtime)/i);
    expect(rejected.stderr).not.toMatch(/create_voice|qwen-voice-enrollment/);
  });

  test("rejects unsupported Omni-looking target without CosyVoice fallthrough", async () => {
    const rejected = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "clone",
      "--audio",
      "https://example.com/ref.wav",
      "--prefix",
      "guanyu",
      "--target-model",
      "qwen3.8-omni-flash",
      "--dry-run",
      "--quiet",
    ]);
    expect(rejected.exitCode).toBe(2);
    expect(rejected.stderr).toMatch(/CLI-supported|本 CLI 支持|qwen3\.5-omni-flash/i);
    expect(rejected.stderr).not.toMatch(/create_voice|voice-enrollment(?!-)/);

    const listProtocol = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "list",
      "--target-model",
      "qwen3.8-omni-flash",
      "--dry-run",
      "--output",
      "json",
      "--quiet",
    ]);
    expect(listProtocol.exitCode, listProtocol.stderr).toBe(0);
    const listBody = parseStdoutJson<{ request?: { model?: string; input?: { action?: string } } }>(
      listProtocol.stdout,
    );
    expect(listBody.request?.model).toBe("qwen-voice-enrollment");
    expect(listBody.request?.input?.action).toBe("list");
  });

  test("Omni list/delete dry-run and reject unsupported ops", async () => {
    const listResult = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "list",
      "--target-model",
      "qwen3.5-omni-flash",
      "--dry-run",
      "--output",
      "json",
      "--quiet",
    ]);
    expect(listResult.exitCode, listResult.stderr).toBe(0);
    const listBody = parseStdoutJson<{
      request?: { model?: string; input?: { action?: string; page_index?: number } };
    }>(listResult.stdout);
    expect(listBody.request?.model).toBe("qwen-voice-enrollment");
    expect(listBody.request?.input?.action).toBe("list");
    expect(listBody.request?.input?.page_index).toBe(0);

    const omniVoice = "qwen-omni-vc-guanyu-voice-20250812105009984-838b";
    const deleteResult = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "delete",
      "--id",
      omniVoice,
      "--dry-run",
      "--output",
      "json",
      "--quiet",
    ]);
    expect(deleteResult.exitCode, deleteResult.stderr).toBe(0);
    const deleteBody = parseStdoutJson<{
      request?: { model?: string; input?: { action?: string; voice?: string } };
    }>(deleteResult.stdout);
    expect(deleteBody.request?.model).toBe("qwen-voice-enrollment");
    expect(deleteBody.request?.input?.action).toBe("delete");
    expect(deleteBody.request?.input?.voice).toBe(omniVoice);

    const getResult = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "get",
      "--id",
      omniVoice,
      "--quiet",
    ]);
    expect(getResult.exitCode).toBe(2);
    expect(getResult.stderr).toMatch(/qwen-voice-enrollment|Omni|仅支持/i);

    const designResult = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "design",
      "--prompt",
      "Calm warm Chinese announcer voice for news",
      "--preview-text",
      "Welcome to today's program everyone.",
      "--prefix",
      "demo",
      "--target-model",
      "qwen3.5-omni-flash",
      "--quiet",
    ]);
    expect(designResult.exitCode).toBe(2);
    expect(designResult.stderr).toMatch(/Omni|qwen-voice-enrollment|clone/i);
  });

  test("delete/update --dry-run without --yes previews with zero side effects", async () => {
    for (const args of [
      ["speech", "voice", "delete", "--id", "voice-x", "--dry-run", "--output", "json", "--quiet"],
      [
        "speech",
        "voice",
        "update",
        "--id",
        "voice-x",
        "--audio",
        "https://example.com/a.wav",
        "--dry-run",
        "--output",
        "json",
        "--quiet",
      ],
    ] as const) {
      const { stdout, stderr, exitCode } = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
        ...args,
      ]);
      expect(exitCode, stderr).toBe(0);
      const body = parseStdoutJson<{ request?: { input?: { action?: string } } }>(stdout);
      expect(body.request?.input?.action).toMatch(/delete_voice|update_voice/);
    }
  });

  test("delete/update without --yes → 7 requires_confirmation", async () => {
    for (const args of [
      [
        "speech",
        "voice",
        "delete",
        "--id",
        "voice-x",
        "--api-key",
        "e2e-dummy",
        "--output",
        "json",
      ],
      [
        "speech",
        "voice",
        "update",
        "--id",
        "voice-x",
        "--audio",
        "https://example.com/a.wav",
        "--api-key",
        "e2e-dummy",
        "--output",
        "json",
      ],
    ] as const) {
      const { stderr, exitCode } = await runCommandE2e(SPEECH_VOICE_ROUTES, [...args]);
      expect(exitCode).toBe(7);
      expect(JSON.parse(stderr)).toMatchObject({
        error: { code: 7, type: "requires_confirmation" },
      });
    }
  });
});

describe("e2e: speech voice mock HTTP", () => {
  test("clone/list/get/preview/delete loopback contract", async () => {
    const requests: Array<{ path: string; auth?: string; body: Record<string, unknown> }> = [];
    const server = createServer((incoming, outgoing) => {
      const requestPath = incoming.url ?? "";
      if (requestPath.startsWith("/ref.wav")) {
        outgoing.writeHead(200, { "Content-Type": "audio/wav" });
        outgoing.end(Buffer.from("RIFFWAVEdata"));
        return;
      }
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        const input = (body.input ?? {}) as Record<string, unknown>;
        requests.push({
          path: requestPath,
          auth: incoming.headers.authorization,
          body,
        });
        outgoing.writeHead(200, { "Content-Type": "application/json" });
        if (input.action === "create_voice") {
          outgoing.end(
            JSON.stringify({
              output: { voice_id: "voice-created-1" },
              request_id: "req-create",
              usage: { count: 1 },
            }),
          );
          return;
        }
        if (input.action === "list_voice") {
          outgoing.end(
            JSON.stringify({
              output: {
                voice_list: [
                  { voice_id: "voice-created-1", status: "OK", target_model: "cosyvoice-v3-flash" },
                ],
              },
              request_id: "req-list",
            }),
          );
          return;
        }
        if (input.action === "query_voice") {
          const address = server.address() as AddressInfo;
          outgoing.end(
            JSON.stringify({
              output: {
                voice_id: "voice-created-1",
                status: "DEPLOYING",
                target_model: "cosyvoice-v3-flash",
                resource_link: `http://127.0.0.1:${address.port}/ref.wav`,
              },
              request_id: "req-query",
            }),
          );
          return;
        }
        if (input.action === "delete_voice") {
          outgoing.end(JSON.stringify({ output: {}, request_id: "req-delete" }));
          return;
        }
        outgoing.end(JSON.stringify({ code: "Unexpected", message: "unexpected action" }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const outDir = makeE2eOutputDir("speech-voice-mock");
    const previewPath = join(outDir, "reference.wav");

    try {
      const cloned = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
        "speech",
        "voice",
        "clone",
        "--audio",
        "https://example.com/a.wav",
        "--prefix",
        "demo",
        "--target-model",
        "cosyvoice-v3-flash",
        "--api-key",
        "sk-e2e",
        "--base-url",
        baseUrl,
        "--output",
        "json",
        "--quiet",
      ]);
      expect(cloned.exitCode, cloned.stderr).toBe(0);
      expect(
        parseStdoutJson<{ output?: { voice_id?: string } }>(cloned.stdout).output?.voice_id,
      ).toBe("voice-created-1");

      const listed = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
        "speech",
        "voice",
        "list",
        "--api-key",
        "sk-e2e",
        "--base-url",
        baseUrl,
        "--output",
        "json",
        "--quiet",
      ]);
      expect(listed.exitCode, listed.stderr).toBe(0);

      const got = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
        "speech",
        "voice",
        "get",
        "--id",
        "voice-created-1",
        "--api-key",
        "sk-e2e",
        "--base-url",
        baseUrl,
        "--output",
        "json",
        "--quiet",
      ]);
      expect(got.exitCode, got.stderr).toBe(0);
      expect(parseStdoutJson<{ output?: { status?: string } }>(got.stdout).output?.status).toBe(
        "DEPLOYING",
      );

      const previewed = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
        "speech",
        "voice",
        "preview",
        "--id",
        "voice-created-1",
        "--out",
        previewPath,
        "--api-key",
        "sk-e2e",
        "--base-url",
        baseUrl,
        "--output",
        "json",
        "--quiet",
      ]);
      expect(previewed.exitCode, previewed.stderr).toBe(0);
      expect(existsSync(previewPath)).toBe(true);
      expect(readFileSync(previewPath).toString("utf8")).toContain("RIFF");

      const deleted = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
        "speech",
        "voice",
        "delete",
        "--id",
        "voice-created-1",
        "--yes",
        "--api-key",
        "sk-e2e",
        "--base-url",
        baseUrl,
        "--output",
        "json",
        "--quiet",
      ]);
      expect(deleted.exitCode, deleted.stderr).toBe(0);

      expect(requests.some((entry) => entry.path.includes("/tts/customization"))).toBe(true);
      expect(
        requests.every((entry) => entry.auth === "Bearer sk-e2e" || entry.path.startsWith("/ref")),
      ).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test("preview without resource_link reports local GENERAL", async () => {
    const server = createServer((_incoming, outgoing) => {
      outgoing.writeHead(200, { "Content-Type": "application/json" });
      outgoing.end(
        JSON.stringify({
          output: { voice_id: "voice-design-1", status: "OK" },
          request_id: "req-query",
        }),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    try {
      const result = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
        "speech",
        "voice",
        "preview",
        "--id",
        "voice-design-1",
        "--api-key",
        "sk-e2e",
        "--base-url",
        `http://127.0.0.1:${address.port}`,
        "--quiet",
      ]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/resource_link|参考音频|synthesize/i);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe.skipIf(!isBailianE2EMediaEnabled() || !isDashScopeE2EReady())(
  "e2e: speech voice (DashScope media live)",
  () => {
    test("synthesize → clone → get/list → synthesize with voice_id → delete", async () => {
      const outDir = makeE2eOutputDir(e2eLabelFromMetaUrl(import.meta.url));
      const refWav = join(outDir, "clone-ref.wav");
      const clonedWav = join(outDir, "clone-synth.wav");
      const prefix = `bl${Date.now().toString(36).slice(-6)}`;
      let voiceId = "";

      try {
        // Real speech reference (not silence): enrollment rejects silent / low-SNR clips.
        const reference = await runCommandE2e(SPEECH_VOICE_ROUTES, [
          "speech",
          "synthesize",
          "--model",
          CLONE_TARGET_MODEL,
          "--voice",
          CLONE_SYSTEM_VOICE,
          "--text",
          "各位听众朋友们大家好，欢迎收听今天的节目。今天我们一起聊聊城市夜景。",
          "--format",
          "wav",
          "--out",
          refWav,
          "--output",
          "json",
          "--quiet",
        ]);
        expect(reference.exitCode, reference.stderr).toBe(0);
        assertDecodableAudioFile(refWav);

        const created = await runCommandE2e(SPEECH_VOICE_ROUTES, [
          "speech",
          "voice",
          "clone",
          "--audio",
          refWav,
          "--prefix",
          prefix,
          "--target-model",
          CLONE_TARGET_MODEL,
          "--output",
          "json",
          "--quiet",
        ]);
        expect(created.exitCode, created.stderr).toBe(0);
        voiceId =
          parseStdoutJson<{ output?: { voice_id?: string } }>(created.stdout).output?.voice_id ??
          "";
        expect(voiceId).toMatch(/\S+/);
        writeFileSync(join(outDir, "voice-id.txt"), `${voiceId}\n`);

        const got = await runCommandE2e(SPEECH_VOICE_ROUTES, [
          "speech",
          "voice",
          "get",
          "--id",
          voiceId,
          "--output",
          "json",
          "--quiet",
        ]);
        expect(got.exitCode, got.stderr).toBe(0);
        const getBody = parseStdoutJson<{
          output?: { voice_id?: string; target_model?: string };
        }>(got.stdout);
        expect(getBody.output?.voice_id).toBe(voiceId);
        expect(getBody.output?.target_model).toBe(CLONE_TARGET_MODEL);

        const listed = await runCommandE2e(SPEECH_VOICE_ROUTES, [
          "speech",
          "voice",
          "list",
          "--prefix",
          prefix,
          "--page-size",
          "100",
          "--output",
          "json",
          "--quiet",
        ]);
        expect(listed.exitCode, listed.stderr).toBe(0);
        const listBody = parseStdoutJson<{
          output?: { voice_list?: Array<{ voice_id?: string }> };
        }>(listed.stdout);
        expect(listBody.output?.voice_list?.some((entry) => entry.voice_id === voiceId)).toBe(true);

        await waitForVoiceStatus(voiceId, new Set(["OK"]));

        // Same target model + cloned voice id must synthesize decodable audio.
        const withClone = await runCommandE2e(SPEECH_VOICE_ROUTES, [
          "speech",
          "synthesize",
          "--model",
          CLONE_TARGET_MODEL,
          "--voice",
          voiceId,
          "--text",
          "这是复刻音色的试听。",
          "--format",
          "wav",
          "--out",
          clonedWav,
          "--output",
          "json",
          "--quiet",
        ]);
        expect(withClone.exitCode, withClone.stderr).toBe(0);
        const synthBody = parseStdoutJson<{ saved?: string; voice?: string; model?: string }>(
          withClone.stdout,
        );
        expect(synthBody.saved).toBe(clonedWav);
        expect(synthBody.voice).toBe(voiceId);
        expect(synthBody.model).toBe(CLONE_TARGET_MODEL);
        assertDecodableAudioFile(clonedWav);
      } finally {
        if (voiceId) {
          const deleted = await runCommandE2e(SPEECH_VOICE_ROUTES, [
            "speech",
            "voice",
            "delete",
            "--id",
            voiceId,
            "--yes",
            "--quiet",
          ]);
          expect(deleted.exitCode, deleted.stderr).toBe(0);
        }
      }
    }, 300_000);

    test("Omni clone → omni audio with the same target model → delete", async () => {
      const outDir = makeE2eOutputDir("speech-voice-omni-live");
      const refWav = join(outDir, "omni-clone-ref.wav");
      const audioOut = join(outDir, "omni-cloned-voice.wav");
      const prefix = `om${Date.now().toString(36).slice(-6)}`;
      let voiceId = "";

      try {
        const reference = await runCommandE2e(SPEECH_VOICE_ROUTES, [
          "speech",
          "synthesize",
          "--model",
          CLONE_TARGET_MODEL,
          "--voice",
          CLONE_SYSTEM_VOICE,
          "--text",
          "各位听众朋友们大家好，欢迎收听今天的节目。今天我们一起聊聊城市夜景。",
          "--format",
          "wav",
          "--out",
          refWav,
          "--output",
          "json",
          "--quiet",
        ]);
        expect(reference.exitCode, reference.stderr).toBe(0);
        assertDecodableAudioFile(refWav);

        const created = await runCommandE2e(SPEECH_VOICE_ROUTES, [
          "speech",
          "voice",
          "clone",
          "--audio",
          refWav,
          "--prefix",
          prefix,
          "--target-model",
          OMNI_CLONE_TARGET_MODEL,
          "--language-hint",
          "zh",
          "--output",
          "json",
          "--quiet",
        ]);
        expect(created.exitCode, created.stderr).toBe(0);
        voiceId =
          parseStdoutJson<{ output?: { voice?: string } }>(created.stdout).output?.voice ?? "";
        expect(voiceId).toMatch(/^qwen-omni-vc-/);
        writeFileSync(join(outDir, "omni-voice-id.txt"), `${voiceId}\n`);

        const spoken = await runCommandE2e(SPEECH_VOICE_ROUTES, [
          "omni",
          "--model",
          OMNI_CLONE_TARGET_MODEL,
          "--voice",
          voiceId,
          "--message",
          "请用一句话介绍今天的好天气。",
          "--audio-out",
          audioOut,
          "--output",
          "json",
          "--quiet",
        ]);
        expect(spoken.exitCode, spoken.stderr).toBe(0);
        const body = parseStdoutJson<{ audio_saved?: string; voice?: string; content?: string }>(
          spoken.stdout,
        );
        expect(body.voice).toBe(voiceId);
        expect(body.audio_saved).toBe(audioOut);
        assertDecodableAudioFile(audioOut);
        // `omni` requests audio.format=wav but wraps the streamed Base64 in its own 44-byte
        // WAV header, assuming raw PCM. A second RIFF marker right after that header means the
        // service honored format=wav and we shipped WAV-inside-WAV; the magic-byte check above
        // cannot see it.
        expect(readFileSync(audioOut).subarray(44, 48).toString("ascii")).not.toBe("RIFF");
      } finally {
        if (voiceId) {
          const deleted = await runCommandE2e(SPEECH_VOICE_ROUTES, [
            "speech",
            "voice",
            "delete",
            "--id",
            voiceId,
            "--yes",
            "--quiet",
          ]);
          expect(deleted.exitCode, deleted.stderr).toBe(0);
        }
      }
    }, 600_000);
  },
);
