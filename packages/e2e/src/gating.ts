import { buildSources } from "bailian-cli-core";

/** 显式开启后才跑真实网络 E2E */
export function isBailianE2EEnabled(): boolean {
  return process.env.BAILIAN_E2E === "1";
}

/** 可调 DashScope 的 API Key：环境变量优先，否则读 ~/.bailian/config.json */
export function isDashScopeE2EReady(): boolean {
  if (!isBailianE2EEnabled()) return false;
  if (process.env.DASHSCOPE_API_KEY?.trim()) return true;
  try {
    const config = buildSources({}).file;
    return typeof config.api_key === "string" && config.api_key.length > 0;
  } catch {
    return false;
  }
}

/** Console-gateway 命令 E2E 就绪检查 */
export function isConsoleE2EReady(): boolean {
  if (!isBailianE2EEnabled()) return false;
  try {
    const config = buildSources({}).file;
    return typeof config.access_token === "string" && config.access_token.length > 0;
  } catch {
    return false;
  }
}

/** OpenAPI AK/SK 真实 E2E 就绪检查：只使用 `.env` / 进程环境中的完整凭证对。 */
export function isOpenApiE2EReady(): boolean {
  if (!isBailianE2EEnabled()) return false;
  return Boolean(
    process.env.ALIBABA_CLOUD_ACCESS_KEY_ID?.trim() &&
    process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET?.trim(),
  );
}

/** 语音与图像（可设 `BAILIAN_E2E_MEDIA=0` 跳过） */
export function isBailianE2EMediaEnabled(): boolean {
  if (process.env.BAILIAN_E2E_MEDIA === "0") return false;
  return isBailianE2EEnabled();
}

/** 文生视频 / 图生视频等（耗时长，默认关闭） */
export function isBailianE2EVideoEnabled(): boolean {
  return isBailianE2EEnabled() && process.env.BAILIAN_E2E_VIDEO === "1";
}

/** 知识检索 E2E 就绪 */
export function isSearchE2EReady(): boolean {
  if (!isDashScopeE2EReady()) return false;
  return (
    !!process.env.BAILIAN_E2E_SEARCH_AGENT_ID?.trim() && !!process.env.BAILIAN_WORKSPACE_ID?.trim()
  );
}

/** 知识问答 E2E 就绪 */
export function isChatE2EReady(): boolean {
  if (!isDashScopeE2EReady()) return false;
  return (
    !!process.env.BAILIAN_E2E_CHAT_AGENT_ID?.trim() && !!process.env.BAILIAN_WORKSPACE_ID?.trim()
  );
}
