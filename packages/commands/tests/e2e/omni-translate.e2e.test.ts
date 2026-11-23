import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import {
  cliTimeoutPrefix,
  isBailianE2EMediaEnabled,
  isDashScopeE2EReady,
  makeE2eOutputDir,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
  runCommandInProcess,
} from "./helpers.ts";
import { OMNI_TRANSLATE_ROUTES } from "./topic-routes.ts";

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
  requests: Array<{ method?: string; path: string; body: string }>;
}> {
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

describe("e2e: omni translate routing / validation", () => {
  test("omni help keeps chat usage and lists translate subcommand", async () => {
    const { stderr, exitCode } = await runCommandHelp(OMNI_TRANSLATE_ROUTES, ["omni", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--message/);
    expect(stderr).toMatch(/Subcommands:|子命令：/);
    expect(stderr).toMatch(/omni translate/);
    expect(stderr).toMatch(/Qwen-MT-Uni|文件|translate/i);
  });

  test("omni translate help is bilingual", async () => {
    const { stderr, exitCode } = await runCommandHelp(OMNI_TRANSLATE_ROUTES, [
      "omni",
      "translate",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--file/);
    expect(stderr).toMatch(/--target-lang/);
    expect(stderr).toMatch(/Document, image or audio|文档、图片或音频/);
    expect(stderr).toMatch(/qwen-mt-uni|async/i);
  });

  test("old omni dry-run still works", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(OMNI_TRANSLATE_ROUTES, [
      "omni",
      "--message",
      "请介绍你自己。",
      "--text-only",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{ request?: { model?: string; messages?: unknown } }>(stdout);
    expect(body.request?.model).toBeTruthy();
    expect(body.request?.messages).toBeTruthy();
  });

  test("missing file/target and rejected formats → 2", async () => {
    const missingFile = await runCommandInProcess(OMNI_TRANSLATE_ROUTES, [
      "omni",
      "translate",
      "--target-lang",
      "en",
      "--quiet",
    ]);
    expect(missingFile.exitCode).toBe(2);

    const missingTarget = await runCommandInProcess(OMNI_TRANSLATE_ROUTES, [
      "omni",
      "translate",
      "--file",
      "https://example.com/a.pdf",
      "--quiet",
    ]);
    expect(missingTarget.exitCode).toBe(2);

    const video = await runCommandInProcess(OMNI_TRANSLATE_ROUTES, [
      "omni",
      "translate",
      "--file",
      "https://example.com/a.mp4",
      "--target-lang",
      "en",
      "--dry-run",
      "--quiet",
    ]);
    expect(video.exitCode).toBe(2);
    expect(video.stderr).toMatch(/mp4|video|视频/i);

    const legacyDoc = await runCommandInProcess(OMNI_TRANSLATE_ROUTES, [
      "omni",
      "translate",
      "--file",
      "https://example.com/a.doc",
      "--target-lang",
      "en",
      "--dry-run",
      "--quiet",
    ]);
    expect(legacyDoc.exitCode).toBe(2);
  });

  test("dry-run uses fileUrl and omits source_lang when unset", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(OMNI_TRANSLATE_ROUTES, [
      "omni",
      "translate",
      "--file",
      "https://example.com/brochure.pdf",
      "--target-lang",
      "en",
      "--format-hint",
      "pdf",
      "--domain-hint",
      "legal",
      "--term",
      "应用程序接口=API",
      "--sensitive",
      "全场9折",
      "--image-segment",
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
        input?: {
          fileUrl?: string;
          target_lang?: string;
          source_lang?: string;
          ext?: {
            format_hint?: string;
            domainHint?: string;
            glossary?: Array<{ src: string; tgt: string }>;
            sensitives?: string[];
            config?: { imageSegment?: boolean };
          };
        };
      };
    }>(stdout);
    expect(body.endpoint).toMatch(/^https?:\/\//);
    expect(body.endpoint).toMatch(/\/api\/v1\/services\/aigc\/multimodal-generation\/generation$/);
    expect(body.request?.model).toBe("qwen-mt-uni");
    expect(body.request?.input?.fileUrl).toBe("https://example.com/brochure.pdf");
    expect(body.request?.input?.target_lang).toBe("en");
    expect(body.request?.input?.source_lang).toBeUndefined();
    expect(body.request?.input?.ext?.format_hint).toBe("pdf");
    expect(body.request?.input?.ext?.domainHint).toBe("legal");
    expect(body.request?.input?.ext?.glossary).toEqual([{ src: "应用程序接口", tgt: "API" }]);
    expect(body.request?.input?.ext?.sensitives).toEqual(["全场9折"]);
    expect(body.request?.input?.ext?.config?.imageSegment).toBe(true);
  });

  test("rejects empty sensitive and invalid term pairs", async () => {
    const emptySensitive = await runCommandInProcess(OMNI_TRANSLATE_ROUTES, [
      "omni",
      "translate",
      "--file",
      "https://example.com/brochure.pdf",
      "--target-lang",
      "en",
      "--sensitive",
      "",
      "--quiet",
    ]);
    expect(emptySensitive.exitCode).toBe(2);
    expect(emptySensitive.stderr).toMatch(/sensitive|空/i);

    const badTerm = await runCommandInProcess(OMNI_TRANSLATE_ROUTES, [
      "omni",
      "translate",
      "--file",
      "https://example.com/brochure.pdf",
      "--target-lang",
      "en",
      "--term",
      "=only-target",
      "--dry-run",
      "--quiet",
    ]);
    expect(badTerm.exitCode).toBe(2);
    expect(badTerm.stderr).toMatch(/--term|source=target/i);
  });

  test("dry-run allows empty glossary target", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(OMNI_TRANSLATE_ROUTES, [
      "omni",
      "translate",
      "--file",
      "https://example.com/brochure.pdf",
      "--target-lang",
      "en",
      "--term",
      "Brand=",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      request?: { input?: { ext?: { glossary?: Array<{ src: string; tgt: string }> } } };
    }>(stdout);
    expect(body.request?.input?.ext?.glossary).toEqual([{ src: "Brand", tgt: "" }]);
  });

  test("local dry-run marks pending upload", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bl-omni-mt-"));
    tempDirs.push(tempDir);
    const pdfPath = join(tempDir, "brochure.pdf");
    writeFileSync(pdfPath, "%PDF-1.4");

    const { stdout, stderr, exitCode } = await runCommandInProcess(OMNI_TRANSLATE_ROUTES, [
      "omni",
      "translate",
      "--file",
      pdfPath,
      "--target-lang",
      "en",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{ request?: { input?: { fileUrl?: string } } }>(stdout);
    expect(body.request?.input?.fileUrl).toMatch(/pending-upload/);
  });
});

describe("e2e: omni translate loopback", () => {
  test("async returns task id with zero GET", async () => {
    const { origin, requests } = await startServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          output: { task_id: "task-omni-1", task_status: "PENDING" },
          request_id: "req-omni-1",
        }),
      );
    });

    const { stdout, stderr, exitCode } = await runCommandInProcess(OMNI_TRANSLATE_ROUTES, [
      "omni",
      "translate",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--file",
      "https://example.com/a.pdf",
      "--target-lang",
      "en",
      "--async",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{ task_id?: string }>(stdout);
    expect(body.task_id).toBe("task-omni-1");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.path).toBe("/api/v1/services/aigc/multimodal-generation/generation");
  });

  test("SUCCEEDED with Success=false fails with original Message", async () => {
    const { origin } = await startServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "POST") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: { task_id: "task-biz-fail", task_status: "PENDING" },
            request_id: "req-biz",
          }),
        );
        return;
      }
      if (url.pathname === "/api/v1/tasks/task-biz-fail") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: {
              task_id: "task-biz-fail",
              task_status: "SUCCEEDED",
              Success: false,
              Code: 500,
              Message: "biz translation failed",
              RequestId: "biz-req",
            },
            request_id: "req-biz",
          }),
        );
        return;
      }
      response.writeHead(404);
      response.end();
    });

    const { stderr, exitCode } = await runCommandInProcess(OMNI_TRANSLATE_ROUTES, [
      "omni",
      "translate",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--file",
      "https://example.com/a.pdf",
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
    expect(stderr).toMatch(/biz translation failed/);
  });

  test("SUCCEEDED without Success fails without waiting for timeout", async () => {
    let getCount = 0;
    const { origin } = await startServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "POST") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: { task_id: "task-no-success", task_status: "PENDING" },
            request_id: "req-no-success",
          }),
        );
        return;
      }
      if (url.pathname === "/api/v1/tasks/task-no-success") {
        getCount += 1;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: {
              task_id: "task-no-success",
              task_status: "SUCCEEDED",
              Message: "missing Success field",
              RequestId: "biz-no-success",
            },
            request_id: "req-no-success",
          }),
        );
        return;
      }
      response.writeHead(404);
      response.end();
    });

    const { stderr, exitCode } = await runCommandInProcess(OMNI_TRANSLATE_ROUTES, [
      "omni",
      "translate",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--file",
      "https://example.com/a.pdf",
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
    expect(stderr).toMatch(/missing Success field|Translation business call failed/i);
    expect(getCount).toBe(1);
  });

  test("CANCELED fails without waiting for timeout", async () => {
    let getCount = 0;
    const { origin } = await startServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "POST") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: { task_id: "task-canceled", task_status: "PENDING" },
            request_id: "req-canceled",
          }),
        );
        return;
      }
      if (url.pathname === "/api/v1/tasks/task-canceled") {
        getCount += 1;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: {
              task_id: "task-canceled",
              task_status: "CANCELED",
            },
            request_id: "req-canceled",
          }),
        );
        return;
      }
      response.writeHead(404);
      response.end();
    });

    const { stderr, exitCode } = await runCommandInProcess(OMNI_TRANSLATE_ROUTES, [
      "omni",
      "translate",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--file",
      "https://example.com/a.pdf",
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
    expect(stderr).toMatch(/CANCELED/);
    expect(getCount).toBe(1);
  });

  test("download HTTP 503 after SUCCEEDED still includes task_id", async () => {
    const { origin } = await startServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "POST") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: { task_id: "task-dl-fail-omni", task_status: "PENDING" },
            request_id: "req-dl-fail-omni",
          }),
        );
        return;
      }
      if (url.pathname === "/api/v1/tasks/task-dl-fail-omni") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: {
              task_id: "task-dl-fail-omni",
              task_status: "SUCCEEDED",
              Success: true,
              Code: 200,
              Message: "Success",
              RequestId: "biz-dl-fail",
              Data: {
                FileType: "document",
                TranslatedFileUrl: `${origin}/out.pdf`,
              },
            },
            request_id: "req-dl-fail-omni",
          }),
        );
        return;
      }
      if (url.pathname === "/out.pdf") {
        response.writeHead(503, { "content-type": "text/plain" });
        response.end("unavailable");
        return;
      }
      response.writeHead(404);
      response.end();
    });

    const outDir = makeE2eOutputDir("omni-translate-dl-fail");
    tempDirs.push(outDir);

    const { stderr, exitCode } = await runCommandInProcess(OMNI_TRANSLATE_ROUTES, [
      "omni",
      "translate",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--file",
      "https://example.com/a.pdf",
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
    expect(stderr).toMatch(/task-dl-fail-omni/);
    expect(stderr).toMatch(/already succeeded|已成功/);
  });

  test("timeout includes submitted task_id", async () => {
    const { origin } = await startServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "POST") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: { task_id: "task-timeout-1", task_status: "PENDING" },
            request_id: "req-timeout",
          }),
        );
        return;
      }
      if (url.pathname === "/api/v1/tasks/task-timeout-1") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: { task_id: "task-timeout-1", task_status: "RUNNING" },
            request_id: "req-timeout",
          }),
        );
        return;
      }
      response.writeHead(404);
      response.end();
    });

    const { stderr, exitCode } = await runCommandInProcess(OMNI_TRANSLATE_ROUTES, [
      "omni",
      "translate",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--file",
      "https://example.com/a.pdf",
      "--target-lang",
      "en",
      "--poll-interval",
      "0.05",
      "--timeout",
      "0.2",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(5);
    expect(stderr).toMatch(/task-timeout-1/);
    expect(stderr).toMatch(/timed out|超时/i);
  });

  test("hung task GET timeout still includes submitted task_id", async () => {
    const { origin } = await startServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "POST") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            output: { task_id: "task-hang-1", task_status: "PENDING" },
            request_id: "req-hang",
          }),
        );
        return;
      }
      if (url.pathname === "/api/v1/tasks/task-hang-1") {
        // Never end the response — per-request abort must still surface task_id.
        return;
      }
      response.writeHead(404);
      response.end();
    });

    const { stderr, exitCode } = await runCommandInProcess(OMNI_TRANSLATE_ROUTES, [
      "omni",
      "translate",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--file",
      "https://example.com/a.pdf",
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
    expect(stderr).toMatch(/task-hang-1/);
    expect(stderr).toMatch(/timed out|超时/i);
  });

  test.each([
    {
      name: "pdf",
      inputUrl: "https://example.com/a.pdf",
      outPath: "/out.pdf",
      contentType: "application/pdf",
      fileBytes: Buffer.from("%PDF-1.7-translated"),
      savedSuffix: /\.pdf$/,
    },
    {
      name: "xlsx",
      inputUrl: "https://example.com/sheet.xlsx",
      outPath: "/out.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileBytes: Buffer.from("PK\x03\x04-xlsx-translated"),
      savedSuffix: /\.xlsx$/,
    },
  ] as const)(
    "Success=true keeps input suffix when FileType=document ($name)",
    async ({ inputUrl, outPath, contentType, fileBytes, savedSuffix }) => {
      const { origin } = await startServer((request, response) => {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        if (request.method === "POST") {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              output: { task_id: "task-ok", task_status: "PENDING" },
              request_id: "req-ok",
            }),
          );
          return;
        }
        if (url.pathname === "/api/v1/tasks/task-ok") {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              output: {
                task_id: "task-ok",
                task_status: "SUCCEEDED",
                Success: true,
                Code: 200,
                Message: "Success",
                RequestId: "biz-ok",
                Data: {
                  // Official modality bucket — must not force .docx over input suffix
                  FileType: "document",
                  TranslatedFileUrl: `${origin}${outPath}`,
                },
              },
              request_id: "req-ok",
            }),
          );
          return;
        }
        if (url.pathname === outPath) {
          response.writeHead(200, { "content-type": contentType });
          response.end(fileBytes);
          return;
        }
        response.writeHead(404);
        response.end();
      });

      const outDir = makeE2eOutputDir("omni-translate-wait");
      tempDirs.push(outDir);

      const { stdout, stderr, exitCode } = await runCommandInProcess(OMNI_TRANSLATE_ROUTES, [
        "omni",
        "translate",
        "--base-url",
        origin,
        "--api-key",
        "sk-test",
        "--file",
        inputUrl,
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
        translated_file_url?: string;
        saved?: string;
        output?: { Success?: boolean; Data?: { FileType?: string } };
      }>(stdout);
      expect(body.task_id).toBe("task-ok");
      expect(body.output?.Success).toBe(true);
      expect(body.output?.Data?.FileType).toBe("document");
      expect(body.saved).toMatch(savedSuffix);
      expect(readFileSync(body.saved!).equals(fileBytes)).toBe(true);
    },
  );

  test("task get projects Success/Data fields", async () => {
    const { origin } = await startServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          output: {
            task_id: "task-get-omni",
            task_status: "SUCCEEDED",
            Success: true,
            Code: 200,
            Message: "Success",
            RequestId: "biz-get",
            Data: { FileType: "image", TranslatedFileUrl: "https://example.com/t.jpg" },
            video_url: "https://example.com/v.mp4",
          },
          request_id: "req-get",
        }),
      );
    });

    const { stdout, stderr, exitCode } = await runCommandInProcess(OMNI_TRANSLATE_ROUTES, [
      "video",
      "task",
      "get",
      "--base-url",
      origin,
      "--api-key",
      "sk-test",
      "--task-id",
      "task-get-omni",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      Success?: boolean;
      Data?: { FileType?: string };
      video_url?: string;
    }>(stdout);
    expect(body.Success).toBe(true);
    expect(body.Data?.FileType).toBe("image");
    expect(body.video_url).toBe("https://example.com/v.mp4");
  });
});

