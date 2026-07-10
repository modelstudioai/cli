import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { parseStdoutJson } from "e2e/output";
import { runNodeMain, type RunCliResult } from "e2e/runner";
import {
  isBailianE2EEnabled,
  isChatE2EReady,
  isDashScopeE2EReady,
  isSearchE2EReady,
} from "e2e/gating";
import { monorepoRoot } from "e2e/monorepo-root";

export {
  isBailianE2EEnabled,
  isChatE2EReady,
  isDashScopeE2EReady,
  isSearchE2EReady,
  monorepoRoot,
  parseStdoutJson,
};
export type { RunCliResult };

/** `packages/kscli` 根目录 */
export const kscliPackageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const mainTs = join(kscliPackageRoot, "src", "main.ts");

/** 子进程执行 kscli */
export async function runKscli(
  args: string[],
  envOverrides: NodeJS.ProcessEnv = {},
): Promise<RunCliResult> {
  return runNodeMain(mainTs, args, {
    cwd: kscliPackageRoot,
    env: {
      BAILIAN_CONFIG_DIR: mkdtempSync(join(tmpdir(), "kscli-test-")),
      ...envOverrides,
    },
  });
}
