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
import { VIDEO_RETOUCH_ROUTES } from "./topic-routes.ts";

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
): Promise<{ origin: string; requests: Array<{ method?: string; path: string; body: string }> }> {
  const requests: Array<{ method?: string; path: string; body: string }> = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      requests.push({ method: request.method, path: url.pathname, body });
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

describe("e2e: video retouch", () => {
  test("help distinguishes VACE from happyhorse edit", async () => {
    const { stderr, exitCode } = await runCommandHelp(VIDEO_RETOUCH_ROUTES, [
      "video",
      "retouch",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/VACE|万相/);
    expect(stderr).toMatch(/wanx2\.1-vace-plus/);
    expect(stderr).toMatch(/--function/);
    expect(stderr).not.toMatch(/--model/);
    expect(stderr).not.toMatch(/--concurrent/);
  });

  test("video_repainting requires control-condition and video", async () => {
    const missingControl = await runCommandInProcess(VIDEO_RETOUCH_ROUTES, [
      "video",
      "retouch",
      "--prompt",
      "clay",
      "--video",
      "https://example.com/in.mp4",
    ]);
    expect(missingControl.exitCode).toBe(2);
    expect(missingControl.stderr).toMatch(/control-condition/i);

    const missingVideo = await runCommandInProcess(VIDEO_RETOUCH_ROUTES, [
      "video",
      "retouch",
      "--prompt",
      "clay",
      "--control-condition",
      "depth",
    ]);
    expect(missingVideo.exitCode).toBe(2);
    expect(missingVideo.stderr).toMatch(/--video/i);
  });

  test("video_edit requires exactly one mask", async () => {
    const none = await runCommandInProcess(VIDEO_RETOUCH_ROUTES, [
      "video",
      "retouch",
      "--prompt",
      "edit",
      "--function",
      "video_edit",
      "--video",
      "https://example.com/in.mp4",
    ]);
    expect(none.exitCode).toBe(2);
    expect(none.stderr).toMatch(/mask/i);

    const both = await runCommandInProcess(VIDEO_RETOUCH_ROUTES, [
      "video",
      "retouch",
      "--prompt",
      "edit",
      "--function",
      "video_edit",
      "--video",
      "https://example.com/in.mp4",
      "--mask-image",
      "https://example.com/mask.png",
      "--mask-video",
      "https://example.com/mask.mp4",
    ]);
    expect(both.exitCode).toBe(2);
    expect(both.stderr).toMatch(/mask/i);
  });

  test("video_extension requires >=1 media source", async () => {
    const { stderr, exitCode } = await runCommandInProcess(VIDEO_RETOUCH_ROUTES, [
      "video",
      "retouch",
      "--prompt",
      "extend",
      "--function",
      "video_extension",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/first-frame|video_extension|至少/i);
  });

  test("rejects flags not applicable to mode", async () => {
    const { stderr, exitCode } = await runCommandInProcess(VIDEO_RETOUCH_ROUTES, [
      "video",
      "retouch",
      "--prompt",
      "clay",
      "--video",
      "https://example.com/in.mp4",
      "--control-condition",
      "depth",
      "--mask-image",
      "https://example.com/mask.png",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/not applicable|不适用于|--mask-image/i);
  });

  test("image_reference dry-run and role count", async () => {
    const badRoles = await runCommandInProcess(VIDEO_RETOUCH_ROUTES, [
      "video",
      "retouch",
      "--prompt",
      "refs",
      "--function",
      "image_reference",
      "--ref-image",
      "https://example.com/a.png",
      "--ref-image",
      "https://example.com/b.png",
      "--ref-role",
      "obj",
    ]);
    expect(badRoles.exitCode).toBe(2);
    expect(badRoles.stderr).toMatch(/ref-role|ref-image/i);

    const { stdout, stderr, exitCode } = await runCommandInProcess(VIDEO_RETOUCH_ROUTES, [
      "video",
      "retouch",
      "--prompt",
      "refs",
      "--function",
      "image_reference",
      "--ref-image",
      "https://example.com/a.png",
      "--ref-image",
      "https://example.com/b.png",
      "--ref-role",
      "obj",
      "--ref-role",
      "bg",
      "--size",
      "1280*720",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      request?: {
        model?: string;
        input?: { function?: string; video_url?: string; ref_images_url?: string[] };
        parameters?: { obj_or_bg?: string[]; size?: string };
      };
    }>(stdout);
    expect(body.request?.model).toBe("wanx2.1-vace-plus");
    expect(body.request?.input?.function).toBe("image_reference");
    expect(body.request?.input?.video_url).toBeUndefined();
    expect(body.request?.input?.ref_images_url).toEqual([
      "https://example.com/a.png",
      "https://example.com/b.png",
    ]);
    expect(body.request?.parameters?.obj_or_bg).toEqual(["obj", "bg"]);
    expect(body.request?.parameters?.size).toBe("1280*720");
  });

  test("repainting dry-run keeps strength=0 and omits unset params", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(VIDEO_RETOUCH_ROUTES, [
      "video",
      "retouch",
      "--prompt",
      "clay",
      "--video",
      "https://example.com/in.mp4",
      "--control-condition",
      "depth",
      "--strength",
      "0",
      "--prompt-extend",
      "false",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      endpoint?: string;
      request?: {
        input?: { function?: string; prompt?: string; video_url?: string };
        parameters?: {
          control_condition?: string;
          strength?: number;
          prompt_extend?: boolean;
          watermark?: boolean;
        };
      };
    }>(stdout);
    expect(body.endpoint).toMatch(/video-generation\/video-synthesis$/);
    expect(body.request?.input?.function).toBe("video_repainting");
    expect(body.request?.parameters?.control_condition).toBe("depth");
    expect(body.request?.parameters?.strength).toBe(0);
    expect(body.request?.parameters?.prompt_extend).toBe(false);
    expect(body.request?.parameters?.watermark).toBeUndefined();
  });

  test("wait mode downloads video_url for repainting", async () => {
    let pollCount = 0;
    const mp4Bytes = Buffer.from("vace-mp4");
    const { origin, requests } = await startServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "POST") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: { task_id: "task-vace-1", task_status: "PENDING" },
            request_id: "req-vace-1",
          }),
        );
        return;
      }
      if (url.pathname === "/api/v1/tasks/task-vace-1") {
        pollCount += 1;
        if (pollCount < 2) {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              output: { task_id: "task-vace-1", task_status: "RUNNING" },
              request_id: "req-vace-1",
            }),
          );
          return;
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: {
              task_id: "task-vace-1",
              task_status: "SUCCEEDED",
              video_url: `${origin}/vace.mp4`,
              orig_prompt: "clay",
              actual_prompt: "clay style",
            },
            request_id: "req-vace-1",
          }),
        );
        return;
      }
      if (url.pathname === "/vace.mp4") {
        response.writeHead(200, { "content-type": "video/mp4" });
        response.end(mp4Bytes);
        return;
      }
      response.writeHead(404);
      response.end();
    });

    const outDir = makeE2eOutputDir("video-retouch-wait");
    tempDirs.push(outDir);
    const dest = join(outDir, "vace.mp4");

    const { stdout, stderr, exitCode } = await runCommandInProcess(VIDEO_RETOUCH_ROUTES, [
      "video",
      "retouch",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--prompt",
      "clay",
      "--video",
      "https://example.com/in.mp4",
      "--control-condition",
      "depth",
      "--strength",
      "0.8",
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
    const post = requests.find((entry) => entry.method === "POST");
    expect(post?.path).toBe("/api/v1/services/aigc/video-generation/video-synthesis");
    const posted = JSON.parse(post!.body) as {
      input?: { function?: string };
      parameters?: { control_condition?: string; strength?: number };
    };
    expect(posted.input?.function).toBe("video_repainting");
    expect(posted.parameters?.control_condition).toBe("depth");
    expect(posted.parameters?.strength).toBe(0.8);

    const body = parseStdoutJson<{ task_id?: string; video_url?: string; saved?: string }>(stdout);
    expect(body.task_id).toBe("task-vace-1");
    expect(body.saved).toBe(dest);
    expect(readFileSync(dest).equals(mp4Bytes)).toBe(true);
  });
});

const vaceLiveVideo = process.env.BAILIAN_E2E_VACE_VIDEO_URL?.trim();

describe.skipIf(!isBailianE2EVideoEnabled() || !isDashScopeE2EReady() || !vaceLiveVideo)(
  "e2e: video retouch（DashScope live）",
  () => {
    test("VACE live video_repainting only (other functions unverified)", async () => {
      const outDir = makeE2eOutputDir("video-retouch-live");
      const { stdout, stderr, exitCode } = await runCommandE2e(VIDEO_RETOUCH_ROUTES, [
        "video",
        "retouch",
        "--prompt",
        "Convert the scene to claymation style",
        "--function",
        "video_repainting",
        "--video",
        vaceLiveVideo!,
        "--control-condition",
        "depth",
        "--strength",
        "0.8",
        "--download",
        join(outDir, "vace-live.mp4"),
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const body = parseStdoutJson<{ video_url?: string }>(stdout);
      expect(body.video_url?.startsWith("https://")).toBe(true);
    }, 3_600_000);
  },
);
