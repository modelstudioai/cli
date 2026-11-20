export const endpointFlag = {
  type: "string",
  valueHint: "<url>",
  description: {
    "en-US":
      "MCP endpoint that receives the API key. Try Streamable HTTP first, then classic SSE at the same URL if initialization returns HTTP 404 or 405.",
    "zh-CN":
      "指定接收 API Key 的 MCP 端点。先尝试 Streamable HTTP，初始化返回 HTTP 404 或 405 时在同一 URL 上尝试传统 SSE。",
  },
} as const;

export function validateEndpoint(url?: string) {
  if (
    url !== undefined &&
    (!URL.canParse(url) || !["https:", "http:"].includes(new URL(url).protocol))
  ) {
    return {
      "en-US": "--url must be an absolute HTTP or HTTPS MCP endpoint.",
      "zh-CN": "--url 须为 HTTP 或 HTTPS 的 MCP 端点绝对地址。",
    };
  }
}
