/** 截取日志尾部，防止撑爆缓冲与报告。 */

export function truncateLog(text, maxLen) {
  const t = String(text ?? "");
  if (t.length <= maxLen) return t;
  return `…(已截断，原长 ${t.length} 字符)\n${t.slice(-maxLen)}`;
}

/** JSON 截取用于 extractError 合并输出 */
const COMBINED_MAX = 32_768;

/**
 * 从 stdout 末尾行尝试解析单行 JSON。
 * @param {string} stdout
 */
export function extractJsonFromStdout(stdout) {
  const lines = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith(">"));

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.startsWith("{")) continue;
    try {
      return JSON.parse(line);
    } catch {
      // 继续
    }
  }

  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(stdout.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 解析 image generate / image edit JSON：urls / saved。
 * @param {string} stdout
 */
export function parseImageResult(stdout) {
  const text = stdout.trim();
  if (!text) {
    return { ok: false, error: "stdout 为空（命令可能未等到生成完成）" };
  }

  const data = extractJsonFromStdout(text);
  if (!data) {
    const paths = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith(">") && (l.startsWith("/") || l.startsWith("./")));
    if (paths.length > 0) {
      return {
        ok: true,
        data: { urls: [], saved: paths, total: paths.length },
      };
    }
    return { ok: false, error: "无法从 stdout 解析 JSON 结果" };
  }

  let saved = [];
  let urls = [];
  if (Array.isArray(data.saved)) saved = data.saved;
  else if (typeof data.saved === "string" && data.saved) saved = [data.saved];
  urls = Array.isArray(data.urls) ? data.urls : [];
  const total = typeof data.total === "number" ? data.total : saved.length || urls.length;

  if (urls.length === 0 && saved.length === 0) {
    if (data.task_ids || data.task_id) {
      const ids = data.task_ids ?? [data.task_id];
      return {
        ok: false,
        error: `仅返回 task_id，未等待生成完成: ${ids.join(", ")}。请勿使用 --no-wait，或检查 ~/.bailian/config.json 是否开启 async`,
      };
    }
    return { ok: false, error: "JSON 中无 urls / saved 字段（可能生成未完成）" };
  }

  const requestId =
    data.request_id != null && String(data.request_id).trim()
      ? String(data.request_id).trim()
      : undefined;

  return {
    ok: true,
    data: {
      saved,
      urls,
      total,
      requestId,
      taskId: data.task_id != null ? String(data.task_id) : undefined,
      taskIds: data.task_ids,
    },
  };
}

/** 从 video 类 JSON 提取 video_url / saved */
export function extractVideoFields(data) {
  const videoUrls = [];
  const saved = [];

  if (typeof data.video_url === "string" && data.video_url) {
    videoUrls.push(data.video_url);
  }
  if (typeof data.saved === "string" && data.saved) {
    saved.push(data.saved);
  }

  if (Array.isArray(data.videos)) {
    for (const item of data.videos) {
      if (item?.video_url) videoUrls.push(item.video_url);
      if (item?.saved) saved.push(item.saved);
    }
  }

  return {
    videoUrls,
    saved,
    taskId: data.task_id,
    taskIds: data.task_ids,
    size: data.size,
    total: typeof data.total === "number" ? data.total : videoUrls.length || saved.length,
  };
}

/** 解析 video generate / edit / ref 等 JSON */
export function parseVideoResult(stdout) {
  const text = stdout.trim();
  if (!text) {
    return { ok: false, error: "stdout 为空（命令可能未等到生成完成）" };
  }

  const data = extractJsonFromStdout(text);
  if (!data) {
    const paths = text
      .split("\n")
      .map((l) => l.trim())
      .filter(
        (l) =>
          l &&
          !l.startsWith(">") &&
          (l.endsWith(".mp4") || l.startsWith("/") || l.startsWith("./")),
      );
    if (paths.length > 0) {
      return {
        ok: true,
        data: {
          videoUrls: [],
          saved: paths,
          total: paths.length,
        },
      };
    }
    return { ok: false, error: "无法从 stdout 解析 JSON 结果" };
  }

  const { videoUrls, saved, taskId, taskIds, size, total } = extractVideoFields(data);

  if (videoUrls.length === 0 && saved.length === 0) {
    if (taskIds || taskId) {
      const ids = taskIds ?? [taskId];
      return {
        ok: false,
        error: `仅返回 task_id，未等待生成完成: ${ids.join(", ")}。请勿使用 --no-wait，或检查 ~/.bailian/config.json 是否开启 async`,
      };
    }
    return { ok: false, error: "JSON 中无 video_url / saved 字段（可能生成未完成）" };
  }

  const requestId =
    data.request_id != null && String(data.request_id).trim()
      ? String(data.request_id).trim()
      : undefined;

  return {
    ok: true,
    data: {
      videoUrls,
      saved,
      total,
      requestId,
      taskId: taskId != null ? String(taskId) : undefined,
      taskIds,
      size,
    },
  };
}

/** 解析 text chat JSON */
export function parseTextChatResult(stdout) {
  const text = stdout.trim();
  if (!text) {
    return { ok: false, error: "stdout 为空" };
  }

  const data = extractJsonFromStdout(text);
  if (!data) {
    if (text.length > 0 && !text.startsWith("{")) {
      return {
        ok: true,
        data: { replyTextPreview: truncateLog(text, 500), plainText: text },
      };
    }
    return { ok: false, error: "无法解析 text chat JSON" };
  }

  const msg = data?.choices?.[0]?.message?.content;
  const fallback = typeof data.content === "string" ? data.content : "";
  const content =
    typeof msg === "string" ? msg : Array.isArray(msg) ? JSON.stringify(msg) : fallback || "";

  if (!content.trim()) {
    return { ok: false, error: "JSON 中无有效正文 content" };
  }

  const requestId =
    data.request_id != null && String(data.request_id).trim()
      ? String(data.request_id).trim()
      : undefined;

  return {
    ok: true,
    data: {
      replyTextPreview: truncateLog(content.trim(), 2000),
      requestId,
    },
  };
}

