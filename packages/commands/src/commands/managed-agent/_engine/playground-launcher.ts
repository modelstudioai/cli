import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { BailianError, type Client, ExitCode, type Settings } from "bailian-cli-core";
import { emitBare } from "bailian-cli-runtime";

const PLAYGROUND_PACKAGE = "@openagentpack/playground";
const DEFAULT_PORT = 4848;
const PLAYGROUND_URL_PATTERN = /running at http:\/\/localhost:(\d+)/i;

export interface PlaygroundLaunchOptions {
  port?: number;
  open: boolean;
  file: string;
  agent?: string;
  surface: "preview" | "workbench";
  client: Client;
  settings: Settings;
}

interface Launcher {
  command: string;
  args: string[];
  version?: string;
  fetched: boolean;
}

interface ExistingPlayground {
  version: string;
  pid: number;
  projectId?: string;
}

interface PlaygroundProjectSummary {
  status?: string;
  agents?: Array<{ agent?: { id?: string } }>;
}

export interface PlaygroundBrowserTarget {
  url: string;
  warning?: string;
}

export async function launchManagedAgentPlayground(
  options: PlaygroundLaunchOptions,
): Promise<void> {
  assertSupportedNodeVersion();
  const port = options.port ?? DEFAULT_PORT;
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new BailianError(`Invalid --port '${port}'.`, ExitCode.USAGE);
  }
  const configPath = resolve(options.file);
  const projectId = createHash("sha256").update(configPath).digest("hex").slice(0, 16);
  const launcher = resolveLauncher();
  const existing = await probeExistingPlayground(port);
  if (existing) {
    const reusable =
      existing.projectId === projectId &&
      (launcher.version === undefined || existing.version === launcher.version);
    if (reusable) {
      emitBare(`Workbench already running at http://localhost:${port} (pid ${existing.pid}).`);
      await openPlaygroundSurface(port, options.surface, options.agent, options.open);
      return;
    }
    const released = await replaceExistingPlayground(existing, port);
    if (!released) {
      throw new BailianError(
        `Could not stop the existing Workbench process (pid ${existing.pid}) on port ${port}.`,
        ExitCode.GENERAL,
        "Stop it manually or choose another --port.",
      );
    }
  }

  const environment = buildPlaygroundEnvironment(options, port, configPath);
  if (launcher.fetched) {
    emitBare(`Fetching ${PLAYGROUND_PACKAGE} (first run may take a moment)...`);
  }
  const child = spawn(launcher.command, launcher.args, {
    env: environment,
    stdio: ["inherit", "pipe", "inherit"],
  });
  const removeSignalForwarding = forwardSignals(child);
  try {
    const readyPort = await waitForPlaygroundReady(child, port, 30_000, projectId);
    if (readyPort === null) {
      throw new BailianError(
        `Workbench did not become ready in time. Check the logs above, then open http://localhost:${port}.`,
        ExitCode.GENERAL,
      );
    }
    emitBare(`Workbench ready at http://localhost:${readyPort}`);
    await openPlaygroundSurface(readyPort, options.surface, options.agent, options.open);
    const exitCode = await waitForChildExit(child);
    if (exitCode !== 0) {
      throw new BailianError(`Workbench exited with code ${exitCode}.`, ExitCode.GENERAL);
    }
  } finally {
    removeSignalForwarding();
  }
}

export function playgroundBrowserTargetFromSummary(
  baseUrl: string,
  summary: PlaygroundProjectSummary,
  requestedAgent?: string,
): PlaygroundBrowserTarget {
  if (summary.status !== "valid") return { url: baseUrl };
  const agentIds = (summary.agents ?? [])
    .map((entry) => entry.agent?.id?.trim())
    .filter((agentId): agentId is string => Boolean(agentId));
  const requested = requestedAgent?.trim();
  if (requested) {
    if (agentIds.includes(requested)) {
      return { url: `${baseUrl}/agents/${encodeURIComponent(requested)}/preview` };
    }
    return {
      url: baseUrl,
      warning: `Agent '${requested}' was not found. Opening the project Workbench instead.`,
    };
  }
  if (agentIds.length === 1) {
    return { url: `${baseUrl}/agents/${encodeURIComponent(agentIds[0]!)}/preview` };
  }
  if (agentIds.length > 1) {
    return {
      url: baseUrl,
      warning:
        "This project declares multiple Agents. Opening the Workbench; rerun with --agent <id> for Preview.",
    };
  }
  return { url: baseUrl };
}

function assertSupportedNodeVersion(): void {
  const majorVersion = Number(process.versions.node.split(".")[0]);
  if (Number.isFinite(majorVersion) && majorVersion >= 22) return;
  throw new BailianError(
    "Managed Agent Workbench requires Node.js 22 or later.",
    ExitCode.USAGE,
    "Upgrade Node.js for Workbench; other Bailian CLI commands continue to support Node.js 18.17+.",
  );
}

function resolveLauncher(): Launcher {
  const explicit =
    process.env.BAILIAN_MANAGED_AGENT_PLAYGROUND_BIN?.trim() ||
    process.env.AGENTS_PLAYGROUND_BIN?.trim();
  if (explicit) {
    if (!existsSync(explicit)) {
      throw new BailianError(
        `Configured Workbench binary does not exist: ${explicit}`,
        ExitCode.USAGE,
      );
    }
    return { command: process.execPath, args: [explicit], fetched: false };
  }

  const installed = resolveInstalledPlayground();
  if (installed) return installed;

  const monorepoBinary = findLocalPlaygroundBin(process.cwd());
  if (monorepoBinary) {
    return { command: process.execPath, args: [monorepoBinary], fetched: false };
  }

  const requestedVersion = process.env.BAILIAN_MANAGED_AGENT_PLAYGROUND_VERSION?.trim() || "latest";
  return {
    command: "npx",
    args: ["-y", `${PLAYGROUND_PACKAGE}@${requestedVersion}`],
    version: requestedVersion === "latest" ? undefined : requestedVersion,
    fetched: true,
  };
}

