import type { Client } from "../client/client.ts";
import { unwrapConsoleResponse } from "../console/response.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

export const CONSOLE_FILE_URL_API = "zeldaEasy.bmp.ossRpcService.download";

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return false;
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

export async function getConsoleFileUrl(
  client: Pick<Client, "console">,
  fileKey: string,
): Promise<Record<string, unknown> & { url: string }> {
  const raw = await client.console<unknown>(CONSOLE_FILE_URL_API, { fileKey });
  const result = unwrapConsoleResponse(raw);
  if (
    result === null ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    !("url" in result) ||
    !isHttpUrl(result.url)
  ) {
    throw new BailianError(
      "Console file URL response must be an object with a valid HTTP(S) URL. / Console 文件地址响应必须是包含有效 HTTP(S) URL 的对象。",
      ExitCode.GENERAL,
    );
  }
  return result as Record<string, unknown> & { url: string };
}
