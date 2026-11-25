import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import {
  isBailianE2EVideoEnabled,
  isDashScopeE2EReady,
  makeE2eOutputDir,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
  runCommandInProcess,
} from "./helpers.ts";
import { VIDEO_RETALK_ROUTES } from "./topic-routes.ts";

const servers: Server[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

async function startServer(
  handler: (request: IncomingMessage, response: ServerResponse, body: string) => void,
): Promise<{
  origin: string;
  requests: Array<{
    method?: string;
    path: string;
    headers: IncomingMessage["headers"];
    body: string;
  }>;
}> {
  const requests: Array<{
    method?: string;
    path: string;
    headers: IncomingMessage["headers"];
    body: string;
  }> = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      requests.push({
        method: request.method,
        path: url.pathname,
        headers: request.headers,
        body,
      });
      handler(request, response, body);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP address");
  return { origin: `http://127.0.0.1:${address.port}`, requests };
}

describe("e2e: video retalk", () => {
  test("help shows bilingual flags and fixed model", async () => {
    const { stderr, exitCode } = await runCommandHelp(VIDEO_RETALK_ROUTES, [
      "video",
      "retalk",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--video/);
    expect(stderr).toMatch(/--audio/);
    expect(stderr).toMatch(/face|阈值|170/);
    expect(stderr).toMatch(/videoretalk/);
    expect(stderr).not.toMatch(/--model/);
    expect(stderr).not.toMatch(/--concurrent/);
  });

  test("missing required flags → 2", async () => {
    const missingVideo = await runCommandInProcess(VIDEO_RETALK_ROUTES, [
      "video",
      "retalk",
      "--audio",
      "https://example.com/a.wav",
    ]);
    expect(missingVideo.exitCode).toBe(2);
    expect(missingVideo.stderr).toMatch(/--video/i);

    const missingAudio = await runCommandInProcess(VIDEO_RETALK_ROUTES, [
      "video",
      "retalk",
      "--video",
      "https://example.com/v.mp4",
    ]);
    expect(missingAudio.exitCode).toBe(2);
    expect(missingAudio.stderr).toMatch(/--audio/i);
  });

  test("face-threshold without ref-image → 2", async () => {
    const { stderr, exitCode } = await runCommandInProcess(VIDEO_RETALK_ROUTES, [
      "video",
      "retalk",
      "--video",
      "https://example.com/v.mp4",
      "--audio",
      "https://example.com/a.wav",
      "--face-threshold",
      "170",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/face-threshold|ref-image/i);
  });

  test("non-ASCII public URL passes through on dry-run", async () => {
    const videoUrl = "https://example.com/视频.mp4";
    const { stdout, stderr, exitCode } = await runCommandInProcess(VIDEO_RETALK_ROUTES, [
      "video",
      "retalk",
      "--video",
      videoUrl,
      "--audio",
      "https://example.com/a.wav",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{ request?: { input?: { video_url?: string } } }>(stdout);
    expect(body.request?.input?.video_url).toBe(videoUrl);
  });

  test("async+download / download-dir / intl base-url → 2", async () => {
    const asyncDownload = await runCommandInProcess(VIDEO_RETALK_ROUTES, [
      "video",
      "retalk",
      "--video",
      "https://example.com/v.mp4",
      "--audio",
      "https://example.com/a.wav",
      "--async",
      "--download",
      "out.mp4",
    ]);
    expect(asyncDownload.exitCode).toBe(2);
    expect(asyncDownload.stderr).toMatch(/--async|--download/i);

    const outDir = makeE2eOutputDir("video-retalk-download-dir");
    tempDirs.push(outDir);
    mkdirSync(outDir, { recursive: true });
    const dirAsDownload = await runCommandInProcess(VIDEO_RETALK_ROUTES, [
      "video",
      "retalk",
      "--video",
      "https://example.com/v.mp4",
      "--audio",
      "https://example.com/a.wav",
      "--download",
      outDir,
    ]);
    expect(dirAsDownload.exitCode).toBe(2);
    expect(dirAsDownload.stderr).toMatch(/regular file|普通文件|directory|目录/i);

    const intl = await runCommandInProcess(VIDEO_RETALK_ROUTES, [
      "video",
      "retalk",
      "--base-url",
      "https://dashscope-intl.aliyuncs.com",
      "--api-key",
      "sk-test",
      "--video",
      "https://example.com/v.mp4",
      "--audio",
      "https://example.com/a.wav",
      "--output",
      "json",
    ]);
    expect(intl.exitCode).toBe(2);
    expect(intl.stderr).toMatch(/Beijing|北京/i);
  });

  test("oss:// media accepted in dry-run", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(VIDEO_RETALK_ROUTES, [
      "video",
      "retalk",
      "--video",
      "oss://bucket/video.mp4",
      "--audio",
      "oss://bucket/audio.wav",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      request?: { input?: { video_url?: string; audio_url?: string } };
    }>(stdout);
    expect(body.request?.input?.video_url).toBe("oss://bucket/video.mp4");
    expect(body.request?.input?.audio_url).toBe("oss://bucket/audio.wav");
  });

  test("dry-run builds image2video body with pending local markers", async () => {
    const fixtureDir = makeE2eOutputDir("video-retalk-dry");
    tempDirs.push(fixtureDir);
    const videoPath = join(fixtureDir, "face.mp4");
    const audioPath = join(fixtureDir, "speech.wav");
    writeFileSync(videoPath, "fake-video");
    writeFileSync(audioPath, "fake-audio");

    const { stdout, stderr, exitCode } = await runCommandInProcess(VIDEO_RETALK_ROUTES, [
      "video",
      "retalk",
      "--video",
      videoPath,
      "--audio",
      audioPath,
      "--video-extension",
      "false",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      endpoint?: string;
      request?: {
        model?: string;
        input?: { video_url?: string; audio_url?: string };
        parameters?: { video_extension?: boolean; query_face_threshold?: number };
      };
    }>(stdout);
    expect(body.endpoint).toMatch(/\/api\/v1\/services\/aigc\/image2video\/video-synthesis$/);
    expect(body.request?.model).toBe("videoretalk");
    expect(body.request?.input?.video_url).toContain("pending-upload");
    expect(body.request?.input?.audio_url).toContain("pending-upload");
    expect(body.request?.parameters?.video_extension).toBe(false);
    expect(body.request?.parameters?.query_face_threshold).toBeUndefined();
  });

  test("async loopback posts Bearer async enable on image2video", async () => {
    const { origin, requests } = await startServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          output: { task_id: "task-retalk-1", task_status: "PENDING" },
          request_id: "req-retalk-1",
        }),
      );
    });

    const { stdout, stderr, exitCode } = await runCommandInProcess(VIDEO_RETALK_ROUTES, [
      "video",
      "retalk",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--video",
      "https://example.com/v.mp4",
      "--audio",
      "https://example.com/a.wav",
      "--async",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{ task_id?: string; request_id?: string }>(stdout);
    expect(body.task_id).toBe("task-retalk-1");
    expect(body.request_id).toBe("req-retalk-1");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.path).toBe("/api/v1/services/aigc/image2video/video-synthesis");
    expect(requests[0]?.headers["x-dashscope-async"]).toBe("enable");
    expect(requests[0]?.headers.authorization).toMatch(/^Bearer /);
  });

  test("wait mode continues through PRE-PROCESSING then downloads", async () => {
    let pollCount = 0;
    const mp4Bytes = Buffer.from("fake-mp4-bytes");
    const { origin } = await startServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "POST") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: { task_id: "task-retalk-2", task_status: "PENDING" },
            request_id: "req-2",
          }),
        );
        return;
      }
      if (url.pathname === "/api/v1/tasks/task-retalk-2") {
        pollCount += 1;
        if (pollCount === 1) {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              output: { task_id: "task-retalk-2", task_status: "PRE-PROCESSING" },
              request_id: "req-2",
            }),
          );
          return;
        }
        if (pollCount === 2) {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              output: { task_id: "task-retalk-2", task_status: "POST-PROCESSING" },
              request_id: "req-2",
            }),
          );
          return;
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: {
              task_id: "task-retalk-2",
              task_status: "SUCCEEDED",
              video_url: `${origin}/out.mp4`,
            },
            request_id: "req-2",
          }),
        );
        return;
      }
      if (url.pathname === "/out.mp4") {
        response.writeHead(200, { "content-type": "video/mp4" });
        response.end(mp4Bytes);
        return;
      }
      response.writeHead(404);
      response.end();
    });

    const outDir = makeE2eOutputDir("video-retalk-wait");
    tempDirs.push(outDir);
    const dest = join(outDir, "retalk.mp4");

    const { stdout, stderr, exitCode } = await runCommandInProcess(VIDEO_RETALK_ROUTES, [
      "video",
      "retalk",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--video",
      "https://example.com/v.mp4",
      "--audio",
      "https://example.com/a.wav",
      "--poll-interval",
      "0.05",
      "--timeout",
      "10",
      "--download",
      dest,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{ task_id?: string; video_url?: string; saved?: string }>(stdout);
    expect(body.task_id).toBe("task-retalk-2");
    expect(body.video_url).toMatch(/out\.mp4$/);
    expect(body.saved).toBe(dest);
    expect(readFileSync(dest).equals(mp4Bytes)).toBe(true);
  });

  test("FAILED returns server message without Task failed prefix", async () => {
    const { origin } = await startServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "POST") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: { task_id: "task-retalk-fail", task_status: "PENDING" },
            request_id: "req-fail",
          }),
        );
        return;
      }
      if (url.pathname === "/api/v1/tasks/task-retalk-fail") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: {
              task_id: "task-retalk-fail",
              task_status: "FAILED",
              code: "InvalidParameter",
              message: "face not detected",
            },
            request_id: "req-fail",
          }),
        );
        return;
      }
      response.writeHead(404);
      response.end();
    });

    const { stderr, exitCode } = await runCommandInProcess(VIDEO_RETALK_ROUTES, [
      "video",
      "retalk",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--video",
      "https://example.com/v.mp4",
      "--audio",
      "https://example.com/a.wav",
      "--poll-interval",
      "0.05",
      "--timeout",
      "10",
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/face not detected/);
    // Server FAILED message stays verbatim; task_id lives in the hint only.
    expect(stderr).not.toMatch(/face not detected task_id=/);
    expect(stderr).toMatch(/task_id[= ]task-retalk-fail|task-retalk-fail/);
    expect(stderr).not.toMatch(/Task failed:/);
  });
});

const retalkLiveVideo = process.env.BAILIAN_E2E_VIDEORETALK_VIDEO_URL?.trim();
const retalkLiveAudio = process.env.BAILIAN_E2E_VIDEORETALK_AUDIO_URL?.trim();

describe.skipIf(
  !isBailianE2EVideoEnabled() || !isDashScopeE2EReady() || !retalkLiveVideo || !retalkLiveAudio,
)("e2e: video retalk（DashScope live）", () => {
  test("videoretalk live retalk drive", async () => {
    const outDir = makeE2eOutputDir("video-retalk-live");
    const { stdout, stderr, exitCode } = await runCommandE2e(VIDEO_RETALK_ROUTES, [
      "video",
      "retalk",
      "--video",
      retalkLiveVideo!,
      "--audio",
      retalkLiveAudio!,
      "--download",
      join(outDir, "retalk-live.mp4"),
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{ video_url?: string; saved?: string }>(stdout);
    expect(body.video_url?.startsWith("https://")).toBe(true);
    expect(body.saved).toBeTruthy();
  }, 3_600_000);
});
