import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdirSync, readFileSync, rmSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import {
  isBailianE2EMediaEnabled,
  isDashScopeE2EReady,
  makeE2eOutputDir,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
  runCommandInProcess,
} from "./helpers.ts";
import { SPEECH_VOICE_ROUTES } from "./topic-routes.ts";

const DESIGN_TARGET_MODEL = "cosyvoice-v3.5-plus";

function assertDecodableWav(filePath: string, minBytes = 1024): void {
  expect(existsSync(filePath), `missing wav: ${filePath}`).toBe(true);
  const bytes = readFileSync(filePath);
  expect(bytes.byteLength).toBeGreaterThanOrEqual(minBytes);
  expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
  expect(bytes.subarray(8, 12).toString("ascii")).toBe("WAVE");
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

const VALID_PREVIEW_TEXT = "各位听众朋友们大家好，欢迎收听今天的节目。";

describe("e2e: speech voice design help / validation", () => {
  test("design --help shows bilingual prompt flags without --yes", async () => {
    const { stderr, exitCode } = await runCommandHelp(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "design",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--prompt/i);
    expect(stderr).toMatch(/--preview-text/i);
    expect(stderr).toMatch(/Voice description|音色描述/);
    expect(stderr).not.toMatch(/--yes/);
  });

  test("missing required flags → 2", async () => {
    const { exitCode } = await runCommandE2e(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "design",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
  });

  test("prompt/preview-text length bounds", async () => {
    const tooLongPrompt = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "design",
      "--prompt",
      "x".repeat(501),
      "--preview-text",
      VALID_PREVIEW_TEXT,
      "--prefix",
      "demo",
      "--target-model",
      "cosyvoice-v3.5-plus",
      "--quiet",
    ]);
    expect(tooLongPrompt.exitCode).toBe(2);
    expect(tooLongPrompt.stderr).toMatch(/500/);

    const shortPreview = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "design",
      "--prompt",
      "沉稳温暖的中文播音员",
      "--preview-text",
      "太短了",
      "--prefix",
      "demo",
      "--target-model",
      "cosyvoice-v3.5-plus",
      "--quiet",
    ]);
    expect(shortPreview.exitCode).toBe(2);
    expect(shortPreview.stderr).toMatch(/15 and 200|preview-text/i);

    const badFormat = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "design",
      "--prompt",
      "沉稳温暖的中文播音员",
      "--preview-text",
      VALID_PREVIEW_TEXT,
      "--prefix",
      "demo",
      "--target-model",
      "cosyvoice-v3.5-plus",
      "--format",
      "flac",
      "--quiet",
    ]);
    expect(badFormat.exitCode).toBe(2);
    expect(badFormat.stderr).toMatch(/--format/i);
  });
});

