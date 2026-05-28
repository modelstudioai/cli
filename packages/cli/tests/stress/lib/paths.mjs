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

/** CLI 入口 main.ts（ts-node 或直接 node ts 由项目脚本决定） */
export function resolveMainTs(cliPackage = DEFAULT_CLI_PACKAGE) {
  return join(cliPackage, "src", "main.ts");
}
