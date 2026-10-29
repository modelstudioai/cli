import { randomUUID } from "node:crypto";
import { dirname, basename, resolve } from "node:path";
import { open, link, rename, unlink, mkdir } from "node:fs/promises";
import { batchIoError } from "./validate.ts";

// 按文件发布，不将多个产物或整个目录伪装成事务。
export async function writeBatchFile(
  path: string,
  chunks: AsyncIterable<string | Uint8Array>,
  force = false,
): Promise<void> {
  const target = resolve(path);
  const temporary = resolve(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  const fileFailure = (error: unknown): never => {
    throw batchIoError(error);
  };
  try {
    await mkdir(dirname(target), { recursive: true }).catch(fileFailure);
    handle = await open(temporary, "wx", 0o600).catch(fileFailure);
    for await (const chunk of chunks) {
      const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      let offset = 0;
      while (offset < bytes.byteLength) {
        const written = await handle
          .write(bytes, offset, bytes.byteLength - offset)
          .catch(fileFailure);
        offset += written.bytesWritten;
      }
    }
    await handle.sync().catch(fileFailure);
    await handle.close().catch(fileFailure);
    handle = undefined;
    if (force) await rename(temporary, target).catch(fileFailure);
    else await link(temporary, target).catch(fileFailure);
  } finally {
    await handle?.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
}