function resolveInstalledPlayground(): Launcher | undefined {
  try {
    const require = createRequire(import.meta.url);
    const packageJsonPath = require.resolve(`${PLAYGROUND_PACKAGE}/package.json`);
    const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      version?: string;
      bin?: string | Record<string, string>;
    };
    const relativeBinary =
      typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.["agents-playground"];
    if (!relativeBinary) return undefined;
    const binaryPath = resolve(dirname(packageJsonPath), relativeBinary);
    if (!existsSync(binaryPath)) return undefined;
    return {
      command: process.execPath,
      args: [binaryPath],
      version: manifest.version,
      fetched: false,
    };
  } catch {
    return undefined;
  }
}

function findLocalPlaygroundBin(startDirectory: string): string | undefined {
  let directory = startDirectory;
  for (let depth = 0; depth < 10; depth += 1) {
    const candidate = resolve(directory, "packages/playground/dist/bin/playground.js");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return undefined;
}

function buildPlaygroundEnvironment(
  options: PlaygroundLaunchOptions,
  port: number,
  configPath: string,
): NodeJS.ProcessEnv {
  const credential = options.client.exportApiCredential();
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    AGENTS_CONFIG_PATH: configPath,
    AGENTS_PLAYGROUND_TOKEN: randomBytes(32).toString("hex"),
  };
  if (credential) environment.DASHSCOPE_API_KEY = credential.token;
  const baseUrl = options.client.baseUrl.replace(/\/+$/, "");
  environment.BAILIAN_BASE_URL = baseUrl.endsWith("/api/v1/agentstudio")
    ? baseUrl
    : `${baseUrl}/api/v1/agentstudio`;
  if (options.settings.workspaceId) {
    environment.BAILIAN_WORKSPACE_ID = options.settings.workspaceId;
  }
  return environment;
}

async function waitForPlaygroundReady(
  child: ChildProcess,
  fallbackPort: number,
  timeoutMs: number,
  expectedProjectId: string,
): Promise<number | null> {
  let port = fallbackPort;
  let outputBuffer = "";
  child.stdout?.on("data", (chunk: Buffer | string) => {
    process.stdout.write(chunk);
    outputBuffer += chunk.toString();
    const match = outputBuffer.match(PLAYGROUND_URL_PATTERN);
    if (match?.[1]) port = Number(match[1]);
  });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (child.exitCode !== null) return null;
    try {
      const response = await fetch(`http://localhost:${port}/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      const body = response.ok
        ? ((await response.json()) as { playground?: { project_id?: string } })
        : undefined;
      if (body?.playground?.project_id === expectedProjectId) return port;
    } catch {
      // Not ready yet.
    }
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 300));
  }
  return null;
}

async function probeExistingPlayground(port: number): Promise<ExistingPlayground | null> {
  try {
    const response = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      playground?: { version?: string; pid?: number; project_id?: string };
    };
    if (!body.playground?.pid) return null;
    return {
      version: body.playground.version ?? "unknown",
      pid: body.playground.pid,
      projectId: body.playground.project_id,
    };
  } catch {
    return null;
  }
}

async function replaceExistingPlayground(
  existing: ExistingPlayground,
  port: number,
): Promise<boolean> {
  emitBare(`Replacing Workbench v${existing.version} (pid ${existing.pid}) on port ${port}...`);
  try {
    process.kill(existing.pid, "SIGTERM");
  } catch {
    return true;
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 100));
    if (!(await probeExistingPlayground(port))) return true;
  }
  return false;
}

async function openPlaygroundSurface(
  port: number,
  surface: "preview" | "workbench",
  requestedAgent: string | undefined,
  shouldOpen: boolean,
): Promise<void> {
  if (!shouldOpen) return;
  const target =
    surface === "workbench"
      ? { url: `http://localhost:${port}` }
      : await resolvePlaygroundBrowserTarget(port, requestedAgent);
  if (target.warning) emitBare(`Warning: ${target.warning}`);
  openBrowser(target.url);
}

async function resolvePlaygroundBrowserTarget(
  port: number,
  requestedAgent?: string,
): Promise<PlaygroundBrowserTarget> {
  const baseUrl = `http://localhost:${port}`;
  try {
    const response = await fetch(`${baseUrl}/api/project`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return { url: baseUrl };
    return playgroundBrowserTargetFromSummary(
      baseUrl,
      (await response.json()) as PlaygroundProjectSummary,
      requestedAgent,
    );
  } catch {
    return { url: baseUrl };
  }
}

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  const args = process.platform === "win32" ? ["", url] : [url];
  try {
    spawn(command, args, {
      stdio: "ignore",
      detached: true,
      shell: process.platform === "win32",
    }).unref();
  } catch {
    emitBare(`Could not open a browser automatically. Visit ${url}`);
  }
}

function forwardSignals(child: ChildProcess): () => void {
  const forwardInterrupt = () => child.kill("SIGINT");
  const forwardTerminate = () => child.kill("SIGTERM");
  process.on("SIGINT", forwardInterrupt);
  process.on("SIGTERM", forwardTerminate);
  return () => {
    process.off("SIGINT", forwardInterrupt);
    process.off("SIGTERM", forwardTerminate);
  };
}

function waitForChildExit(child: ChildProcess): Promise<number> {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolveExit, rejectExit) => {
    child.once("exit", (exitCode) => resolveExit(exitCode ?? 0));
    child.once("error", rejectExit);
  });
}
