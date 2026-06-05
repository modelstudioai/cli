import { appendFileSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import { getConfigDir, ensureConfigDir } from "../config/paths.ts";
import { buildRemoteAemOptions, type TrackingEvent } from "./event.ts";
import { detectEnv } from "./env.ts";
import Tracker from "../../lib/remote-telemetry/tracker.js";
import EventPlugin from "../../lib/remote-telemetry/event-plugin.js";

const TELEMETRY_FILE = () => join(getConfigDir(), "telemetry.jsonl");

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

let remoteSendEvent: ((name: string, opts: Record<string, unknown>) => void) | undefined;

// 追踪在途（in-flight）的远端发送请求，以便在进程退出前等待它们完成。
// 底层 tracker 是 fire-and-forget 模式（发起 fetch 后不再持有 promise）；
// 如果不追踪，CLI 在短命令或 SIGINT 场景下会在请求真正落网络前就退出。
// 配合 tracker.js 中的 `keepalive: true`，await 这些 promise 可以在不阻塞
// 主流程的前提下，尽最大努力把埋点送达。
const inflightSends = new Set<Promise<unknown>>();
let remoteClient: any = undefined;

try {
  // env 传给 Tracker 顶层 config 后会进 URL 查询参数, AEM 后台 "环境" 列
  // (原始字段 env) 直接读它, 值域 prod/pre/daily/dev。我们目前只用 prod/dev。
  const client = new Tracker({ pid: "bailian-cli-node", env: detectEnv() });
  // 仅对当前实例的 `send` 做猴补丁，把每次 fetch 的 promise 收集起来。
  // 不修改 prototype，避免污染其他可能存在的 Tracker 使用方。
  const originalSend = client.send.bind(client);
  client.send = function (payload: string) {
    const result = originalSend(payload);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      const p = result as Promise<unknown>;
      inflightSends.add(p);
      void p.finally(() => inflightSends.delete(p));
    }
    return result;
  };
  remoteClient = client;
  remoteSendEvent = client.use(EventPlugin);
} catch {
  // 埋点逻辑任何异常都不能影响 CLI 主流程
}

/**
 * 尽力等待所有在途的埋点发送完成（best-effort）。
 *
 * 1. 先调用 `_sendAll` 排空 tracker 内部的去抖队列，把还卡在 500ms 合并窗口里
 *    的事件立刻推上网络。
 * 2. 然后用硬超时 race 所有已追踪的 fetch promise。
 *
 * 埋点永远不应阻塞 CLI：调用方应传入较短的超时（例如 1000ms），并始终与超时
 * race。错误与超时一律静默吞掉。
 */
export async function flushTelemetry(timeoutMs = 1000): Promise<void> {
  try {
    if (remoteClient) {
      try {
        // 排空去抖队列：把卡在 500ms 合并窗口里的事件立刻发出去
        // （每次发出都会被追加到 inflightSends 里）。
        if (typeof remoteClient._sendAll === "function") {
          remoteClient._sendAll();
        }
      } catch {
        // flush 自身绝不抛出
      }
    }
    if (inflightSends.size === 0) return;
    const pending = [...inflightSends].map((p) => p.catch(() => undefined));
    await Promise.race([
      Promise.allSettled(pending),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs).unref?.()),
    ]);
  } catch {
    // 埋点逻辑任何异常都不能影响 CLI 主流程
  }
}

export async function localSink(event: TrackingEvent): Promise<void> {
  try {
    await ensureConfigDir();
    const path = TELEMETRY_FILE();

    try {
      const stat = statSync(path);
      if (stat.size > MAX_FILE_SIZE) {
        unlinkSync(path);
      }
    } catch {
      // 文件还不存在，忽略
    }

    appendFileSync(path, JSON.stringify(event) + "\n", { mode: 0o600 });
  } catch {
    // 埋点逻辑任何异常都不能影响 CLI 主流程
  }
}

export async function remoteSink(event: TrackingEvent): Promise<void> {
  try {
    if (!remoteSendEvent) return;
    remoteSendEvent(event.command, buildRemoteAemOptions(event));
  } catch {
    // 埋点逻辑任何异常都不能影响 CLI 主流程
  }
}
