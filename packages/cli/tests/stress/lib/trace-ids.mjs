/**
 * 从 API JSON / CLI 日志提取 requestId、taskId，供压测报告排查。
 */
import { extractJsonFromStdout } from "./parsers.mjs";
import { fetchRequestIdByTaskId } from "./fetch-request-id.mjs";

/**
 * @param {unknown} data
 */
export function extractTraceIdsFromJson(data) {
  if (!data || typeof data !== "object") return {};

  /** @type {Record<string, unknown>} */
  const obj = /** @type {Record<string, unknown>} */ (data);
  /** @type {Record<string, unknown> | undefined} */
  const err =
    obj.error && typeof obj.error === "object"
      ? /** @type {Record<string, unknown>} */ (obj.error)
      : undefined;

  const requestIdRaw = obj.request_id ?? obj.requestId ?? err?.request_id ?? err?.requestId;
  const requestId =
    requestIdRaw != null && String(requestIdRaw).trim() ? String(requestIdRaw).trim() : undefined;

  const taskId = formatTaskIdFromJson(obj);
  return { requestId, taskId };
}

/**
 * @param {Record<string, unknown>} data
 */
function formatTaskIdFromJson(data) {
  if (data.task_id != null && String(data.task_id).trim()) {
    return String(data.task_id).trim();
  }
  if (data.task_ids != null) {
    return formatTaskIdsValue(data.task_ids);
  }
  if (Array.isArray(data.videos)) {
    const ids = data.videos
      .map((v) =>
        v && typeof v === "object" ? /** @type {{ task_id?: unknown }} */ (v).task_id : null,
      )
      .filter((id) => id != null && String(id).trim())
      .map((id) => String(id).trim());
    if (ids.length > 0) return [...new Set(ids)].join(", ");
  }
  if (Array.isArray(data.images)) {
    const ids = data.images
      .map((v) =>
        v && typeof v === "object" ? /** @type {{ task_id?: unknown }} */ (v).task_id : null,
      )
      .filter((id) => id != null && String(id).trim())
      .map((id) => String(id).trim());
    if (ids.length > 0) return [...new Set(ids)].join(", ");
  }
  return undefined;
}

/**
 * @param {unknown} value
 */
function formatTaskIdsValue(value) {
  if (Array.isArray(value)) {
    const ids = value.map((v) => String(v).trim()).filter(Boolean);
    return ids.length > 0 ? ids.join(", ") : undefined;
  }
  if (value != null && String(value).trim()) return String(value).trim();
  return undefined;
}

/**
 * 从文本中收集所有 request_id（stderr verbose、错误块、嵌入 JSON）。
 * @param {string} text
 */
export function collectRequestIdsFromText(text) {
  const combined = String(text ?? "");
  /** @type {string[]} */
  const ids = [];

  const patterns = [
    /(?:Request\s+ID|request_id)\s*:\s*([^\s\n\r]+)/gi,
    /"request_id"\s*:\s*"([^"]+)"/gi,
  ];

  for (const re of patterns) {
    let m;
    while ((m = re.exec(combined)) !== null) {
      const id = m[1].trim();
      if (id && !ids.includes(id)) ids.push(id);
    }
  }

  return ids;
}

/**
 * 从文本中收集 task_id。
 * @param {string} text
 */
export function collectTaskIdsFromText(text) {
  const combined = String(text ?? "");
  /** @type {string[]} */
  const ids = [];

  const patterns = [/"task_id"\s*:\s*"([^"]+)"/gi, /task_id["\s:]+([a-zA-Z0-9_-]+)/gi];

  for (const re of patterns) {
    let m;
    while ((m = re.exec(combined)) !== null) {
      const id = m[1].trim();
      if (id && !ids.includes(id)) ids.push(id);
    }
  }

  return ids;
}

/**
 * 增量合并日志片段中的 trace id（避免 stderr 尾部截断丢掉早期的 request_id）。
 * @param {string} chunk
 * @param {{ requestId?: string, taskId?: string }} [prev]
 */
