/**
 * Bailian feature registry — single source of truth mapping a welcome-page
 * card to a **bailian-cli command**. The console-API knowledge lives in
 * bailian-cli (packages/commands); this bundle only shells out to `bl`, so a
 * feature added there is reusable here for free.
 *
 * Each entry is exposed two ways by the Host:
 * 1. a **model tool** `bailian_<id>` (natural-language entry: the LLM reads
 *    `intent` and calls the tool when the user asks in plain language);
 * 2. the **generic route** `POST /bailian/console { featureId }` (card-click
 *    entry: the client renders `summarize`/`data`).
 *
 * Adding a feature = (a) add a `bl` command in bailian-cli, (b) add one record
 * here. Tool + card come for free.
 *
 * Browser-safe (no node imports) so both the vite host build and the esbuild
 * client bundle can import it.
 *
 * @module bailian-cli-dsh/features
 */

export interface BailianFeature {
  /** Stable id; tool name is `bailian_<id>`. */
  id: string;
  /** Card title (matched against welcome cards). */
  title: string;
  /** Card description. */
  desc: string;
  /** Tool description: tells the LLM which user utterances should use it. */
  intent: string;
  /** `bl` command args (without `--output`); the Host appends `--output json`. */
  argv: string[];
  /** Args appended when the user supplies no params (e.g. ["--all"]). */
  defaultArgs?: string[];
  /** Optional params the LLM (or UI) may supply; mapped to bl flags. */
  paramFlags?: FeatureParam[];
  /** Human/LLM summary of the command's JSON output. */
  summarize: (data: any) => string;
}

export interface FeatureParam {
  /** Tool parameter name (LLM fills it). */
  name: string;
  /** bl flag it maps to (e.g. --model). */
  flag: string;
  type: "string" | "number" | "boolean";
  description: string;
}

function pick(obj: any, ...keys: string[]): any {
  for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
}
function pct(v: any): string {
  if (v === undefined || v === null) return "—";
  const n = (typeof v === "number" ? v : Number(v)) * 100;
  return (isNaN(n) ? 0 : n).toFixed(1) + "%";
}

export const FEATURES: BailianFeature[] = [
  {
    id: "free-tier",
    title: "免费额度一键防护",
    desc: "查询免费额度用量，一键开启「用完即停」，额度耗尽自动停止调用，不再产生意外扣费",
    intent:
      "查询百炼免费额度用量与『用完即停』防护状态。当用户提到免费额度、额度耗尽、意外扣费、用完即停、额度防护时使用。",
    argv: ["usage", "freetier"],
    defaultArgs: ["--all"],
    paramFlags: [
      {
        name: "models",
        flag: "--model",
        type: "string",
        description:
          "逗号分隔的模型列表；不填则查询全部（--all）。若用户只关心特定模型且未说明，可先用 AskUserQuestion 询问。",
      },
    ],
    summarize: (d) => {
      if (!d || typeof d !== "object") return "未获取到免费额度数据。";
      const list = pick(d, "quotas", "quotaList", "models", "list");
      if (Array.isArray(list)) {
        const lines = list.slice(0, 8).map((m: any) => {
          const model = pick(m, "model", "modelName", "modelId") ?? "?";
          const total = pick(m, "quotaTotal", "totalQuota", "total");
          const used = pick(m, "quotaUsed", "usedQuota", "used");
          const on = pick(m, "freeTierOnly");
          return `- ${model}: 已用 ${used ?? "?"} / 共 ${total ?? "?"}${on !== undefined ? `，用完即停 ${on ? "开" : "关"}` : ""}`;
        });
        return lines.length
          ? `免费额度:\n${lines.join("\n")}`
          : "免费额度: " + JSON.stringify(d).slice(0, 300);
      }
      return "免费额度: " + JSON.stringify(d).slice(0, 300);
    },
  },
  {
    id: "usage",
    title: "模型用量统计",
    desc: "各模型/TokenPlan 的用量与百分比一次查清，自动生成用量分析",
    intent:
      "查询百炼 TokenPlan 个人版用量（5 小时/1 周窗口百分比、重置时间、套餐、用量包）。当用户问用量、用了多少、额度百分比、TokenPlan 使用情况时使用。",
    argv: ["token-plan", "personal-usage"],
    summarize: (d) => {
      if (!d || typeof d !== "object") return "未获取到用量数据。";
      const u = d.usage ?? d;
      const parts: string[] = [];
      if (u.per5HourPercentage !== undefined)
        parts.push(`5 小时窗口已用 ${pct(u.per5HourPercentage)}`);
      if (u.per1WeekPercentage !== undefined)
        parts.push(`1 周窗口已用 ${pct(u.per1WeekPercentage)}`);
      const sub = d.subscription;
      if (sub && sub.remainingDays !== undefined) parts.push(`套餐剩余 ${sub.remainingDays} 天`);
      const add = d.addonSummary;
      if (add && add.remainingCredits !== undefined)
        parts.push(`用量包剩余 ${add.remainingCredits}/${add.totalCredits}`);
      return parts.length
        ? `TokenPlan 用量: ${parts.join("；")}`
        : "用量: " + JSON.stringify(d).slice(0, 300);
    },
  },
  {
    id: "apikey",
    title: "API Key 管理",
    desc: "查看 TokenPlan API Key（脱敏），创建/重置可在控制台或 bl 完成",
    intent:
      "查询当前百炼 TokenPlan API Key（脱敏）。当用户问 API Key、密钥、我的 key、查看 key 时使用。",
    argv: ["token-plan", "personal-key"],
    summarize: (d) => {
      if (!d || typeof d !== "object") return "未获取到 API Key。";
      const mask = pick(d, "mask_apikey", "maskApikey", "apiKey");
      const id = pick(d, "key_id", "keyId");
      if (mask) return `API Key: ${mask}${id !== undefined ? `（id: ${id}）` : ""}`;
      return "API Key: " + JSON.stringify(d).slice(0, 300);
    },
  },
];

export function featureById(id: string): BailianFeature | undefined {
  return FEATURES.find((f) => f.id === id);
}
export function featureByTitle(title: string): BailianFeature | undefined {
  return FEATURES.find((f) => f.title === title);
}
