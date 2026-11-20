/**
 * RL/OPD sandbox black-box entry (manifest-driven · first-time download + cache · thinnest possible shell).
 *
 * The command layer passes only "SDK args to execute + credential + optional prepare"; inside the black box the reviewed manifest
 * drives first-time download/caching of the runtime (resolveRuntime), task-dir creation, assembly of the python -I -m dashscope.cli
 * command, execution through the two-layer isolation confinement (executeIsolatedRun), and result normalization or error pass-through.
 * The shell no longer orchestrates runtime resolution and isolated execution separately — initialization is the black box's business.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { executeIsolatedRun } from "../isolation/app-layer.ts";
import { createIsolationAdapter } from "../isolation/os-isolation/detect.ts";
import { createTaskDir, type ITaskDirLayout } from "../isolation/paths.ts";
import type { IIsolationAdapter, IIsolationResult } from "../isolation/types.ts";
import { resolveRuntime, type IResolveRuntimeOptions } from "./manager.ts";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

/** API credential injected into the sandbox (structurally compatible with client.exportApiCredential()). */
export interface ISandboxCredential {
  token: string;
  baseUrl?: string;
}

export interface ISandboxRunInput {
  /** dashscope SDK args (without the interpreter and -I -m dashscope prefix, injected by the black box). */
  sdkArgs: string[] | ((layout: ITaskDirLayout) => string[]);
  credential: ISandboxCredential;
  /** Staging input after the task dir is ready and before spawn; returning a YAML string writes --config. */
  prepare?: (layout: ITaskDirLayout) => string | void;
  timeoutMs?: number;
  maxOutputBytes?: number;
  signal?: AbortSignal;
  /** Allow first-time runtime download/preparation (interactive run). */
  allowInstall?: boolean;
  /** Real credential paths the OS must deny reads for; defaults to denying the real ~/.dashscope. */
  credentialDenyPaths?: string[];
  /** Runtime resolution overrides (manifest/deps/platform) for tests and management commands. */
  runtimeOptions?: IResolveRuntimeOptions;
  adapter?: IIsolationAdapter;
}

/** Normalize the in-sandbox SDK result: timeout/non-zero exit passes through as an error; success returns parsed JSON. */
export function normalizeSandboxResult(result: IIsolationResult): unknown {
  if (result.timedOut) {
    throw new BailianError(
      "The RL task timed out; its remote result is unknown. / RL 任务超时，远端结果未知。",
      ExitCode.TIMEOUT,
      "Check the job status with finetune rl get; the cloud job was not canceled.",
    );
  }
  let parsed: unknown;
  const stdout = result.stdout.trim();
  if (stdout) {
    try {
      parsed = JSON.parse(stdout);
    } catch {
      parsed = undefined;
    }
  }
  if (result.exitCode !== 0) {
    // Server errors pass through verbatim; never re-classify.
    const fromJson =
      parsed && typeof parsed === "object"
        ? ((parsed as Record<string, unknown>).message ?? (parsed as Record<string, unknown>).error)
        : undefined;
    const message =
      (typeof fromJson === "string" && fromJson) ||
      result.stderr.trim() ||
      stdout ||
      `dashscope exited with code ${result.exitCode}. / dashscope 以退出码 ${result.exitCode} 结束。`;
    throw new BailianError(message, ExitCode.GENERAL);
  }
  return parsed ?? { raw: stdout };
}

/** The black box's sole execution entry: manifest in → internal init + confinement execution → normalized result out. */
export async function executeInSandbox(input: ISandboxRunInput): Promise<unknown> {
  const runtime = await resolveRuntime({
    allowInstall: input.allowInstall,
    ...input.runtimeOptions,
  });
  const layout = createTaskDir();

  let hasConfig = false;
  if (input.prepare) {
    const yaml = input.prepare(layout);
    if (typeof yaml === "string") {
      writeFileSync(layout.configPath, yaml, "utf8");
      hasConfig = true;
    }
  }

  const resolvedArgs = typeof input.sdkArgs === "function" ? input.sdkArgs(layout) : input.sdkArgs;
  const command = [
    runtime.pythonPath,
    "-I",
    "-m",
    // The CLI entry is dashscope.cli (has __main__.py, same origin as the console_script);
    // the package root dashscope has no __main__.py, so -m dashscope reports "cannot be directly executed".
    "dashscope.cli",
    // 1.25.23 has no top-level --output option; JSON output is the leaf-level --output-format/-o json,
    // carried by the command layer in sdkArgs (except commands like cancel that lack the option).
    ...resolvedArgs,
    ...(hasConfig ? ["--config", layout.configPath] : []),
  ];

  const result = await executeIsolatedRun(
    {
      layout,
      runtimeRoot: runtime.runtimeRoot,
      command,
      apiKey: input.credential.token,
      baseUrl: input.credential.baseUrl,
      credentialDenyPaths: input.credentialDenyPaths ?? [join(homedir(), ".dashscope")],
      timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxOutputBytes: input.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
      // The dashscope version installed inside FC stays locked to the submit-side runtime (start.sh module paths are determined
      // by the submit-side SDK version; FC_PYPI_LIB only controls what FC installs; a mismatch crashes at startup).
      // Zero user involvement: no environment variable needs manual registration.
      sdkEnv: { FC_PYPI_LIB: `dashscope==${runtime.dashscopeVersion}` },
      // The SDK writes start.sh relative to the process cwd, then packages via zipdir (the original demo flow had cwd==zipdir).
      // cwd must be the writable deploy-copy: taskDir is outside the write allowlist (EPERM), and landing outside the package
      // would leave the uploaded zip without the startup script.
      cwd: layout.deployCopyDir,
      signal: input.signal,
    },
    input.adapter ?? createIsolationAdapter(),
  );
  return normalizeSandboxResult(result);
}