describe("e2e: speech voice design dry-run / mock HTTP", () => {
  test("dry-run request is exact and does not create files", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "bl-voice-design-dry-"));
    tempDirs.push(outDir);
    const outPath = join(outDir, "preview.wav");
    const { stdout, stderr, exitCode } = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
      "speech",
      "voice",
      "design",
      "--prompt",
      "沉稳温暖的中文播音员",
      "--preview-text",
      VALID_PREVIEW_TEXT,
      "--prefix",
      "demo",
      "--target-model",
      "cosyvoice-v3.5-plus",
      "--sample-rate",
      "24000",
      "--format",
      "wav",
      "--out",
      outPath,
      "--dry-run",
      "--output",
      "json",
      "--quiet",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(existsSync(outPath)).toBe(false);
    const body = parseStdoutJson<{
      request?: {
        model?: string;
        input?: Record<string, unknown>;
        parameters?: Record<string, unknown>;
      };
    }>(stdout);
    expect(body.request?.model).toBe("voice-enrollment");
    expect(body.request?.input).toEqual({
      action: "create_voice",
      target_model: "cosyvoice-v3.5-plus",
      prefix: "demo",
      voice_prompt: "沉稳温暖的中文播音员",
      preview_text: VALID_PREVIEW_TEXT,
    });
    expect(body.request?.parameters).toEqual({
      sample_rate: 24000,
      response_format: "wav",
    });
    expect(body.request?.input).not.toHaveProperty("audio");
  });

  test("mock HTTP decodes Base64 preview and omits data in JSON result", async () => {
    const wavBytes = Buffer.from("RIFF....WAVEfmt ");
    const server = createServer((incoming, outgoing) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          input?: Record<string, unknown>;
        };
        expect(body.input?.action).toBe("create_voice");
        expect(body.input).not.toHaveProperty("audio");
        outgoing.writeHead(200, { "Content-Type": "application/json" });
        outgoing.end(
          JSON.stringify({
            output: {
              voice_id: "demo-vd-123",
              target_model: "cosyvoice-v3.5-plus",
              preview_audio: {
                data: wavBytes.toString("base64"),
                sample_rate: 24000,
                response_format: "wav",
              },
            },
            usage: { count: 1 },
            request_id: "req-design",
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const outDir = makeE2eOutputDir("speech-voice-design-mock");
    const outPath = join(outDir, "preview.wav");

    try {
      const { stdout, stderr, exitCode } = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
        "speech",
        "voice",
        "design",
        "--prompt",
        "沉稳温暖的中文播音员",
        "--preview-text",
        VALID_PREVIEW_TEXT,
        "--prefix",
        "demo",
        "--target-model",
        "cosyvoice-v3.5-plus",
        "--out",
        outPath,
        "--api-key",
        "sk-e2e",
        "--base-url",
        `http://127.0.0.1:${address.port}`,
        "--output",
        "json",
        "--quiet",
      ]);
      expect(exitCode, stderr).toBe(0);
      expect(existsSync(outPath)).toBe(true);
      expect(readFileSync(outPath)).toEqual(wavBytes);
      const body = parseStdoutJson<{
        saved?: string;
        output?: { voice_id?: string; preview_audio?: { data?: string } };
        request_id?: string;
      }>(stdout);
      expect(body.saved).toBe(outPath);
      expect(body.output?.voice_id).toBe("demo-vd-123");
      expect(body.output?.preview_audio?.data).toBe("<omitted>");
      expect(body.request_id).toBe("req-design");
      expect(stdout).not.toMatch(/RIFF/);
      expect(stdout).not.toContain(wavBytes.toString("base64"));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test("missing preview_audio reports GENERAL and keeps voice id hint", async () => {
    const server = createServer((_incoming, outgoing) => {
      outgoing.writeHead(200, { "Content-Type": "application/json" });
      outgoing.end(
        JSON.stringify({
          output: { voice_id: "demo-vd-no-preview", target_model: "cosyvoice-v3.5-plus" },
          request_id: "req-design",
        }),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    try {
      const result = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
        "speech",
        "voice",
        "design",
        "--prompt",
        "沉稳温暖的中文播音员",
        "--preview-text",
        VALID_PREVIEW_TEXT,
        "--prefix",
        "demo",
        "--target-model",
        "cosyvoice-v3.5-plus",
        "--api-key",
        "sk-e2e",
        "--base-url",
        `http://127.0.0.1:${address.port}`,
        "--quiet",
      ]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/preview|预览|demo-vd-no-preview/i);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test("--out creates missing parent directories", async () => {
    const wavBytes = Buffer.from("RIFF....WAVEfmt ");
    const server = createServer((_incoming, outgoing) => {
      outgoing.writeHead(200, { "Content-Type": "application/json" });
      outgoing.end(
        JSON.stringify({
          output: {
            voice_id: "demo-vd-mkdir-ok",
            target_model: "cosyvoice-v3.5-plus",
            preview_audio: {
              data: wavBytes.toString("base64"),
              response_format: "wav",
              sample_rate: 24000,
            },
          },
          request_id: "req-design-mkdir-ok",
        }),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const tempDir = mkdtempSync(join(tmpdir(), "bl-voice-design-mkdir-ok-"));
    tempDirs.push(tempDir);
    const nestedOut = join(tempDir, "nested", "dir", "preview.wav");
    try {
      const { stdout, stderr, exitCode } = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
        "speech",
        "voice",
        "design",
        "--prompt",
        "沉稳温暖的中文播音员",
        "--preview-text",
        VALID_PREVIEW_TEXT,
        "--prefix",
        "demo",
        "--target-model",
        "cosyvoice-v3.5-plus",
        "--out",
        nestedOut,
        "--api-key",
        "sk-e2e",
        "--base-url",
        `http://127.0.0.1:${address.port}`,
        "--output",
        "json",
        "--quiet",
      ]);
      expect(exitCode, stderr).toBe(0);
      expect(existsSync(nestedOut)).toBe(true);
      expect(readFileSync(nestedOut)).toEqual(wavBytes);
      const body = parseStdoutJson<{ saved?: string; output?: { voice_id?: string } }>(stdout);
      expect(body.saved).toBe(nestedOut);
      expect(body.output?.voice_id).toBe("demo-vd-mkdir-ok");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test("save path failure after create still reports voice_id", async () => {
    const wavBytes = Buffer.from("RIFF....WAVEfmt ");
    const server = createServer((_incoming, outgoing) => {
      outgoing.writeHead(200, { "Content-Type": "application/json" });
      outgoing.end(
        JSON.stringify({
          output: {
            voice_id: "demo-vd-save-fail",
            target_model: "cosyvoice-v3.5-plus",
            preview_audio: {
              data: wavBytes.toString("base64"),
              response_format: "wav",
              sample_rate: 24000,
            },
          },
          request_id: "req-design-save",
        }),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const tempDir = mkdtempSync(join(tmpdir(), "bl-voice-design-save-"));
    tempDirs.push(tempDir);
    // --out points at an existing directory so writeFileSync fails after create.
    const badOut = join(tempDir, "is-a-directory");
    mkdirSync(badOut);
    try {
      const result = await runCommandInProcess(SPEECH_VOICE_ROUTES, [
        "speech",
        "voice",
        "design",
        "--prompt",
        "沉稳温暖的中文播音员",
        "--preview-text",
        VALID_PREVIEW_TEXT,
        "--prefix",
        "demo",
        "--target-model",
        "cosyvoice-v3.5-plus",
        "--out",
        badOut,
        "--api-key",
        "sk-e2e",
        "--base-url",
        `http://127.0.0.1:${address.port}`,
        "--quiet",
      ]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/demo-vd-save-fail/);
      expect(result.stderr).toMatch(/save|保存|get\/delete|不要重新创建|do not recreate/i);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test("output dir mkdir failure after create still reports voice_id", async () => {
    const wavBytes = Buffer.from("RIFF....WAVEfmt ");
    const server = createServer((_incoming, outgoing) => {
      outgoing.writeHead(200, { "Content-Type": "application/json" });
      outgoing.end(
        JSON.stringify({
          output: {
            voice_id: "demo-vd-mkdir-fail",
            target_model: "cosyvoice-v3.5-plus",
            preview_audio: {
              data: wavBytes.toString("base64"),
              response_format: "wav",
              sample_rate: 24000,
            },
          },
          request_id: "req-design-mkdir",
        }),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const tempDir = mkdtempSync(join(tmpdir(), "bl-voice-design-mkdir-"));
    tempDirs.push(tempDir);
    // Make default ~/bailian-output a file so resolveOutputDir mkdir fails.
    writeFileSync(join(tempDir, "bailian-output"), "not-a-directory");
    try {
      const result = await runCommandInProcess(
        SPEECH_VOICE_ROUTES,
        [
          "speech",
          "voice",
          "design",
          "--prompt",
          "沉稳温暖的中文播音员",
          "--preview-text",
          VALID_PREVIEW_TEXT,
          "--prefix",
          "demo",
          "--target-model",
          "cosyvoice-v3.5-plus",
          "--api-key",
          "sk-e2e",
          "--base-url",
          `http://127.0.0.1:${address.port}`,
          "--quiet",
        ],
        { HOME: tempDir },
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/demo-vd-mkdir-fail/);
      expect(result.stderr).toMatch(/save|保存|get\/delete|不要重新创建|do not recreate/i);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe.skipIf(!isBailianE2EMediaEnabled() || !isDashScopeE2EReady())(
  "e2e: speech voice design (live)",
  () => {
    test("design → get → synthesize with voice_id → delete", async () => {
      const outDir = makeE2eOutputDir("speech-voice-design-live");
      const previewPath = join(outDir, "design-preview.wav");
      const synthPath = join(outDir, "design-synth.wav");
      const prefix = `bl${Date.now().toString(36).slice(-6)}`;
      let voiceId = "";
      try {
        const created = await runCommandE2e(SPEECH_VOICE_ROUTES, [
          "speech",
          "voice",
          "design",
          "--prompt",
          "Calm warm Chinese announcer voice for a short news brief",
          "--preview-text",
          VALID_PREVIEW_TEXT,
          "--prefix",
          prefix,
          "--target-model",
          DESIGN_TARGET_MODEL,
          "--format",
          "wav",
          "--out",
          previewPath,
          "--output",
          "json",
          "--quiet",
        ]);
        expect(created.exitCode, created.stderr).toBe(0);
        const body = parseStdoutJson<{
          output?: { voice_id?: string; preview_audio?: { data?: string } };
          saved?: string;
        }>(created.stdout);
        voiceId = body.output?.voice_id ?? "";
        expect(voiceId).toMatch(/\S+/);
        expect(body.saved).toBe(previewPath);
        expect(body.output?.preview_audio?.data).toBe("<omitted>");
        assertDecodableWav(previewPath);

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
        expect(
          parseStdoutJson<{ output?: { target_model?: string } }>(got.stdout).output?.target_model,
        ).toBe(DESIGN_TARGET_MODEL);

        // Design voice may still be DEPLOYING briefly; wait before matched-model synthesize.
        {
          const deadline = Date.now() + 90_000;
          let lastStatus = "";
          while (Date.now() < deadline) {
            const statusResult = await runCommandE2e(SPEECH_VOICE_ROUTES, [
              "speech",
              "voice",
              "get",
              "--id",
              voiceId,
              "--output",
              "json",
              "--quiet",
            ]);
            expect(statusResult.exitCode, statusResult.stderr).toBe(0);
            lastStatus =
              parseStdoutJson<{ output?: { status?: string } }>(statusResult.stdout).output
                ?.status ?? "";
            if (lastStatus === "OK") break;
            await new Promise<void>((resolve) => setTimeout(resolve, 3000));
          }
          expect(lastStatus).toBe("OK");
        }

        const withDesign = await runCommandE2e(SPEECH_VOICE_ROUTES, [
          "speech",
          "synthesize",
          "--model",
          DESIGN_TARGET_MODEL,
          "--voice",
          voiceId,
          "--text",
          "这是设计音色的试听。",
          "--format",
          "wav",
          "--out",
          synthPath,
          "--output",
          "json",
          "--quiet",
        ]);
        expect(withDesign.exitCode, withDesign.stderr).toBe(0);
        const synthBody = parseStdoutJson<{ saved?: string; voice?: string; model?: string }>(
          withDesign.stdout,
        );
        expect(synthBody.saved).toBe(synthPath);
        expect(synthBody.voice).toBe(voiceId);
        expect(synthBody.model).toBe(DESIGN_TARGET_MODEL);
        assertDecodableWav(synthPath);
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
  },
);
