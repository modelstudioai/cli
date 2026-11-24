import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync, rmSync } from "node:fs";
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
import { VIDEO_STYLE_ROUTES } from "./topic-routes.ts";

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

describe("e2e: video style", () => {
  test("help shows bilingual flags and fixed model", async () => {
    const { stderr, exitCode } = await runCommandHelp(VIDEO_STYLE_ROUTES, [
      "video",
      "style",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--video/);
    expect(stderr).toMatch(/Style ID|风格编号/);
    expect(stderr).toMatch(/video-style-transform/);
    expect(stderr).not.toMatch(/--model/);
    expect(stderr).not.toMatch(/--concurrent/);
  });

  test("missing video / local path / non-ASCII → 2", async () => {
    const missing = await runCommandInProcess(VIDEO_STYLE_ROUTES, ["video", "style", "--quiet"]);
    expect(missing.exitCode).toBe(2);
    expect(missing.stderr).toMatch(/--video/i);

    const localPath = await runCommandInProcess(VIDEO_STYLE_ROUTES, [
      "video",
      "style",
      "--video",
      "./clip.mp4",
    ]);
    expect(localPath.exitCode).toBe(2);
    expect(localPath.stderr).toMatch(/public|公网|local|本地/i);

    const nonAscii = await runCommandInProcess(VIDEO_STYLE_ROUTES, [
      "video",
      "style",
      "--video",
      "https://example.com/风格.mp4",
    ]);
    expect(nonAscii.exitCode).toBe(2);
    expect(nonAscii.stderr).toMatch(/non-ASCII|非 ASCII/i);
  });

  test("dry-run preserves style=0 and boolean false", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(VIDEO_STYLE_ROUTES, [
      "video",
      "style",
      "--video",
      "https://example.com/clip.mp4",
      "--style",
      "0",
      "--fps",
      "15",
      "--animate-emotion",
      "false",
      "--min-len",
      "540",
      "--super-resolution",
      "true",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      endpoint?: string;
      request?: {
        model?: string;
        input?: { video_url?: string };
        parameters?: {
          style?: number;
          video_fps?: number;
          animate_emotion?: boolean;
          min_len?: number;
          use_SR?: boolean;
        };
      };
    }>(stdout);
    expect(body.endpoint).toMatch(/\/api\/v1\/services\/aigc\/video-generation\/video-synthesis$/);
    expect(body.request?.model).toBe("video-style-transform");
    expect(body.request?.input?.video_url).toBe("https://example.com/clip.mp4");
    expect(body.request?.parameters?.style).toBe(0);
    expect(body.request?.parameters?.video_fps).toBe(15);
    expect(body.request?.parameters?.animate_emotion).toBe(false);
    expect(body.request?.parameters?.min_len).toBe(540);
    expect(body.request?.parameters?.use_SR).toBe(true);
  });

  test("wait mode continues through SUSPENDED and reads output_video_url", async () => {
    let pollCount = 0;
    const mp4Bytes = Buffer.from("style-mp4");
    const { origin } = await startServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "POST") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: { task_id: "task-style-1", task_status: "PENDING" },
            request_id: "req-style-1",
          }),
        );
        return;
      }
      if (url.pathname === "/api/v1/tasks/task-style-1") {
        pollCount += 1;
        if (pollCount < 2) {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              output: { task_id: "task-style-1", task_status: "SUSPENDED" },
              request_id: "req-style-1",
            }),
          );
          return;
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: {
              task_id: "task-style-1",
              task_status: "SUCCEEDED",
              output_video_url: `${origin}/styled.mp4`,
            },
            usage: { SR: 720 },
            request_id: "req-style-1",
          }),
        );
        return;
      }
      if (url.pathname === "/styled.mp4") {
        response.writeHead(200, { "content-type": "video/mp4" });
        response.end(mp4Bytes);
        return;
      }
      response.writeHead(404);
      response.end();
    });

    const outDir = makeE2eOutputDir("video-style-wait");
    tempDirs.push(outDir);
    const dest = join(outDir, "styled.mp4");

    const { stdout, stderr, exitCode } = await runCommandInProcess(VIDEO_STYLE_ROUTES, [
      "video",
      "style",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--video",
      "https://example.com/clip.mp4",
      "--style",
      "0",
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
    const body = parseStdoutJson<{
      task_id?: string;
      video_url?: string;
      output_video_url?: string;
      saved?: string;
      usage?: { SR?: number };
    }>(stdout);
    expect(body.task_id).toBe("task-style-1");
    expect(body.video_url).toMatch(/styled\.mp4$/);
    expect(body.output_video_url).toMatch(/styled\.mp4$/);
    expect(body.usage?.SR).toBe(720);
    expect(readFileSync(dest).equals(mp4Bytes)).toBe(true);
  });

  test("task-get and download see output_video_url", async () => {
    const mp4Bytes = Buffer.from("download-style");
    const { origin } = await startServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/api/v1/tasks/task-style-dl") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: {
              task_id: "task-style-dl",
              task_status: "SUCCEEDED",
              output_video_url: `${origin}/styled.mp4`,
            },
            request_id: "req-dl",
          }),
        );
        return;
      }
      if (url.pathname === "/styled.mp4") {
        response.writeHead(200, { "content-type": "video/mp4" });
        response.end(mp4Bytes);
        return;
      }
      response.writeHead(404);
      response.end();
    });

    const getResult = await runCommandInProcess(VIDEO_STYLE_ROUTES, [
      "video",
      "task",
      "get",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--task-id",
      "task-style-dl",
      "--output",
      "json",
    ]);
    expect(getResult.exitCode, getResult.stderr).toBe(0);
    const getBody = parseStdoutJson<{ output_video_url?: string; task_status?: string }>(
      getResult.stdout,
    );
    expect(getBody.task_status).toBe("SUCCEEDED");
    expect(getBody.output_video_url).toMatch(/styled\.mp4$/);

    const outDir = makeE2eOutputDir("video-style-download");
    tempDirs.push(outDir);
    const dest = join(outDir, "from-task.mp4");
    const dl = await runCommandInProcess(VIDEO_STYLE_ROUTES, [
      "video",
      "download",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--task-id",
      "task-style-dl",
      "--out",
      dest,
      "--output",
      "json",
    ]);
    expect(dl.exitCode, dl.stderr).toBe(0);
    expect(readFileSync(dest).equals(mp4Bytes)).toBe(true);
  });
});

const styleLiveUrl = process.env.BAILIAN_E2E_VIDEO_STYLE_URL?.trim();

describe.skipIf(!isBailianE2EVideoEnabled() || !isDashScopeE2EReady() || !styleLiveUrl)(
  "e2e: video style（DashScope live）",
  () => {
    test("video-style-transform live", async () => {
      const outDir = makeE2eOutputDir("video-style-live");
      const { stdout, stderr, exitCode } = await runCommandE2e(VIDEO_STYLE_ROUTES, [
        "video",
        "style",
        "--video",
        styleLiveUrl!,
        "--style",
        "0",
        "--download",
        join(outDir, "style-live.mp4"),
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const body = parseStdoutJson<{ video_url?: string; output_video_url?: string }>(stdout);
      expect(
        body.output_video_url?.startsWith("https://") || body.video_url?.startsWith("https://"),
      ).toBe(true);
    }, 3_600_000);
  },
);
