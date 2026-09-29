import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdtemp, open, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { BailianError, ExitCode, type LocalizedText } from "bailian-cli-core";
import type { SyncLocalFile } from "./types.ts";

/** Called only after confirmation. Upload immutable verified bytes, not a mutable
 * source path; stream to a private temporary file without buffering whole documents.
 */
export async function withSyncFileSnapshot<Result>(
  file: SyncLocalFile,
  localize: (text: LocalizedText) => string,
  consume: (snapshot: SyncLocalFile) => Promise<Result>,
): Promise<Result> {
  const changed = () =>
    new BailianError(
      localize({
        "en-US": `Source changed after planning: ${file.relativePath}. Prepare a fresh plan before uploading.`,
        "zh-CN": `源文件在生成计划后发生变化：${file.relativePath}。请重新生成计划后上传。`,
      }),
      ExitCode.GENERAL,
    );
  const initial = await lstat(file.absolutePath);
  if (
    !initial.isFile() ||
    initial.isSymbolicLink() ||
    initial.size !== file.size ||
    (await realpath(file.absolutePath)) !== file.absolutePath
  )
    throw changed();
  const source = await open(file.absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let directory: string | undefined;
  try {
    const opened = await source.stat();
    if (
      opened.dev !== initial.dev ||
      opened.ino !== initial.ino ||
      opened.size !== initial.size ||
      opened.ctimeMs !== initial.ctimeMs
    )
      throw changed();
    directory = await mkdtemp(join(tmpdir(), "bailian-sync-upload-"));
    const snapshotPath = join(directory, basename(file.absolutePath));
    const destination = await open(snapshotPath, "wx", 0o600);
    const sha256 = createHash("sha256");
    const md5 = createHash("md5");
    let size = 0;
    try {
      for await (const chunk of source.createReadStream({ autoClose: false })) {
        size += chunk.length;
        if (size > file.size) throw changed();
        sha256.update(chunk);
        md5.update(chunk);
        await destination.writeFile(chunk);
      }
      await destination.sync();
    } finally {
      await destination.close();
    }
    const after = await source.stat();
    const current = await lstat(file.absolutePath);
    if (
      size !== file.size ||
      sha256.digest("hex") !== file.contentSha256 ||
      md5.digest("hex") !== file.contentMd5 ||
      after.ctimeMs !== opened.ctimeMs ||
      after.mtimeMs !== opened.mtimeMs ||
      current.ino !== opened.ino ||
      current.dev !== opened.dev ||
      current.isSymbolicLink() ||
      (await realpath(file.absolutePath)) !== file.absolutePath
    )
      throw changed();
    return await consume({ ...file, absolutePath: snapshotPath });
  } finally {
    await source.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
