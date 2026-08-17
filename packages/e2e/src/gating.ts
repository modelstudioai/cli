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

/** Knowledge admin commands (kb/doc/chunk/service/category/file) E2E readiness */
export function isKbAdminE2EReady(): boolean {
  if (!isDashScopeE2EReady()) return false;
  return !!process.env.BAILIAN_WORKSPACE_ID?.trim();
}

/** connector has no delete API, so live artifacts cannot be cleaned up — only enable explicitly for a full manual regression */
export function isConnectorE2EReady(): boolean {
  return isKbAdminE2EReady() && process.env.BAILIAN_E2E_CONNECTOR === "1";
}

// ---- Long-lived knowledge fixtures (created manually in the console; the CLI
// cannot create table/image-type bases or multimodal services itself) ----

/** 表格型知识库 fixture（chunk --field live 闭环） */
export function isTableKbE2EReady(): boolean {
  return isKbAdminE2EReady() && !!process.env.BAILIAN_E2E_TABLE_INDEX_ID?.trim();
}

/** 图片型知识库 fixture（图片 chunk 回读） */
export function isImageKbE2EReady(): boolean {
  return isKbAdminE2EReady() && !!process.env.BAILIAN_E2E_IMAGE_INDEX_ID?.trim();
}

/** 多模态检索服务 fixture（search --image live） */
export function isMultimodalSearchE2EReady(): boolean {
  return isKbAdminE2EReady() && !!process.env.BAILIAN_E2E_IMAGE_SEARCH_AGENT_ID?.trim();
}

/** 多模态问答服务 fixture（chat --image live） */
export function isMultimodalChatE2EReady(): boolean {
  return isKbAdminE2EReady() && !!process.env.BAILIAN_E2E_IMAGE_CHAT_AGENT_ID?.trim();
}

/** 表格库检索服务 fixture（表格行召回 live） */
export function isTableSearchE2EReady(): boolean {
  return isKbAdminE2EReady() && !!process.env.BAILIAN_E2E_TABLE_SEARCH_AGENT_ID?.trim();
}

/** 已授权 OSS bucket fixture（doc import-oss live；需提前在 RAM 授权并放好固定测试文件） */
export function isOssImportE2EReady(): boolean {
  return (
    isKbAdminE2EReady() &&
    !!process.env.BAILIAN_E2E_OSS_BUCKET?.trim() &&
    !!process.env.BAILIAN_E2E_OSS_REGION?.trim() &&
    !!process.env.BAILIAN_E2E_OSS_KEY?.trim()
  );
}
