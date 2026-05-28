/**
 * 压测专用：按 task_id 查询 DashScope 任务详情，补齐 stdout 中缺失的 request_id。
 * 不修改 CLI 业务代码；仅在 mergeTraceIds 仍无 requestId 时调用。
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/api/v1";

/**
 * @returns {string | undefined}
 */
function readApiKeyFromEnvOrConfig() {
  const fromEnv = process.env.DASHSCOPE_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  try {
    const configPath = join(homedir(), ".bailian", "config.json");
    const raw = JSON.parse(readFileSync(configPath, "utf8"));
    const key = raw.api_key ?? raw.apiKey ?? raw.dashscope_api_key ?? raw.dashscopeApiKey;
    return typeof key === "string" && key.trim() ? key.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * @returns {string}
 */
function resolveDashScopeBaseUrl() {
  const raw = process.env.DASHSCOPE_BASE_URL?.trim();
  if (!raw) return DEFAULT_BASE_URL;
  return raw.replace(/\/$/, "");
}

/**
 * @param {string} taskId
 * @returns {Promise<string | undefined>}
 */
export async function fetchRequestIdByTaskId(taskId) {
  const id = String(taskId ?? "").trim();
  if (!id) return undefined;

  const apiKey = readApiKeyFromEnvOrConfig();
  if (!apiKey) return undefined;

  const url = `${resolveDashScopeBaseUrl()}/tasks/${encodeURIComponent(id)}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return undefined;

    const data = await res.json();
    const rid = data?.request_id ?? data?.requestId;
    return rid != null && String(rid).trim() ? String(rid).trim() : undefined;
  } catch {
    return undefined;
  }
}
