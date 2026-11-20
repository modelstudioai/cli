import { WORKSPACE_FLAG } from "../shared/workspace.ts";
import { defineSkillCommand } from "./update-check.ts";
import { readCatalogInstalls, skillsPath } from "bailian-cli-core";
import {
  describeSkill,
  invalidCatalogResponse,
  requestCatalog,
  type CatalogSkill,
} from "./catalog.ts";

interface CatalogPage {
  items: CatalogSkill[];
  total: number;
  page_no: number;
  page_size: number;
}

const defaultPageSize = 30;
const maxWindow = 10_000;

export default defineSkillCommand({
  localDryRun: true,
  description: {
    "en-US": "Search cloud skills and show their local installations",
    "zh-CN": "搜索云端 Skill 并查看本地安装情况",
  },
  auth: "apiKey",
  defaultOutput: "json",
  usageArgs:
    "[--keyword <text>] [--type official|private] [--page <n>] [--page-size <n>] [--limit <n>]",
  flags: {
    ...WORKSPACE_FLAG,
    keyword: {
      type: "string",
      valueHint: "<text>",
      description: {
        "en-US": "Search skill names and descriptions",
        "zh-CN": "检索 Skill 名称和描述",
      },
    },
    type: {
      type: "string",
      valueHint: "<official|private>",
      description: {
        "en-US": "Filter by source (default: both, case-insensitive)",
        "zh-CN": "按来源筛选（默认同时查询两类，不区分大小写）",
      },
    },
    page: {
      type: "number",
      valueHint: "<n>",
      description: { "en-US": "Starting page (default 1)", "zh-CN": "起始页码（默认 1）" },
    },
    pageSize: {
      type: "number",
      valueHint: "<n>",
      description: {
        "en-US": "Results per request (1–100, default 30)",
        "zh-CN": "每次请求的条数（1～100，默认 30）",
      },
    },
    limit: {
      type: "number",
      valueHint: "<n>",
      description: {
        "en-US": "Maximum results across pages (default one page)",
        "zh-CN": "跨页累计返回的最大条数（默认一页）",
      },
    },
  },
  notes: [
    {
      "en-US":
        "Search uses the cloud catalog and a Bailian API key. page_start and page_end identify the requested pages within the API's 10000-record window. installations lists managed, missing and untracked locations.",
      "zh-CN":
        "使用百炼 API Key 查询云端目录。page_start 和 page_end 表示在接口一万条窗口内实际请求的起止页。installations 列出托管、缺失和未托管的安装位置。",
    },
  ],
  exampleArgs: ["--keyword pdf --type official", "--page 2 --page-size 10 --limit 25"],
  validate({ type, page = 1, pageSize = defaultPageSize, limit = pageSize }) {
    if (type !== undefined && !["official", "private"].includes(type.toLowerCase()))
      return {
        "en-US": "--type must be official or private.",
        "zh-CN": "--type 须为 official 或 private。",
      };
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100 ||
      page * pageSize > maxWindow
    )
      return {
        "en-US":
          "--page must be a positive integer, --page-size an integer from 1 to 100, and their product at most 10000.",
        "zh-CN": "--page 须为正整数，--page-size 须为 1～100 的整数，两者乘积不能超过 10000。",
      };
    if (!Number.isSafeInteger(limit) || limit < 1)
      return { "en-US": "--limit must be a positive integer.", "zh-CN": "--limit 须为正整数。" };
  },
  async run(ctx) {
    const { page = 1, pageSize = defaultPageSize, limit = pageSize } = ctx.flags;
    const query = new URLSearchParams({ pageNo: String(page), pageSize: String(pageSize) });
    const keyword = ctx.flags.keyword?.trim();
    if (keyword) query.set("keywords", keyword);
    if (ctx.flags.type)
      query.set("type", ctx.flags.type.toLowerCase() === "official" ? "OFFICIAL" : "CUSTOMER");
    const path = skillsPath();
    if (ctx.settings.dryRun) {
      ctx.output.result({ method: "GET", path: `${path}?${query.toString()}`, limit });
      return;
    }

    const local = readCatalogInstalls(ctx.client.baseUrl);
    const skills = [];
    let pageEnd = page;
    let total: number;
    for (;;) {
      query.set("pageNo", String(pageEnd));
      const { data, request_id } = await requestCatalog<CatalogPage>(
        ctx,
        `${path}?${query.toString()}`,
      );
      if (
        data.page_no !== pageEnd ||
        data.page_size !== pageSize ||
        !Number.isSafeInteger(data.total) ||
        data.total < 0 ||
        !Array.isArray(data.items) ||
        data.items.length > pageSize
      )
        invalidCatalogResponse(ctx, request_id);
      total = data.total;
      for (const item of data.items.slice(0, limit - skills.length)) {
        const skill = describeSkill(ctx, item, request_id);
        skills.push({ ...skill, ...local.inspect(skill.skill_code, skill.latest_version) });
      }
      if (
        ctx.flags.limit === undefined ||
        skills.length >= limit ||
        data.items.length === 0 ||
        pageEnd * pageSize >= total ||
        (pageEnd + 1) * pageSize > maxWindow
      )
        break;
      pageEnd++;
    }
    ctx.output.result({ skills, total, page_start: page, page_end: pageEnd, page_size: pageSize });
  },
});
