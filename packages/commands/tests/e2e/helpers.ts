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
import { captureRegistryHelp } from "e2e/registry-smoke";
import { runNodeMain, type RunCliResult } from "e2e/runner";
import { buildIsolatedCliEnv } from "e2e/isolation";
import { runInProcess } from "e2e/in-process";
import { CommandRegistry, createCli, resolve } from "bailian-cli-runtime";
import { loadRouteCommands } from "./harness/routes.ts";
import { E2E_HARNESS_IDENTITY } from "./harness/identity.ts";
import { withHarnessUpdateFixture } from "./harness/update-fixture.ts";
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
  isConnectorE2EReady,
  isConsoleE2EReady,
  isDashScopeE2EReady,
  isImageKbE2EReady,
  isKbAdminE2EReady,
  isMemoryE2EReady,
  isMemorySkillE2EReady,
  isMultimodalChatE2EReady,
  isMultimodalSearchE2EReady,
  isOpenApiE2EReady,
  isOssImportE2EReady,
  isSearchE2EReady,
  isTableKbE2EReady,
  isTableSearchE2EReady,
} from "e2e/gating";

const e2eDir = dirname(fileURLToPath(import.meta.url));
const harnessMainTs = join(e2eDir, "harness", "main.ts");
const registryCache = new WeakMap<E2eRouteExports, Promise<CommandRegistry>>();

export const commandsPackageRoot = join(e2eDir, "..", "..");

export const e2eFixturesDir = join(e2eDir, "fixtures");

function serializeRoutes(routes: E2eRouteExports): string {
  return JSON.stringify(
    Object.entries(routes).map(([path, exportName]) => ({ path, export: exportName })),
  );
}

function getCommandRegistry(routes: E2eRouteExports): Promise<CommandRegistry> {
  const cachedRegistry = registryCache.get(routes);
  if (cachedRegistry) return cachedRegistry;

  const registryPromise = loadRouteCommands(routes).then(
    (commands) => new CommandRegistry(commands, "bl"),
  );
  registryCache.set(routes, registryPromise);
  return registryPromise;
}

/** In-worker help via topic routes (no CLI subprocess). */
export async function captureCommandHelp(
  routes: E2eRouteExports,
  commandPath: string[],
): Promise<string> {
  const registry = await getCommandRegistry(routes);
  const resolution = resolve([...commandPath, "--help"], registry);
  if (resolution.kind !== "help" || resolution.path.join(" ") !== commandPath.join(" ")) {
    throw new Error(`Command help did not resolve: ${commandPath.join(" ")}`);
  }
  return captureRegistryHelp(registry, commandPath);
}

/** Same result shape as runCommandE2e; help is rendered in-worker. */
export async function runCommandHelp(
  routes: E2eRouteExports,
  args: string[],
): Promise<RunCliResult> {
  if (args.at(-1) !== "--help") {
    throw new Error("runCommandHelp requires --help as the final argument");
  }
  const stderr = await captureCommandHelp(routes, args.slice(0, -1));
  return { stdout: "", stderr, exitCode: 0 };
}

export interface CommandE2eRunOptions {
  /** Copy host console access_token into the isolated config. */
  seedCredentials?: boolean;
}

/** Harness subprocess E2E; `routes` is the minimal path → export map for this topic. */
export async function runCommandE2e(
  routes: E2eRouteExports,
  args: string[],
  envOverrides: NodeJS.ProcessEnv = {},
  options: CommandE2eRunOptions = {},
): Promise<RunCliResult> {
  return runNodeMain(harnessMainTs, args, {
    cwd: commandsPackageRoot,
    seedCredentials: options.seedCredentials,
    env: {
      BAILIAN_E2E_ROUTES: serializeRoutes(routes),
      ...envOverrides,
    },
  });
}

/** Console live: isolate and seed host access_token. */
export async function runConsoleCommandE2e(
  routes: E2eRouteExports,
  args: string[],
  envOverrides: NodeJS.ProcessEnv = {},
): Promise<RunCliResult> {
  return runCommandE2e(routes, args, envOverrides, { seedCredentials: true });
}

/**
 * Offline opt-in: real createCli in-process with e2e/isolation.
 * Falls back to a subprocess when NODE_OPTIONS or HTTP(S)_PROXY is set.
 */
export async function runCommandInProcess(
  routes: E2eRouteExports,
  args: string[],
  envOverrides: NodeJS.ProcessEnv = {},
): Promise<RunCliResult> {
  const environment = { ...process.env, ...envOverrides };
  if (
    environment.NODE_OPTIONS ||
    environment.HTTP_PROXY ||
    environment.HTTPS_PROXY ||
    environment.http_proxy ||
    environment.https_proxy
  ) {
    return runCommandE2e(routes, args, envOverrides);
  }
  const isolated = buildIsolatedCliEnv({ overrides: envOverrides });
  try {
    const commands = await loadRouteCommands(routes);
    return await runInProcess(
      () => withHarnessUpdateFixture(() => createCli(commands, E2E_HARNESS_IDENTITY).run(args)),
      args,
      { cwd: commandsPackageRoot, env: isolated.env, entrypoint: harnessMainTs },
    );
  } finally {
    isolated.dispose();
  }
}
