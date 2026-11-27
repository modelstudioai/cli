import { createWriteStream, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import { fromBufferPromise } from "yauzl";
import { ExitCode } from "../errors/codes.ts";
import { BailianError } from "../errors/base.ts";
import { httpTransport } from "../client/transport.ts";
import { isSafeEntryName } from "./extract.ts";

const compressedLimit = 50 * 1024 * 1024;
const expandedLimit = 100 * 1024 * 1024;

// Node 18 has no native CRC32. Use the standard ZIP polynomial on that runtime.
function updateChecksum(chunk: Buffer, previous: number) {
  if (typeof zlib.crc32 === "function") return zlib.crc32(chunk, previous);
  let checksum = previous ^ 0xffffffff;
  for (const byte of chunk) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit++) checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

/** The signed URL authenticates itself. Never send a gateway credential to object storage. */
export async function downloadSkillZip(fileUrl: string, timeout: number): Promise<Buffer> {
  const url = URL.canParse(fileUrl) ? new URL(fileUrl) : undefined;
  if (url?.protocol !== "https:" || url.username || url.password)
    throw new BailianError("Invalid signed Skill download URL. / Skill 签名下载地址无效。");
  const response = await httpTransport.fetch(url, {
    signal: AbortSignal.timeout(timeout * 1000),
    redirect: "error",
  });
  if (!response.ok || !response.body) {
    const message = await response.text();
    throw new BailianError(message || `HTTP ${response.status}`, ExitCode.GENERAL, undefined, {
      api: { httpStatus: response.status },
    });
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > compressedLimit) {
        await reader.cancel();
        throw new BailianError("Skill ZIP exceeds 50 MiB. / Skill ZIP 超过 50 MiB。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

/** Extract to a fresh staging directory and locate the manifest at the root or inside its wrapper. */
export async function extractSkillZip(bytes: Buffer, directory: string): Promise<string> {
  const archive = await fromBufferPromise(bytes, { strictFileNames: true });
  let expanded = 0;
  try {
    for await (const entry of archive.eachEntry()) {
      let filename = entry.fileName;
      if (
        !(entry.generalPurposeBitFlag & 0x800) &&
        !entry.extraFields.some((field) => field.id === 0x7075) &&
        entry.fileNameRaw.some((byte) => byte >= 128)
      ) {
        // Older publishers used UTF-8 or GBK without setting the UTF-8 ZIP flag.
        try {
          filename = new TextDecoder("utf-8", { fatal: true }).decode(entry.fileNameRaw);
        } catch {
          filename = new TextDecoder("gbk", { fatal: true }).decode(entry.fileNameRaw);
        }
      }
      const name = filename.replace(/\/$/, "");
      const parts = name.split("/");
      const kind = (entry.externalFileAttributes >>> 16) & 0o170000;
      if (
        !isSafeEntryName(name) ||
        parts.some(
          (part) =>
            !part ||
            part === "." ||
            part.includes(":") ||
            /\p{Cc}/u.test(part) ||
            /[. ]$/.test(part) ||
            /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part),
        ) ||
        ![0, 0o100000, 0o040000].includes(kind) ||
        entry.isEncrypted()
      ) {
        throw new BailianError("Unsupported Skill ZIP entry. / Skill ZIP 包含不支持的条目。");
      }
      expanded += entry.uncompressedSize;
      if (expanded > expandedLimit)
        throw new BailianError(
          "Expanded Skill ZIP exceeds 100 MiB. / Skill ZIP 展开后超过 100 MiB。",
        );
      const path = join(directory, ...parts);
      if (filename.endsWith("/")) {
        mkdirSync(path, { recursive: true });
        continue;
      }
      mkdirSync(dirname(path), { recursive: true });
      const executable = (entry.externalFileAttributes >>> 16) & 0o111;
      let checksum = 0;
      await pipeline(
        await archive.openReadStreamPromise(entry),
        new Transform({
          transform(chunk: Buffer, _encoding, done) {
            checksum = updateChecksum(chunk, checksum);
            done(null, chunk);
          },
        }),
        createWriteStream(path, { flags: "wx", mode: executable ? 0o755 : 0o644 }),
      );
      if (checksum !== entry.crc32)
        throw new BailianError("Skill ZIP checksum mismatch / Skill ZIP 校验失败");
    }
  } finally {
    archive.close();
  }
  if (existsSync(join(directory, "SKILL.md"))) return directory;
  const roots = readdirSync(directory, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && existsSync(join(directory, entry.name, "SKILL.md")),
  );
  if (roots.length !== 1)
    throw new BailianError(
      "Expected one Skill package root with SKILL.md. / 压缩包须有一个包含 SKILL.md 的 Skill 根目录。",
    );
  return join(directory, roots[0]!.name);
}
