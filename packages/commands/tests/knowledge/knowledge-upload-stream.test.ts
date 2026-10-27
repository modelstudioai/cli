import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { afterEach, expect, test } from "vite-plus/test";
import { computeFileMd5, putFileStream } from "../../src/commands/knowledge/upload-stream.ts";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture(bytes: Buffer): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "rag-upload-stream-"));
  temporaryDirectories.push(directory);
  const filePath = join(directory, "sample.mp4");
  await writeFile(filePath, bytes);
  return filePath;
}

test("streamed MD5 matches known bytes across multiple chunks", async () => {
  const bytes = Buffer.alloc(192 * 1024 + 7, 37);
  const filePath = await fixture(bytes);
  expect(await computeFileMd5(filePath)).toBe(createHash("md5").update(bytes).digest("base64"));
});

test("missing source preserves filesystem errno", async () => {
  await expect(
    computeFileMd5(join(tmpdir(), "rag-missing-source", "absent.mp4")),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

test("PUT transmits exact bytes and lease headers without authorization", async () => {
  const bytes = Buffer.alloc(128 * 1024 + 3, 19);
  const filePath = await fixture(bytes);
  const received: Buffer[] = [];
  let headers: import("node:http").IncomingHttpHeaders = {};
  const server = createServer(async (request, response) => {
    headers = request.headers;
    for await (const chunk of request) received.push(Buffer.from(chunk));
    response.end("accepted");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as import("node:net").AddressInfo;
  try {
    const response = await putFileStream(
      filePath,
      {
        url: `http://127.0.0.1:${address.port}/upload`,
        headers: { "content-length": String(bytes.length), "x-lease": "test" },
      },
      AbortSignal.timeout(5000),
    );
    expect(response.status).toBe(200);
    await response.text();
    expect(Buffer.concat(received)).toEqual(bytes);
    expect(headers["x-lease"]).toBe("test");
    expect(headers.authorization).toBeUndefined();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("already cancelled PUT does not read or submit a file", async () => {
  const filePath = await fixture(Buffer.from("cancelled"));
  const controller = new AbortController();
  controller.abort();
  await expect(
    putFileStream(filePath, { url: "http://127.0.0.1:1/upload" }, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
});
