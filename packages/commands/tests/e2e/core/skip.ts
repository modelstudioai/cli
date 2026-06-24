import { readConfigFile } from "bailian-cli-core";

/** 显式开启后才跑真实网络 E2E，避免默认 `vp test` 依赖密钥或打外网 */
export function isBailianE2EEnabled(): boolean {
  return process.env.BAILIAN_E2E === "1";
}

/** 可调 DashScope 的 API Key：环境变量优先，否则读 ~/.bailian/config.json */
export function isDashScopeE2EReady(): boolean {
  if (!isBailianE2EEnabled()) return false;
  if (process.env.DASHSCOPE_API_KEY?.trim()) return true;
  try {
    const f = readConfigFile();
    return typeof f.api_key === "string" && f.api_key.length > 0;
  } catch {
    return false;
  }
}

/** 语音与图像（可设 `BAILIAN_E2E_MEDIA=0` 在仅跑文本/记忆/知识库时跳过） */
export function isBailianE2EMediaEnabled(): boolean {
  if (process.env.BAILIAN_E2E_MEDIA === "0") return false;
  return isBailianE2EEnabled();
}

/** 文生视频 / 图生视频 / 参考视频 / 视频编辑（耗时长，默认关闭） */
export function isBailianE2EVideoEnabled(): boolean {
  return isBailianE2EEnabled() && process.env.BAILIAN_E2E_VIDEO === "1";
}

/** 知识库用例：须显式索引 ID + API-KEY 或 AK/SK */
export function isKnowledgeE2EReady(): boolean {
  if (!isBailianE2EEnabled()) return false;
  if (!process.env.BAILIAN_E2E_INDEX_ID) return false;
  const hasApiKey = isDashScopeE2EReady();
  const hasAkSk =
    !!process.env.ALIBABA_CLOUD_ACCESS_KEY_ID && !!process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;
  return hasApiKey || hasAkSk;
}

export function isKnowledgeAkSkReady(): boolean {
  return (
    isBailianE2EEnabled() &&
    !!process.env.ALIBABA_CLOUD_ACCESS_KEY_ID &&
    !!process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET &&
    !!process.env.BAILIAN_E2E_INDEX_ID
  );
}
