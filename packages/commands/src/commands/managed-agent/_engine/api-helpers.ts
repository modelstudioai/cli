import type { CommandContext, FlagsDef } from "bailian-cli-core";
import { formatTable } from "bailian-cli-runtime";
import type { PagedResult } from "./pagination.ts";

export const API_TARGET_FLAGS = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Config file path (default: agents.yaml)",
      "zh-CN": "配置文件路径（默认：agents.yaml）",
    },
  },
} satisfies FlagsDef;

export const CURSOR_FLAGS = {
  limit: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Page size (1-100)",
      "zh-CN": "单页数量（1-100）",
    },
  },
  page: {
    type: "string",
    valueHint: "<cursor>",
    description: {
      "en-US": "Opaque page cursor returned by a previous request",
      "zh-CN": "上一次请求返回的不透明分页 Cursor",
    },
  },
  all: {
    type: "switch",
    description: {
      "en-US": "Fetch all pages by following opaque cursors",
      "zh-CN": "跟随不透明 Cursor 获取全部分页",
    },
  },
} satisfies FlagsDef;

export const SEARCH_FLAGS = {
  query: {
    type: "string",
    valueHint: "<text>",
    required: true,
    description: {
      "en-US": "Case-insensitive text to find in IDs, names, and descriptions",
      "zh-CN": "在 ID、名称和描述中进行不区分大小写的文本搜索",
    },
  },
  pageLimit: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Maximum pages to scan for client-side search (default: 10)",
      "zh-CN": "客户端搜索最多扫描的页数（默认：10）",
    },
  },
} satisfies FlagsDef;

export const INCLUDE_ARCHIVED_FLAG = {
  includeArchived: {
    type: "switch",
    description: {
      "en-US": "Include archived resources",
      "zh-CN": "包含已归档资源",
    },
  },
} satisfies FlagsDef;

export function validateLimitAndPageLimit(flags: {
  limit?: number;
  pageLimit?: number;
}): string | undefined {
  if (
    flags.limit !== undefined &&
    (!Number.isInteger(flags.limit) || flags.limit < 1 || flags.limit > 100)
  ) {
    return "--limit must be an integer between 1 and 100.";
  }
  if (
    flags.pageLimit !== undefined &&
    (!Number.isInteger(flags.pageLimit) || flags.pageLimit < 1 || flags.pageLimit > 100)
  ) {
    return "--page-limit must be an integer between 1 and 100.";
  }
  return undefined;
}

export function splitCommaSeparated(value?: string): string[] | undefined {
  if (!value) return undefined;
  const values = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

export function matchesQuery(query: string, ...values: unknown[]): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return values.some((value) => {
    if (value === undefined || value === null) return false;
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.toLocaleLowerCase().includes(normalized);
  });
}

export interface SearchResult<T> extends PagedResult<T> {
  scannedPages: number;
  truncated: boolean;
}

export async function searchCursorPages<T>(
  fetchPage: (page?: string) => Promise<PagedResult<T>>,
  matches: (item: T) => boolean,
  pageLimit = 10,
): Promise<SearchResult<T>> {
  const items: T[] = [];
  let page: string | undefined;
  let hasMore = false;
  let nextPage: string | undefined;
  let scannedPages = 0;

  do {
    const result = await fetchPage(page);
    scannedPages += 1;
    items.push(...result.items.filter(matches));
    hasMore = result.hasMore;
    nextPage = result.nextPage;
    page = result.nextPage;
  } while (hasMore && page && scannedPages < pageLimit);

  return {
    items,
    hasMore,
    nextPage,
    scannedPages,
    truncated: Boolean(hasMore && nextPage),
  };
}

export function emitCollection<T>(
  ctx: Pick<CommandContext, "output" | "localize">,
  options: {
    key: string;
    items: T[];
    headers: string[];
    rows: string[][];
    hasMore?: boolean;
    nextPage?: string;
    truncated?: boolean;
    scannedPages?: number;
    emptyMessage?: string;
  },
): void {
  const {
    key,
    items,
    headers,
    rows,
    hasMore = false,
    nextPage,
    truncated,
    scannedPages,
    emptyMessage = ctx.localize({ "en-US": "No resources found.", "zh-CN": "没有找到资源。" }),
  } = options;
  const data = {
    [key]: items,
    has_more: hasMore,
    next_page: nextPage,
    ...(truncated === undefined ? {} : { truncated }),
    ...(scannedPages === undefined ? {} : { scanned_pages: scannedPages }),
  };
  const lines =
    items.length === 0
      ? [emptyMessage]
      : [
          ...formatTable(headers, rows),
          ctx.localize({ "en-US": `\nTotal: ${items.length}`, "zh-CN": `\n总计：${items.length}` }),
          ...(truncated
            ? [
                ctx.localize({
                  "en-US": "Search stopped at --page-limit; more pages remain.",
                  "zh-CN": "搜索已在 --page-limit 处停止，仍有更多分页。",
                }),
              ]
            : hasMore
              ? [
                  ctx.localize({
                    "en-US": `More results are available.${nextPage ? ` Next page: ${nextPage}` : ""}`,
                    "zh-CN": `还有更多结果。${nextPage ? ` 下一页：${nextPage}` : ""}`,
                  }),
                ]
              : []),
        ];
  ctx.output.result(data, { text: lines.join("\n") });
}

export function displayValue(value: unknown, maxLength = 40): string {
  if (value === undefined || value === null || value === "") return "-";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}
