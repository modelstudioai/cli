/**
 * Shared `bl` invocation for the plugins that delegate to the Bailian CLI
 * rather than calling DashScope directly — the ones whose CLI implementation
 * carries real substance (async task polling, artifact download, SSE session
 * streaming, `agents.yaml` resolution) that a plugin should not restate.
 * @module bailian-cli-dsh/shared/bl
 */
import type { Context } from "@deepseek-ai/cordis";
import type { SubprocessSpawnSpec } from "@deepseek-ai/dsh-subprocess";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";

const DEFAULT_STDOUT_MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_STDERR_MAX_BYTES = 64 * 1024;
const DEFAULT_GRACE_MS = 5_000;

/**
 * Environment names `bl` reads for credentials, endpoint routing, and profile
 * selection. `scrubbedParentEnv()` strips credential-shaped names from every
 * harness child, so the key would never reach `bl` unless forwarded here.
 */
const FORWARDED_ENV_NAMES = [
  "DASHSCOPE_API_KEY",
  "DASHSCOPE_BASE_URL",
  "DASHSCOPE_TIMEOUT",
  "BAILIAN_WORKSPACE_ID",
  "BAILIAN_CONFIG_DIR",
  "ALIBABA_CLOUD_ACCESS_KEY_ID",
  "ALIBABA_CLOUD_ACCESS_KEY_SECRET",
  "ALIBABA_CLOUD_SECURITY_TOKEN",
] as const;

/** A `bl` invocation that exited non-zero or produced unreadable output. */
export class BlError extends Error {
  constructor(
    message: string,
    readonly detail: { argv: readonly string[]; exitCode: number | null; stderr: string },
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "BlError";
  }
}

export interface RunBlOptions {
  /** Working directory for the child; callers pass the session cwd. */
  cwd: string;
  signal: AbortSignal;
  /** Extra entries layered after the forwarded Bailian names. */
  env?: NodeJS.ProcessEnv;
  stdoutMaxBytes?: number;
  graceMs?: number;
}

export interface BlOutcome {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  terminatedBy: NodeJS.Signals | null;
}

function abortError(): DOMException {
  return new DOMException("bl invocation aborted", "AbortError");
}

function forwardedEnv(ctx: Context, extra: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
  const launchEnvironment = launchEnvironmentOf(ctx);
  const env: NodeJS.ProcessEnv = {};
  for (const name of FORWARDED_ENV_NAMES) {
    const entry = launchEnvironment.get(name);
    if (entry !== undefined) env[name] = entry.value;
  }
  return { ...env, ...extra };
}

/**
 * Run `bl` to completion and collect its output.
 * @throws {BlError} when the executable cannot be resolved.
 * @throws {DOMException} `AbortError` when the caller's signal fires.
 */
export async function runBl(
  ctx: Context,
  argv: readonly string[],
  options: RunBlOptions,
): Promise<BlOutcome> {
  if (options.signal.aborted) throw abortError();

  const env = forwardedEnv(ctx, options.env);
  let executable: string;
  try {
    executable = await ctx.subprocess.resolveExecutable(
      "bl",
      env as Readonly<Record<string, string>>,
      options.signal,
    );
  } catch (error) {
    throw new BlError(
      "the `bl` executable was not found on PATH; install it with `npm install -g bailian-cli`",
      { argv, exitCode: null, stderr: "" },
      { cause: error },
    );
  }

  const spec: SubprocessSpawnSpec = {
    argv: [executable, ...argv],
    cwd: options.cwd,
    stdio: {
      stdin: "ignore",
      stdout: { maxBytes: options.stdoutMaxBytes ?? DEFAULT_STDOUT_MAX_BYTES },
      stderr: { maxBytes: DEFAULT_STDERR_MAX_BYTES },
    },
    graceMs: options.graceMs ?? DEFAULT_GRACE_MS,
    signal: options.signal,
    env,
  };

  const handle = ctx.subprocess.spawn(spec);
  if (options.signal.aborted) throw abortError();

  const outcome = await handle.done;
  if (options.signal.aborted) throw abortError();

  return {
    stdout: handle.collected.stdout?.readFrom(0).text ?? "",
    stderr: handle.collected.stderr?.readFrom(0).text ?? "",
    exitCode: outcome.exitCode,
    terminatedBy: outcome.signal,
  };
}

/**
 * Run `bl … --output json` and parse stdout.
 * @throws {BlError} on non-zero exit or unparseable stdout.
 */
export async function runBlJson<T>(
  ctx: Context,
  argv: readonly string[],
  options: RunBlOptions,
): Promise<T> {
  const withJson = [...argv, "--output", "json"];
  const outcome = await runBl(ctx, withJson, options);

  if (outcome.exitCode !== 0) {
    // bl passes service errors through verbatim; surface them unchanged.
    const reason = outcome.stderr.trim() || outcome.stdout.trim() || "no diagnostics on stderr";
    throw new BlError(`bl ${argv.join(" ")} failed: ${reason}`, {
      argv: withJson,
      exitCode: outcome.exitCode,
      stderr: outcome.stderr,
    });
  }

  try {
    return JSON.parse(outcome.stdout) as T;
  } catch (error) {
    throw new BlError(
      `bl ${argv.join(" ")} did not emit JSON on stdout`,
      { argv: withJson, exitCode: outcome.exitCode, stderr: outcome.stderr },
      { cause: error },
    );
  }
}
