import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

/** First pass: compute the lease checksum without retaining the file in memory. */
export async function computeFileMd5(filePath: string): Promise<string> {
  const digest = createHash("md5");
  const source = createReadStream(filePath);
  try {
    for await (const chunk of source) digest.update(chunk);
    return digest.digest("base64");
  } finally {
    source.destroy();
  }
}

/** Second pass: the signed lease controls headers; no API credentials reach OSS. */
export async function putFileStream(
  filePath: string,
  lease: { url: string; method?: string; headers?: Record<string, string> },
  signal: AbortSignal,
): Promise<Response> {
  signal.throwIfAborted();
  const source = createReadStream(filePath);
  try {
    const request: RequestInit & { duplex: "half" } = {
      method: lease.method ?? "PUT",
      headers: lease.headers,
      body: source as unknown as RequestInit["body"],
      duplex: "half",
      signal,
    };
    return await fetch(lease.url, request);
  } finally {
    source.destroy();
  }
}
