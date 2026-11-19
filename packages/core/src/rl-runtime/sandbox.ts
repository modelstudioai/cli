/**
 * RL/OPD 沙箱黑盒入口（清单驱动 · 首次下载+缓存 · 最薄外围）。
 *
 * 命令层只传「要执行的 SDK 参数 + 凭证 + 可选 prepare」，黑盒内部按受审查清单
 * 首次下载/缓存运行时（resolveRuntime），建任务目录、组装 python -I -m dashscope.cli
 * 命令，经两层隔离 confinement 执行（executeIsolatedRun），归一化结果或透传错误。
 * 外围不再分别编排运行时解析与隔离执行——初始化是黑盒内部的事。
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

/** 注入沙箱的 API 凭证（结构化兼容 client.exportApiCredential()）。 */
export interface ISandboxCredential {
  token: string;
  baseUrl?: string;
}

export interface ISandboxRunInput {
  /** dashscope SDK 参数（不含解释器与 -I -m dashscope 前缀，由黑盒注入）。 */
  sdkArgs: string[] | ((layout: ITaskDirLayout) => string[]);
  credential: ISandboxCredential;
  /** 任务目录就绪后、spawn 前 staging 输入；返回 YAML 字符串则写 --config。 */
  prepare?: (layout: ITaskDirLayout) => string | void;
  timeoutMs?: number;
  maxOutputBytes?: number;
  signal?: AbortSignal;
  /** 允许首次下载/准备运行时（交互式 run）。 */
  allowInstall?: boolean;
  /** OS 禁读的真实凭据路径；缺省禁读真实 ~/.dashscope。 */
  credentialDenyPaths?: string[];
  /** 运行时解析覆盖（清单/deps/平台），供测试与管理命令。 */
  runtimeOptions?: IResolveRuntimeOptions;
  adapter?: IIsolationAdapter;
}

/** 归一化沙箱内 SDK 结果：超时/非零退出透传为错误，成功返回解析 JSON。 */
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
    // 服务端错误原样透传，绝不二次分类。
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

/** 黑盒唯一执行入口：清单进 → 内部初始化+confinement 执行 → 归一化结果出。 */
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
    // CLI 入口是 dashscope.cli（含 __main__.py，console_script 同源）；
    // 包根 dashscope 无 __main__.py，-m dashscope 会报 “cannot be directly executed”。
    "dashscope.cli",
    // 1.25.23 无顶层 --output 选项；JSON 输出是叶子级 --output-format/-o json，
    // 由命令层在 sdkArgs 里携带（cancel 等无该选项的命令除外）。
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
      // FC 内安装的 dashscope 版本与提交端运行时锁步（start.sh 模块路径由提交端
      // SDK 版本决定，FC_PYPI_LIB 只管 FC 装什么；两者错配会启动即崩）。
      // 用户零感知：无需手动注册任何环境变量。
      sdkEnv: { FC_PYPI_LIB: `dashscope==${runtime.dashscopeVersion}` },
      // SDK 相对进程 cwd 写 start.sh 再按 zipdir 打包（原 demo 流程 cwd==zipdir）。
      // cwd 必须是可写的 deploy-copy：taskDir 不在写允许集会 EPERM，且落在包外
      // 会导致上传 zip 缺启动脚本。
      cwd: layout.deployCopyDir,
      signal: input.signal,
    },
    input.adapter ?? createIsolationAdapter(),
  );
  return normalizeSandboxResult(result);
}
