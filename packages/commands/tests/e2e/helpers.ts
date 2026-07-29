import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  cliTimeoutPrefix,
  cliTimeoutSeconds,
  e2eLabelFromMetaUrl,
  isConsoleAuthFailure,
  makeE2eOutputDir,
  parseStdoutJson,
} from "e2e/output";
import { runNodeMain, type RunCliResult } from "e2e/runner";
import type { E2eRouteExports } from "./topic-routes.ts";

export {
  cliTimeoutPrefix,
  cliTimeoutSeconds,
  e2eLabelFromMetaUrl,
  isConsoleAuthFailure,
  makeE2eOutputDir,
  parseStdoutJson,
};
export type { RunCliResult };

export {
  isBailianE2EEnabled,
  isBailianE2EMediaEnabled,
  isBailianE2EVideoEnabled,
  isChatE2EReady,
  isConsoleE2EReady,
  isDashScopeE2EReady,
  isOpenApiE2EReady,
  isSearchE2EReady,
} from "e2e/gating";

const e2eDir = dirname(fileURLToPath(import.meta.url));
const harnessMainTs = join(e2eDir, "harness", "main.ts");

/** `packages/commands` 根目录 */
export const commandsPackageRoot = join(e2eDir, "..", "..");

/** E2E fixtures 目录 */
export const e2eFixturesDir = join(e2eDir, "fixtures");

function serializeRoutes(routes: E2eRouteExports): string {
  return JSON.stringify(
    Object.entries(routes).map(([path, exportName]) => ({ path, export: exportName })),
  );
}

/**
 * 通过 harness 子进程执行命令 E2E。
 * `routes` 为本用例所需的最小 path → export 映射，不维护全量产品 map。
 */
export async function runCommandE2e(
  routes: E2eRouteExports,
  args: string[],
  envOverrides: NodeJS.ProcessEnv = {},
): Promise<RunCliResult> {
  return runNodeMain(harnessMainTs, args, {
    cwd: commandsPackageRoot,
    env: {
      BAILIAN_E2E_ROUTES: serializeRoutes(routes),
      ...envOverrides,
    },
  });
}