/** TTS synthesize JSON */
export function parseSpeechSynthesizeResult(stdout) {
  const text = stdout.trim();
  if (!text) {
    return { ok: false, error: "stdout 为空" };
  }

  const data = extractJsonFromStdout(text);
  if (!data) {
    return { ok: false, error: "无法解析 speech synthesize JSON" };
  }

  const urls = [];
  if (typeof data.audio_url === "string" && data.audio_url) urls.push(data.audio_url);
  if (Array.isArray(data.audio_urls)) {
    urls.push(...data.audio_urls.filter((u) => typeof u === "string"));
  }

  let saved = [];
  if (typeof data.saved === "string" && data.saved) saved = [data.saved];
  if (Array.isArray(data.saved)) saved = data.saved;

  if (urls.length === 0 && saved.length === 0) {
    return { ok: false, error: "JSON 中无 audio_url / saved" };
  }

  const requestId =
    data.request_id != null && String(data.request_id).trim()
      ? String(data.request_id).trim()
      : undefined;

  return { ok: true, data: { audioUrls: urls, saved, audioUrl: urls[0], requestId } };
}

/** 判断 ASR `--out` 文件是否含有效识别结果 */

export function parseAsrOutFile(readText) {
  try {
    const data = JSON.parse(readText);

    /** @param {*} d */
    const hasTranscripts = (d) => {
      const t = d?.transcripts;
      if (!Array.isArray(t) || t.length === 0) return false;
      for (const tr of t) {
        if (typeof tr?.text === "string" && tr.text.trim()) return true;
        if (Array.isArray(tr?.sentences) && tr.sentences.some((s) => s?.text?.trim())) return true;
      }
      return false;
    };

    if (Array.isArray(data)) {
      for (const item of data) {
        if (hasTranscripts(item)) return { ok: true };
      }
    } else if (hasTranscripts(data)) {
      return { ok: true };
    }

    return { ok: false, error: "--out JSON 未包含 transcripts 文本" };
  } catch (e) {
    return {
      ok: false,
      error: `--out JSON 解析失败: ${/** @type {Error} */ (e).message}`,
    };
  }
}

/** 汇总 stdout：非空且无 Bailian Error 前缀 */
export function parseAsrStdoutOnly(stdout) {
  const trimmed = stdout.replace(/^\[=+.*$/gm, "").trim();
  return trimmed.length > 0 ? { ok: true, data: { preview: truncateLog(trimmed, 500) } } : null;
}

/**
 * @param {string} text
 */
export function tryParseJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** @param {object | null} obj */
export function formatApiErrorPayload(obj) {
  if (!obj || typeof obj !== "object") return null;
  const e = obj.error ?? obj;
  if (!e || typeof e !== "object") return null;
  const parts = [];
  if (e.code != null) parts.push(`[code ${e.code}]`);
  if (e.message) parts.push(String(e.message));
  if (e.hint) parts.push(`hint: ${e.hint}`);
  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * @param {string} stderr
 * @param {string} stdout
 * @param {number | undefined} exitCode
 */
export function extractError(stderr, stdout, exitCode) {
  const combined = truncateLog(`${stderr}\n${stdout}`.trim(), COMBINED_MAX);
  if (!combined) {
    return exitCode != null && exitCode !== 0
      ? `进程退出码 ${exitCode}，无 stderr/stdout 输出`
      : "未知错误（无 stderr/stdout）";
  }

  const parsed = tryParseJsonObject(combined);
  const apiMsg = formatApiErrorPayload(parsed);
  if (apiMsg) return apiMsg.slice(0, 2000);

  const jsonBlocks = combined.match(/\{[\s\S]*?\}/g);
  if (jsonBlocks) {
    const start = Math.max(0, jsonBlocks.length - 8);
    for (let i = jsonBlocks.length - 1; i >= start; i--) {
      try {
        const o = JSON.parse(jsonBlocks[i]);
        const msg = formatApiErrorPayload(o);
        if (msg) return msg.slice(0, 2000);
      } catch {
        // ignore
      }
    }
  }

  const lines = combined
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("[Model:"));

  const bailianLine = lines.find((l) => /BailianError|^\s*Error:/i.test(l));
  if (bailianLine) return bailianLine.slice(0, 2000);

  const meaningful = lines.filter(
    (l) => l !== '"error": {' && l !== "{" && l !== "}" && !/^"[^"]+": \{?$/.test(l),
  );
  if (meaningful.length > 0) {
    return meaningful.slice(-4).join(" | ").slice(0, 2000);
  }

  return exitCode != null && exitCode !== 0 ? `进程退出码 ${exitCode}` : combined.slice(0, 2000);
}

/** 限流类失败判定 */
export function isRateLimitFailure(result, extractFn) {
  if (result.exitCode === 4) return true;
  const extract = extractFn ?? extractError;
  const msg = result.error ?? extract(result.stderr ?? "", result.stdout ?? "", result.exitCode);
  return /rate limit|quota exceeded|限流|频率|too many requests/i.test(msg);
}

/** 写入 results.json 前精简单条结果。 */
export function sanitizeResultForExport(r) {
  const { raw: _raw, ...rest } = r;
  return {
    ...rest,
    stdout: r.stdout ? truncateLog(r.stdout, 2048) : undefined,
    stderr: r.stderr ? truncateLog(r.stderr, 2048) : undefined,
  };
}
