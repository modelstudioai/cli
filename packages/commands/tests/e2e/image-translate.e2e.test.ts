import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync, rmSync } from "node:fs";
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
import { IMAGE_TRANSLATE_ROUTES } from "./topic-routes.ts";

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

describe("e2e: image translate", () => {
  test("help shows bilingual flags and default model", async () => {
    const { stderr, exitCode } = await runCommandHelp(IMAGE_TRANSLATE_ROUTES, [
      "image",
      "translate",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--image/);
    expect(stderr).toMatch(/--target-lang/);
    expect(stderr).toMatch(/Target language|目标语言/);
    expect(stderr).toMatch(/qwen-mt-image/);
    expect(stderr).toMatch(/--async/);
  });

  test("missing image or target-lang → 2", async () => {
    const missingImage = await runCommandInProcess(IMAGE_TRANSLATE_ROUTES, [
      "image",
      "translate",
      "--target-lang",
      "en",
      "--quiet",
    ]);
    expect(missingImage.exitCode).toBe(2);

    const missingTarget = await runCommandInProcess(IMAGE_TRANSLATE_ROUTES, [
      "image",
      "translate",
      "--image",
      "https://example.com/a.png",
      "--quiet",
    ]);
    expect(missingTarget.exitCode).toBe(2);
  });

  test("rejects auto target, same langs, missing local file", async () => {
    const autoTarget = await runCommandInProcess(IMAGE_TRANSLATE_ROUTES, [
      "image",
      "translate",
      "--image",
      "https://example.com/a.png",
      "--target-lang",
      "auto",
      "--dry-run",
      "--quiet",
    ]);
    expect(autoTarget.exitCode).toBe(2);

    const same = await runCommandInProcess(IMAGE_TRANSLATE_ROUTES, [
      "image",
      "translate",
      "--image",
      "https://example.com/a.png",
      "--source-lang",
      "en",
      "--target-lang",
      "en",
      "--dry-run",
      "--quiet",
    ]);
    expect(same.exitCode).toBe(2);

    const missingLocal = await runCommandInProcess(IMAGE_TRANSLATE_ROUTES, [
      "image",
      "translate",
      "--image",
      "/tmp/bl-image-translate-missing.png",
      "--target-lang",
      "en",
      "--dry-run",
      "--quiet",
    ]);
    expect(missingLocal.exitCode).toBe(2);
    expect(missingLocal.stderr).toMatch(/not found|不存在/i);
  });

  test("dry-run builds async image2image body with defaults", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(IMAGE_TRANSLATE_ROUTES, [
      "image",
      "translate",
      "--image",
      "https://example.com/poster.png",
      "--target-lang",
      "en",
      "--term",
      "百炼=Bailian",
      "--domain-hint",
      "ecommerce",
      "--image-segment",
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
        input?: {
          image_url?: string;
          source_lang?: string;
          target_lang?: string;
          ext?: {
            domainHint?: string;
            terminologies?: Array<{ src: string; tgt: string }>;
            config?: { imageSegment?: boolean };
          };
        };
      };
    }>(stdout);
    expect(body.endpoint).toMatch(/^https?:\/\//);
    expect(body.endpoint).toMatch(/\/api\/v1\/services\/aigc\/image2image\/image-synthesis$/);
    expect(body.request?.model).toBe("qwen-mt-image");
    expect(body.request?.input?.image_url).toBe("https://example.com/poster.png");
    expect(body.request?.input?.source_lang).toBe("auto");
    expect(body.request?.input?.target_lang).toBe("en");
    expect(body.request?.input?.ext?.domainHint).toBe("ecommerce");
    expect(body.request?.input?.ext?.terminologies).toEqual([{ src: "百炼", tgt: "Bailian" }]);
    expect(body.request?.input?.ext?.config?.imageSegment).toBe(false);
  });

  test("async loopback returns task id with zero GET", async () => {
    const { origin, requests } = await startServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          output: { task_id: "task-image-mt-1", task_status: "PENDING" },
          request_id: "req-1",
        }),
      );
    });

    const { stdout, stderr, exitCode } = await runCommandInProcess(IMAGE_TRANSLATE_ROUTES, [
      "image",
      "translate",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--image",
      "https://example.com/poster.png",
      "--target-lang",
      "en",
      "--async",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{ task_id?: string; request_id?: string }>(stdout);
    expect(body.task_id).toBe("task-image-mt-1");
    expect(body.request_id).toBe("req-1");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.path).toBe("/api/v1/services/aigc/image2image/image-synthesis");
    expect(requests[0]?.headers["x-dashscope-async"]).toBe("enable");
  });

  test("wait mode polls until image_url and downloads jpg", async () => {
    let pollCount = 0;
    const jpgBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const { origin } = await startServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "POST") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: { task_id: "task-image-mt-2", task_status: "PENDING" },
            request_id: "req-2",
          }),
        );
        return;
      }
      if (url.pathname === "/api/v1/tasks/task-image-mt-2") {
        pollCount += 1;
        if (pollCount < 2) {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              output: { task_id: "task-image-mt-2", task_status: "RUNNING" },
              request_id: "req-2",
            }),
          );
          return;
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: {
              task_id: "task-image-mt-2",
              task_status: "SUCCEEDED",
              image_url: `${origin}/translated.jpg`,
              message: "No text detected for translation",
            },
            request_id: "req-2",
          }),
        );
        return;
      }
      if (url.pathname === "/translated.jpg") {
        response.writeHead(200, { "content-type": "image/jpeg" });
        response.end(jpgBytes);
        return;
      }
      response.writeHead(404);
      response.end();
    });

    const outDir = makeE2eOutputDir("image-translate-wait");
    tempDirs.push(outDir);

    const { stdout, stderr, exitCode } = await runCommandInProcess(IMAGE_TRANSLATE_ROUTES, [
      "image",
      "translate",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--image",
      "https://example.com/poster.png",
      "--target-lang",
      "en",
      "--poll-interval",
      "0.05",
      "--timeout",
      "10",
      "--out-dir",
      outDir,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      task_id?: string;
      image_url?: string;
      saved?: string;
      output?: { message?: string };
    }>(stdout);
    expect(body.task_id).toBe("task-image-mt-2");
    expect(body.image_url).toMatch(/translated\.jpg$/);
    expect(body.output?.message).toBe("No text detected for translation");
    expect(body.saved).toBeTruthy();
    expect(readFileSync(body.saved!).equals(jpgBytes)).toBe(true);
  });

  test("download HTTP 503 after SUCCEEDED still includes task_id", async () => {
    const { origin } = await startServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "POST") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: { task_id: "task-dl-fail-img", task_status: "PENDING" },
            request_id: "req-dl-fail-img",
          }),
        );
        return;
      }
      if (url.pathname === "/api/v1/tasks/task-dl-fail-img") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: {
              task_id: "task-dl-fail-img",
              task_status: "SUCCEEDED",
              image_url: `${origin}/translated.jpg`,
            },
            request_id: "req-dl-fail-img",
          }),
        );
        return;
      }
      if (url.pathname === "/translated.jpg") {
        response.writeHead(503, { "content-type": "text/plain" });
        response.end("unavailable");
        return;
      }
      response.writeHead(404);
      response.end();
    });

    const outDir = makeE2eOutputDir("image-translate-dl-fail");
    tempDirs.push(outDir);

    const { stderr, exitCode } = await runCommandInProcess(IMAGE_TRANSLATE_ROUTES, [
      "image",
      "translate",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--image",
      "https://example.com/poster.png",
      "--target-lang",
      "en",
      "--poll-interval",
      "0.05",
      "--timeout",
      "10",
      "--out-dir",
      outDir,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/Download failed: HTTP 503/);
    expect(stderr).toMatch(/task-dl-fail-img/);
    expect(stderr).toMatch(/already succeeded|已成功/);
  });

  test("FAILED preserves server message via load hook", async () => {
    const { origin } = await startServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "POST") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: { task_id: "task-fail", task_status: "PENDING" },
            request_id: "req-fail",
          }),
        );
        return;
      }
      if (url.pathname === "/api/v1/tasks/task-fail") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: {
              task_id: "task-fail",
              task_status: "FAILED",
              code: "InvalidParameter",
              message: "image too large",
            },
            request_id: "req-fail",
          }),
        );
        return;
      }
      response.writeHead(404);
      response.end();
    });

    const { stderr, exitCode } = await runCommandInProcess(IMAGE_TRANSLATE_ROUTES, [
      "image",
      "translate",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--image",
      "https://example.com/poster.png",
      "--target-lang",
      "en",
      "--poll-interval",
      "0.05",
      "--timeout",
      "5",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/image too large/);
    expect(stderr).not.toMatch(/Task failed:/);
  });

  test("hung task GET timeout still includes submitted task_id", async () => {
    const { origin } = await startServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "POST") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: { task_id: "task-hang-img", task_status: "PENDING" },
            request_id: "req-hang-img",
          }),
        );
        return;
      }
      if (url.pathname === "/api/v1/tasks/task-hang-img") {
        return;
      }
      response.writeHead(404);
      response.end();
    });

    const { stderr, exitCode } = await runCommandInProcess(IMAGE_TRANSLATE_ROUTES, [
      "image",
      "translate",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--image",
      "https://example.com/poster.png",
      "--target-lang",
      "en",
      "--poll-interval",
      "0.05",
      "--timeout",
      "0.3",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(5);
    expect(stderr).toMatch(/task-hang-img/);
    expect(stderr).toMatch(/timed out|超时/i);
  });

  test("CANCELED and UNKNOWN fail without waiting for timeout", async () => {
    for (const status of ["CANCELED", "UNKNOWN"] as const) {
      let getCount = 0;
      const taskId = `task-${status.toLowerCase()}`;
      const { origin } = await startServer((request, response) => {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        if (request.method === "POST") {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              output: { task_id: taskId, task_status: "PENDING" },
              request_id: `req-${status.toLowerCase()}`,
            }),
          );
          return;
        }
        if (url.pathname === `/api/v1/tasks/${taskId}`) {
          getCount += 1;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              output: {
                task_id: taskId,
                task_status: status,
              },
              request_id: `req-${status.toLowerCase()}`,
            }),
          );
          return;
        }
        response.writeHead(404);
        response.end();
      });

      const { stderr, exitCode } = await runCommandInProcess(IMAGE_TRANSLATE_ROUTES, [
        "image",
        "translate",
        "--base-url",
        origin,
        "--api-key",
        "sk-test",
        "--image",
        "https://example.com/poster.png",
        "--target-lang",
        "en",
        "--poll-interval",
        "0.05",
        "--timeout",
        "5",
        "--output",
        "json",
      ]);
      expect(exitCode, status).toBe(1);
      expect(stderr, status).toMatch(new RegExp(status));
      expect(getCount, status).toBe(1);
    }
  });

  test("task get projects image_url", async () => {
    const { origin } = await startServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          output: {
            task_id: "task-get-img",
            task_status: "SUCCEEDED",
            image_url: "https://example.com/out.jpg",
            video_url: "https://example.com/out.mp4",
          },
          request_id: "req-get",
        }),
      );
    });

    const { stdout, stderr, exitCode } = await runCommandInProcess(IMAGE_TRANSLATE_ROUTES, [
      "video",
      "task",
      "get",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--task-id",
      "task-get-img",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      task_id?: string;
      image_url?: string;
      video_url?: string;
    }>(stdout);
    expect(body.task_id).toBe("task-get-img");
    expect(body.image_url).toBe("https://example.com/out.jpg");
    expect(body.video_url).toBe("https://example.com/out.mp4");
  });
});

describe.skipIf(!isBailianE2EMediaEnabled() || !isDashScopeE2EReady())(
  "e2e: image translate live",
  () => {
    test("translates a public image URL", async () => {
      const outDir = makeE2eOutputDir("image-translate-live");
      tempDirs.push(outDir);
      const { stdout, stderr, exitCode } = await runCommandE2e(IMAGE_TRANSLATE_ROUTES, [
        "image",
        "translate",
        "--image",
        "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250916/ordhsk/1.webp",
        "--source-lang",
        "zh",
        "--target-lang",
        "en",
        "--out-dir",
        outDir,
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const body = parseStdoutJson<{ image_url?: string; saved?: string }>(stdout);
      expect(body.image_url).toBeTruthy();
      expect(body.saved && readFileSync(body.saved).length).toBeGreaterThan(0);
    }, 300_000);
  },
);
