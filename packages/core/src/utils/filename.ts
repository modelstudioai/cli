/**
 * 生成文件名前缀
 * @param prefix prompt的前10个字符
 * @param suffix timestamp
 * @returns
 */
function sanitizeFilenamePart(input: string, fallback: string): string {
  const normalized = input
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || fallback;
}

export function generateFilename(prefix: string, prompt: string): string {
  const safePrefix = sanitizeFilenamePart(prefix || "image", "image");
  const promptPart = sanitizeFilenamePart((prompt || "").substring(0, 20), "untitled");
  return `${safePrefix}_${promptPart}_${Date.now()}`;
}
