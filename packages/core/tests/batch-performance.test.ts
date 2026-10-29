import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { createServer } from "node:http";
import { Client, uploadDataset } from "../src/index.ts";
import { readBatchBlob, validateBatch, writeBatchFile } from "../src/batch/index.ts";

// 手动性能验收，不加入普通 CI 的资源负担；只用本地文件与回环 HTTP，不调用云端。
test.skipIf(process.env.BAILIAN_BATCH_PERF !== "1")(
  "500 MiB 校验上传字节接缝满足 120 秒与 2.5 GiB RSS 门槛",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "batch-perf-"));
    const file = join(directory, "500mib.jsonl");
    let receivedBytes = 0;
    const server = createServer(async (incoming, response) => {
      for await (const chunk of incoming) receivedBytes += chunk.byteLength;
      response.setHeader("content-type", "application/json");
      response.end('{"id":"file-perf"}');
    });
    try {
      async function* generated() {
        for (let position = 0; position < 1000; position++) {
          const record = {
            custom_id: `request-${String(position).padStart(4, "0")}`,
            method: "POST",
            url: "/v1/chat/completions",
            body: { model: "qwen-plus", messages: [{ role: "user", content: "" }] },
          };
          const overhead = Buffer.byteLength(JSON.stringify(record) + "\n");
          record.body.messages[0].content = "a".repeat(512 * 1024 - overhead);
          yield JSON.stringify(record) + "\n";
        }
      }
      await writeBatchFile(file, generated());
      const started = performance.now();
      const blob = await readBatchBlob(file);
      const report = await validateBatch(blob);
      const elapsedSeconds = (performance.now() - started) / 1000;
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Local server required");
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const client = new Client({
        identity: {
          binName: "perf-cli",
          version: "0.0.0-test",
          npmPackage: "perf-cli",
          clientName: "perf-client",
        },
        settings: {
          output: "json",
          outputExplicit: true,
          timeout: 60,
          watermark: true,
          verbose: false,
          quiet: true,
          dryRun: false,
          telemetry: false,
        },
        baseUrl,
        apiCred: { token: "offline-test-only", baseUrl, source: "flag" },
      });
      const uploaded = await uploadDataset(client, {
        filePath: file,
        fileBlob: blob,
        purpose: "batch",
      });
      expect(uploaded.file_id).toBe("file-perf");
      expect(receivedBytes).toBeGreaterThan(524_288_000);
      expect(receivedBytes).toBeLessThan(524_289_024);
      const peakRssMiB = process.resourceUsage().maxRSS / 1024;
      console.info(
        JSON.stringify({
          bytes: blob.size,
          records: report.records,
          elapsed_seconds: elapsedSeconds,
          multipart_bytes: receivedBytes,
          peak_rss_mib: peakRssMiB,
        }),
      );
      expect(blob.size).toBe(500 * 1024 * 1024);
      expect(report).toMatchObject({ records: 1000, bytes: 500 * 1024 * 1024 });
      expect(elapsedSeconds).toBeLessThanOrEqual(120);
      expect(peakRssMiB).toBeLessThanOrEqual(2560);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  },
  180_000,
);