export function captureTraceIdsFromText(chunk, prev = {}) {
  const text = String(chunk ?? "");
  const reqIds = collectRequestIdsFromText(text);
  const taskIds = collectTaskIdsFromText(text);

  return {
    requestId: reqIds.length > 0 ? reqIds[reqIds.length - 1] : prev.requestId,
    taskId: taskIds.length > 0 ? taskIds[taskIds.length - 1] : prev.taskId,
  };
}

/**
 * 扫描文本中所有 JSON 块，取最后一个 request_id（更接近最终请求）。
 * @param {string} text
 */
export function extractLastRequestIdFromAllJson(text) {
  const combined = String(text ?? "");
  let last;

  const re = /"request_id"\s*:\s*"([^"]+)"/gi;
  let m;
  while ((m = re.exec(combined)) !== null) {
    const id = m[1].trim();
    if (id) last = id;
  }

  const blocks = combined.match(/\{[\s\S]*?\}/g);
  if (blocks) {
    for (const block of blocks) {
      try {
        const o = JSON.parse(block);
        const { requestId } = extractTraceIdsFromJson(o);
        if (requestId) last = requestId;
      } catch {
        // ignore
      }
    }
  }

  return last;
}

/**
 * @param {string} stdout
 * @param {string} stderr
 */
export function extractTraceIdsFromLogs(stdout, stderr) {
  const combined = `${stdout ?? ""}\n${stderr ?? ""}`;
  const reqIds = collectRequestIdsFromText(combined);
  const taskIds = collectTaskIdsFromText(combined);

  const requestId =
    (reqIds.length > 0 ? reqIds[reqIds.length - 1] : undefined) ??
    extractLastRequestIdFromAllJson(combined);

  const taskId = taskIds.length > 0 ? taskIds[taskIds.length - 1] : undefined;

  return { requestId, taskId };
}

/**
 * 合并到单条压测结果（同步部分）。
 * @param {Record<string, unknown>} result
 */
export function mergeTraceIds(result) {
  const stdout = String(result.stdout ?? "");
  const stderr = String(result.stderr ?? "");
  const errorText = String(result.error ?? "");
  const combined = `${stdout}\n${stderr}\n${errorText}`;

  const data = extractJsonFromStdout(stdout);
  const fromJson = extractTraceIdsFromJson(data);
  const fromAllJson = extractLastRequestIdFromAllJson(combined);
  const fromLogs = extractTraceIdsFromLogs(stdout, stderr);
  const fromError = extractTraceIdsFromLogs(errorText, "");
  const fromStream = {
    requestId: result.streamRequestId,
    taskId: result.streamTaskId,
  };

  const taskIdsArr = Array.isArray(result.taskIds) ? result.taskIds : undefined;
  const existingTask =
    result.taskId ?? (taskIdsArr?.length ? taskIdsArr.map(String).join(", ") : undefined);

  const { streamRequestId: _s1, streamTaskId: _s2, ...rest } = result;

  return {
    ...rest,
    requestId:
      result.requestId ??
      fromStream.requestId ??
      fromJson.requestId ??
      fromAllJson ??
      fromLogs.requestId ??
      fromError.requestId,
    taskId:
      existingTask ?? fromStream.taskId ?? fromJson.taskId ?? fromLogs.taskId ?? fromError.taskId,
  };
}

/**
 * 异步补齐 requestId（任务查询 API）；不修改 CLI。
 * @param {Record<string, unknown>} result
 */
export async function enrichTraceIdsAsync(result) {
  let merged = mergeTraceIds(result);

  if (merged.requestId) return merged;

  const taskId = merged.taskId ? String(merged.taskId).split(",")[0].trim() : "";
  if (!taskId) return merged;

  if (process.env.STRESS_FETCH_REQUEST_ID === "0") return merged;

  const fromTask = await fetchRequestIdByTaskId(taskId);
  if (fromTask) {
    merged = { ...merged, requestId: fromTask };
  }

  return merged;
}
