import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import * as filesystem from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { BailianError, ExitCode, type LocalizedText } from "bailian-cli-core";
import { checkUploadFile, isMediaFile, isSupportedExtension } from "../upload-support.ts";
import { validRelativePath } from "./tags.ts";
import type { SyncScan } from "./types.ts";

const EXCLUDED_NAMES = new Set([".git", "node_modules", ".bailian"]);

function sameFile(before: Stats, after: Stats): boolean {
  return (
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.mtimeMs === after.mtimeMs &&
    before.ctimeMs === after.ctimeMs
  );
}

/** No writes, no symlink traversal, and no partial inventory on any read error. */
export async function scanSyncDirectory(
  directory: string,
  stateFile: string,
  localize: (text: LocalizedText) => string,
): Promise<SyncScan> {
  const initial = await filesystem.lstat(directory);
  if (!initial.isDirectory() || initial.isSymbolicLink())
    throw new BailianError(
      localize({
        "en-US": "The synchronization source must be a directory, not a symbolic link.",
        "zh-CN": "同步源必须是目录，不能是符号链接。",
      }),
      ExitCode.USAGE,
    );
  const root = await filesystem.realpath(directory);
  // Resolve source-relative exclusions against the canonical root as well (e.g.
  // macOS /var → /private/var); the checkpoint need not exist during preview.
  const checkpointPath = resolve(root, relative(resolve(directory), resolve(stateFile)));
  const output: SyncScan = { files: [], skipped: [], warnings: [] };
  const changed = (path: string) =>
    new BailianError(
      localize({
        "en-US": `Source changed during scanning: ${path}. Retry before synchronizing.`,
        "zh-CN": `扫描期间源路径发生变化：${path}。请重新扫描后再同步。`,
      }),
      ExitCode.GENERAL,
    );
  const relativePath = (path: string) => relative(root, path).split(sep).join("/");

  async function walk(path: string): Promise<void> {
    const before = await filesystem.lstat(path);
    if (
      !before.isDirectory() ||
      before.isSymbolicLink() ||
      (await filesystem.realpath(path)) !== path
    )
      throw changed(path);
    for (const name of (await filesystem.readdir(path)).sort()) {
      const absolutePath = join(path, name);
      const entryPath = relativePath(absolutePath);
      if (!validRelativePath(entryPath))
        throw new BailianError(
          localize({
            "en-US": `Unsupported synchronization path: ${entryPath}. Use a relative path without traversal or backslashes.`,
            "zh-CN": `不支持的同步路径：${entryPath}。请使用不含越界片段或反斜杠的相对路径。`,
          }),
          ExitCode.USAGE,
        );
      const metadata = await filesystem.lstat(absolutePath);
      if (
        EXCLUDED_NAMES.has(name) ||
        absolutePath === checkpointPath ||
        absolutePath === `${checkpointPath}.lock` ||
        (dirname(absolutePath) === dirname(checkpointPath) &&
          name.startsWith(`.${basename(checkpointPath)}.`) &&
          name.endsWith(".tmp"))
      ) {
        output.skipped.push({
          relativePath: entryPath,
          reason: "excluded",
          subtree: metadata.isDirectory() || metadata.isSymbolicLink(),
        });
      } else if (metadata.isSymbolicLink()) {
        output.skipped.push({ relativePath: entryPath, reason: "symlink", subtree: true });
      } else if (metadata.isDirectory()) {
        output.skipped.push({ relativePath: entryPath, reason: "directory", subtree: false });
        await walk(absolutePath);
      } else if (!metadata.isFile()) {
        output.skipped.push({ relativePath: entryPath, reason: "not-file", subtree: false });
      } else if (!isSupportedExtension(name) || isMediaFile(name)) {
        output.skipped.push({ relativePath: entryPath, reason: "unsupported", subtree: false });
      } else {
        const checked = checkUploadFile(absolutePath, localize);
        if (checked.warning) output.warnings.push(checked.warning);
        const handle = await filesystem.open(
          absolutePath,
          constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        try {
          if (!sameFile(metadata, await handle.stat())) throw changed(entryPath);
          const sha256 = createHash("sha256");
          const md5 = createHash("md5");
          for await (const chunk of handle.createReadStream({ autoClose: false })) {
            sha256.update(chunk);
            md5.update(chunk);
          }
          if (
            !sameFile(metadata, await handle.stat()) ||
            !sameFile(metadata, await filesystem.lstat(absolutePath))
          )
            throw changed(entryPath);
          output.files.push({
            absolutePath,
            relativePath: entryPath,
            contentSha256: sha256.digest("hex"),
            contentMd5: md5.digest("hex"),
            size: metadata.size,
            mtimeMs: metadata.mtimeMs,
          });
        } finally {
          await handle.close();
        }
      }
    }
    if (!sameFile(before, await filesystem.lstat(path))) throw changed(relativePath(path) || ".");
  }
  await walk(root);
  const compare = (left: { relativePath: string }, right: { relativePath: string }) =>
    left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0;
  output.files.sort(compare);
  output.skipped.sort(compare);
  return output;
}
