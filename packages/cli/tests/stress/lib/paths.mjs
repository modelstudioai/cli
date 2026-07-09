/**
 * 压测脚本根目录及 CLI/monorepo 路径解析。
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** 当前文件所在 lib 目录 */
const LIB_DIR = dirname(fileURLToPath(import.meta.url));

/** `packages/cli/tests/stress` */
export const STRESS_ROOT = join(LIB_DIR, "..");

/** `packages/cli` */
export const DEFAULT_CLI_PACKAGE = join(STRESS_ROOT, "..", "..");

/** monorepo 根目录 */
export const MONOREPO_ROOT = join(DEFAULT_CLI_PACKAGE, "..", "..");

/** CLI 入口 main.ts（由仓库本地 tsx 执行） */
export function resolveMainTs(cliPackage = DEFAULT_CLI_PACKAGE) {
  return join(cliPackage, "src", "main.ts");
}

/** monorepo 本地 bin 路径，避免 `pnpm run` 生命周期日志污染 stdout */
export function resolveLocalBin(name) {
  return join(
    MONOREPO_ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? `${name}.cmd` : name,
  );
}

/** tsx 可执行文件路径 */
export function resolveTsxBin() {
  return resolveLocalBin("tsx");
}
