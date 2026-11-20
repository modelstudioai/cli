/**
 * 任务目录与运行时目录布局。
 *
 * 数据目录统一经 getConfigDir() 派生（仓库约定，全平台一致，不做平台分支）：
 * runs/<run-id>/ 随调用结束立即销毁（app-layer finally）；崩溃路径孤儿由
 * runtime clean / prepare 按 TTL 兜底回收（见 cleanup.ts）。
 */

import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../config/paths.ts";

/** 一次任务的目录布局。 */
export interface ITaskDirLayout {
  runId: string;
  taskDir: string;
  snapshotDir: string;
  dataDir: string;
  deployCopyDir: string;
  tmpDir: string;
  homeDir: string;
  dashscopeDir: string;
  cacheDir: string;
  configPath: string;
  resultPath: string;
}

/** 生成随机 run-id（不依赖时间戳，避免可预测）。 */
export function newRunId(): string {
  return randomBytes(8).toString("hex");
}

export function runsRoot(): string {
  return join(getConfigDir(), "runs");
}

/** 创建任务目录骨架（含 home/.dashscope），返回布局。 */
export function createTaskDir(runId: string = newRunId()): ITaskDirLayout {
  const taskDir = join(runsRoot(), runId);
  const layout: ITaskDirLayout = {
    runId,
    taskDir,
    snapshotDir: join(taskDir, "snapshot"),
    dataDir: join(taskDir, "data"),
    deployCopyDir: join(taskDir, "deploy-copy"),
    tmpDir: join(taskDir, "tmp"),
    homeDir: join(taskDir, "home"),
    dashscopeDir: join(taskDir, "home", ".dashscope"),
    cacheDir: join(taskDir, "cache"),
    configPath: join(taskDir, "config.yaml"),
    resultPath: join(taskDir, "result.json"),
  };
  for (const dir of [
    layout.snapshotDir,
    layout.dataDir,
    layout.deployCopyDir,
    layout.tmpDir,
    layout.dashscopeDir,
    layout.cacheDir,
  ]) {
    mkdirSync(dir, { recursive: true });
  }
  return layout;
}

/** 托管运行时安装目录：<data>/runtimes/rl/<runtime-id>/。 */
export function runtimeRoot(runtimeId: string): string {
  return join(managedRuntimesRoot(), runtimeId);
}

/** 托管运行时版本目录的根：<data>/runtimes/rl/（旧版本回收的扫描范围）。 */
export function managedRuntimesRoot(): string {
  return join(getConfigDir(), "runtimes", "rl");
}

/** 运行时下载缓存目录。 */
export function runtimeCacheRoot(): string {
  return join(getConfigDir(), "cache", "rl");
}
