import { brotliCompressSync } from "node:zlib";
import tar from "tar-stream";

/** Build a skill archive the same way as the publisher (tar.pack + brotli) */
export async function buildTarBr(files: Record<string, string>): Promise<Buffer> {
  const pack = tar.pack();
  const chunks: Buffer[] = [];
  pack.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolvePromise, reject) => {
    pack.on("end", resolvePromise);
    pack.on("error", reject);
  });
  for (const [rel, content] of Object.entries(files)) {
    pack.entry({ name: rel }, content);
  }
  pack.finalize();
  await done;
  return brotliCompressSync(Buffer.concat(chunks));
}