/** Minimal one-page PDF with a Helvetica text line (ASCII only). */
function writeMinimalPdf(filePath: string, line: string): void {
  const escaped = line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const stream = `BT /F1 24 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n",
    `4 0 obj<< /Length ${Buffer.byteLength(stream, "utf8")} >>stream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += object;
  }
  const xrefStart = Buffer.byteLength(body, "utf8");
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += xref;
  body += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  writeFileSync(filePath, body);
}

describe.skipIf(!isBailianE2EMediaEnabled() || !isDashScopeE2EReady())(
  "e2e: omni translate live",
  () => {
    test("translates a public image file URL", async () => {
      const outDir = makeE2eOutputDir("omni-translate-live");
      tempDirs.push(outDir);
      const { stdout, stderr, exitCode } = await runCommandE2e(OMNI_TRANSLATE_ROUTES, [
        "omni",
        "translate",
        "--file",
        "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250916/ordhsk/1.webp",
        "--target-lang",
        "en",
        "--format-hint",
        "image",
        "--out-dir",
        outDir,
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const body = parseStdoutJson<{ translated_file_url?: string; saved?: string }>(stdout);
      expect(body.translated_file_url).toBeTruthy();
      expect(body.saved && readFileSync(body.saved).length).toBeGreaterThan(0);
    }, 300_000);

    test("uploads a local PDF, translates, and downloads the result", async () => {
      const outDir = makeE2eOutputDir("omni-translate-live-pdf");
      tempDirs.push(outDir);
      const pdfPath = join(outDir, "brochure.pdf");
      writeMinimalPdf(pdfPath, "Welcome to Bailian Model Studio.");

      const { stdout, stderr, exitCode } = await runCommandE2e(OMNI_TRANSLATE_ROUTES, [
        "omni",
        "translate",
        // Real document translation polls an async task; the CLI default --timeout 300
        // would abort long before this case's 600s budget. Follow the video-live convention.
        ...cliTimeoutPrefix(),
        "--file",
        pdfPath,
        "--source-lang",
        "en",
        "--target-lang",
        "zh",
        "--format-hint",
        "pdf",
        "--out-dir",
        outDir,
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const body = parseStdoutJson<{
        task_id?: string;
        translated_file_url?: string;
        saved?: string;
      }>(stdout);
      expect(body.task_id).toMatch(/\S+/);
      expect(body.translated_file_url).toMatch(/^https?:\/\//i);
      expect(body.saved).toMatch(/\.pdf$/i);
      expect(body.saved && readFileSync(body.saved).byteLength).toBeGreaterThan(64);
      expect(body.saved && readFileSync(body.saved).subarray(0, 5).toString("ascii")).toBe("%PDF-");
    }, 600_000);
  },
);
