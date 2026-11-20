/**
 * 文件快照 + deploy-copy + 数据暂存。
 *
 * SDK 的 zip_dir() 会递归读取整个 zipdir 并写 start.sh，因此不能直接指向用户
 * 原工程：先按 include/exclude 复制到只读 snapshot/，再复制出可写 deploy-copy/
 * 供 SDK 落 start.sh；数据单独复制到 data/。内置安全排除 + 拒绝符号链接。
 */

import { copyFileSync, cpSync, lstatSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

/** 目录级安全排除（任意路径段命中即排除）。 */
const SAFETY_EXCLUDE_DIRS = new Set([".git", ".venv", "node_modules", "__pycache__"]);
/** 文件级安全排除（basename 命中即排除）。 */
const SAFETY_EXCLUDE_FILE_PATTERNS = [/^\.env/, /\.pem$/, /\.key$/];
/** 默认包大小上限（字节）。 */
const DEFAULT_MAX_PACKAGE_BYTES = 200 * 1024 * 1024;

export interface ISnapshotOptions {
  sourceDir: string;
  snapshotDir: string;
  deployCopyDir: string;
  include?: string[];
  exclude?: string[];
  maxPackageBytes?: number;
}

export interface ISnapshotResult {
  fileCount: number;
  totalBytes: number;
  /** 相对 sourceDir 的 posix 路径列表（上传摘要）。 */
  files: string[];
}

/** 最小 glob 匹配器：支持 ** / * / ?，路径按 posix 分隔符匹配。 */
function globToRegExp(glob: string): RegExp {
  const normalized = glob.replace(/\\/g, "/");
  let pattern = "";
  for (let index = 0; index < normalized.length; index++) {
    const char = normalized[index];
    if (char === "*") {
      if (normalized[index + 1] === "*") {
        pattern += ".*";
        index++;
        if (normalized[index + 1] === "/") index++;
      } else {
        pattern += "[^/]*";
      }
    } else if (char === "?") {
      pattern += "[^/]";
    } else {
      pattern += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${pattern}$`);
}

function matchesAny(relativePath: string, globs: string[] | undefined): boolean {
  if (!globs || globs.length === 0) return false;
  return globs.some((glob) => globToRegExp(glob).test(relativePath));
}

function isSafetyExcluded(relativePath: string, isDir: boolean): boolean {
  const segments = relativePath.split("/");
  if (segments.some((segment) => SAFETY_EXCLUDE_DIRS.has(segment))) return true;
  if (!isDir) {
    const name = segments[segments.length - 1];
    if (SAFETY_EXCLUDE_FILE_PATTERNS.some((pattern) => pattern.test(name))) return true;
  }
  return false;
}

function toPosix(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}

/** 拒绝符号链接（Windows 下 junction 同样被 lstat 识别为符号链接）。 */
function assertNotSymlink(entryPath: string): void {
  const stat = lstatSync(entryPath);
  if (stat.isSymbolicLink()) {
    throw new BailianError(
      `Refusing to snapshot symlink: ${entryPath}`,
      ExitCode.USAGE,
      "Remove symlinks from the source directory; they may escape the upload scope.",
    );
  }
}

/**
 * 复制源码到 snapshot/ 并生成可写 deploy-copy/。返回上传摘要。
 */
export function createSnapshot(options: ISnapshotOptions): ISnapshotResult {
  const { sourceDir, snapshotDir, deployCopyDir } = options;
  const maxBytes = options.maxPackageBytes ?? DEFAULT_MAX_PACKAGE_BYTES;
  const files: string[] = [];
  let totalBytes = 0;

  mkdirSync(snapshotDir, { recursive: true });

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const entryPath = join(dir, entry);
      assertNotSymlink(entryPath);
      const stat = lstatSync(entryPath);
      const relativePath = toPosix(relative(sourceDir, entryPath));
      const isDir = stat.isDirectory();

      if (isSafetyExcluded(relativePath, isDir)) continue;
      if (matchesAny(relativePath, options.exclude)) continue;
      // include 为空表示全部纳入；否则仅纳入命中项（目录始终遍历以深入匹配）。
      if (!isDir && options.include && options.include.length > 0) {
        if (!matchesAny(relativePath, options.include)) continue;
      }

      if (isDir) {
        walk(entryPath);
      } else {
        const size = statSync(entryPath).size;
        totalBytes += size;
        if (totalBytes > maxBytes) {
          throw new BailianError(
            `Source package exceeds the ${maxBytes} byte limit.`,
            ExitCode.USAGE,
            "Narrow --include or add --exclude to reduce the upload size.",
          );
        }
        const destPath = join(snapshotDir, relativePath);
        mkdirSync(join(destPath, ".."), { recursive: true });
        copyFileSync(entryPath, destPath);
        files.push(relativePath);
      }
    }
  };

  walk(sourceDir);

  // deploy-copy 是 snapshot 的可写副本，SDK 的 zipdir 指向它（start.sh 落此）。
  cpSync(snapshotDir, deployCopyDir, { recursive: true });

  return { fileCount: files.length, totalBytes, files };
}

/**
 * 将数据文件单独复制到 data/（不混进代码包）。返回暂存后的绝对路径。
 */
export function stageDataFiles(files: string[], dataDir: string): string[] {
  mkdirSync(dataDir, { recursive: true });
  const staged: string[] = [];
  for (const file of files) {
    assertNotSymlink(file);
    const destPath = join(dataDir, basename(file));
    copyFileSync(file, destPath);
    staged.push(destPath);
  }
  return staged;
}
