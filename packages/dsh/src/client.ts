/**
 * `bailian-cli-dsh` (Client half): renders the general "Bailian" webui —
 * a settings.section page (凭证配置 / TokenPlan 用量 / 记忆库) plus a
 * new-session welcome page. Built by `scripts/build-client.mjs` (esbuild)
 * into the DSH ModuleLoader format (`client.bundle.js`).
 *
 * Runs in the browser; `React` is external (resolved by the ModuleLoader),
 * styles are injected via the DOM, and data comes from the Host's
 * `/bailian/*` webServer routes via `fetch`.
 *
 * @module bailian-cli-dsh/client
 */

// @ts-nocheck — built by esbuild into the ModuleLoader client bundle; React is
// external (resolved by the browser ModuleLoader), styles injected via DOM.
import React from "react";

/** Inject a <style> tag into the document head (browser). Returns a remover. */
function insertStyles(css: string): () => void {
  if (typeof document === "undefined") return () => {};
  const tag = document.createElement("style");
  tag.dataset.plugin = "bailian-cli-dsh";
  tag.textContent = css;
  document.head.appendChild(tag);
  return () => {
    if (tag.parentNode) tag.parentNode.removeChild(tag);
  };
}

/** Services required by the client plugin. */
export const inject = ["slots"];

/** Browser Cordis plugin: registers the "Bailian" settings.section page. */
export function apply(ctx: any): void {
  const slots = ctx.get("slots");
  if (slots === undefined) return;

  insertStyles(`
    .bl-wrap { padding: 20px; max-width: 640px; }
    .bl-title { font-size: 16px; font-weight: 600; margin: 0 0 4px; color: var(--dsw-text, #18181b); }
    .bl-sub { font-size: 12px; color: var(--dsw-text-secondary, #71717a); margin: 0 0 20px; }
    .bl-section { border: 1px solid var(--dsw-border, #e4e4e7); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .bl-section-title { font-size: 14px; font-weight: 600; margin: 0 0 12px; color: var(--dsw-text, #18181b); }
    .bl-field { margin-bottom: 12px; }
    .bl-label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px; color: var(--dsw-text, #18181b); }
    .bl-input { width: 100%; padding: 7px 10px; border: 1px solid var(--dsw-border, #e4e4e7); border-radius: 6px; background: var(--dsw-input, #fff); color: var(--dsw-text, #18181b); font-size: 13px; box-sizing: border-box; }
    .bl-input:focus { outline: none; border-color: var(--dsw-accent, #2563eb); }
    .bl-row { display: flex; gap: 12px; align-items: flex-end; }
    .bl-row > .bl-field { flex: 1; margin-bottom: 0; }
    .bl-btn { padding: 7px 18px; border: none; border-radius: 6px; background: var(--dsw-accent, #2563eb); color: #fff; cursor: pointer; font-size: 13px; font-weight: 500; white-space: nowrap; }
    .bl-btn:hover:not(:disabled) { opacity: 0.9; }
    .bl-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .bl-card { border: 1px solid var(--dsw-border, #e4e4e7); border-radius: 8px; padding: 14px; margin-top: 12px; }
    .bl-card-title { font-size: 13px; font-weight: 600; margin: 0 0 10px; color: var(--dsw-text, #18181b); }
    .bl-stat { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; }
    .bl-stat-label { font-size: 13px; color: var(--dsw-text-secondary, #71717a); }
    .bl-stat-val { font-size: 13px; font-weight: 600; color: var(--dsw-text, #18181b); }
    .bl-bar { width: 100%; height: 6px; background: var(--dsw-surface-hover, #f4f4f5); border-radius: 3px; overflow: hidden; margin-top: 4px; }
    .bl-bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
    .bl-msg { font-size: 13px; margin-top: 8px; padding: 8px 12px; border-radius: 6px; }
    .bl-msg-ok { color: #16a34a; background: #dcfce7; }
    .bl-msg-err { color: var(--dsw-danger, #e5484d); background: var(--dsw-danger-bg, #fef2f2); }
    .bl-loading { font-size: 13px; color: var(--dsw-text-secondary, #71717a); padding: 12px 0; }
    .bl-spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid var(--dsw-border, #e4e4e7); border-top-color: var(--dsw-accent, #2563eb); border-radius: 50%; animation: bl-spin 0.6s linear infinite; margin-right: 6px; vertical-align: middle; }
    @keyframes bl-spin { to { transform: rotate(360deg); } }
    .bl-tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  `);

  function fmtPct(val: unknown): string {
    if (val === undefined || val === null) return "—";
    const pct = (typeof val === "number" ? val : Number(val)) * 100;
    return (isNaN(pct) ? 0 : pct).toFixed(1) + "%";
  }
  function barColor(pct: unknown): string {
    let n = typeof pct === "number" ? pct : Number(pct);
    if (isNaN(n)) n = 0;
    if (n >= 0.9) return "#ef4444";
    if (n >= 0.7) return "#f59e0b";
    return "#22c55e";
  }
  function fmtTime(ts: unknown): string {
    return ts ? new Date(ts as number).toLocaleString() : "—";
  }
  function fmtDays(days: unknown): string {
    if (typeof days === "number") return `${days} 天`;
    if (typeof days === "string" && days.length > 0) return `${days} 天`;
    return "—";
  }

  /**
   * Host route payloads. `fetch().json()` is `unknown`, and every one of these
   * routes answers either its success shape or `{ error }`, so the reads below
   * stay optional rather than asserting a discriminated union that the error
   * branch would violate.
   */
  interface ErrorPayload {
    error?: string;
  }
  interface CredentialsPayload extends ErrorPayload {
    ok?: boolean;
    profile?: string;
  }
  interface MemoryStatusPayload {
    configured?: boolean;
    userId?: string;
    baseUrl?: string;
    planVersion?: string;
    topK?: number;
    autoInject?: boolean;
    autoPersist?: boolean;
  }

  slots.inject("settings.section", () =>
    slots.register(
      { name: "settings.section", id: "bailian", label: "Bailian", order: 90 },
      function () {
        const [cred, setCred] = React.useState({ id: "", secret: "", apiKey: "" });
        const [credMsg, setCredMsg] = React.useState({ type: "", text: "" });
        const [cLoading, setCLoading] = React.useState(false);
        const [uForm, setUForm] = React.useState({ region: "cn-beijing", site: "domestic" });
        const [result, setResult] = React.useState<any>(null);
        const [uLoading, setULoading] = React.useState(false);
        const [uErr, setUErr] = React.useState("");
        const [memCfg, setMemCfg] = React.useState({
          userId: "",
          baseUrl: "https://dashscope.aliyuncs.com/api/v2/apps/memory/",
          planVersion: "lite",
          topK: 10,
          autoInject: true,
          autoPersist: true,
          memoryLibraryId: "",
        });
        const [memMsg, setMemMsg] = React.useState({ type: "", text: "" });
        const [mLoading, setMLoading] = React.useState(false);
        const [memStatus, setMemStatus] = React.useState<any>(null);

        function updateCred(field: string, val: string): void {
          const patch: Record<string, string> = {};
          patch[field] = val;
          setCred(Object.assign({}, cred, patch));
        }
        function updateU(field: string, val: string): void {
          const patch: Record<string, string> = {};
          patch[field] = val;
          setUForm(Object.assign({}, uForm, patch));
        }

        async function saveCred(): Promise<void> {
          if (!cred.id || !cred.secret) return;
          setCLoading(true);
          setCredMsg({ type: "", text: "" });
          try {
            const resp = await fetch("/api/bailian/credentials", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ accessKeyId: cred.id, accessKeySecret: cred.secret }),
            });
            const data = (await resp.json()) as CredentialsPayload;
            if (!resp.ok) throw new Error(data.error ?? `HTTP ${resp.status}`);
            // Also save API Key to memory config if provided
            if (cred.apiKey) {
              try {
                await fetch("/api/bailian/memory/config", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ apiKey: cred.apiKey }),
                });
              } catch {
                /* non-fatal: memory module may not be enabled */
              }
            }
            const parts = [`AK/SK 已存入 bl ${data.profile ?? "dsh"} profile`];
            if (cred.apiKey) parts.push("API Key 已同步到记忆库配置");
            setCredMsg({ type: "ok", text: parts.join("；") + "。" });
          } catch (error) {
            setCredMsg({
              type: "err",
              text: error instanceof Error ? error.message : String(error),
            });
          } finally {
            setCLoading(false);
          }
        }

        async function fetchUsage(): Promise<void> {
          setULoading(true);
          setUErr("");
          setResult(null);
          try {
            const resp = await fetch("/api/bailian/tokenplan/usage", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ region: uForm.region, site: uForm.site }),
            });
            const data = (await resp.json()) as ErrorPayload;
            if (!resp.ok) throw new Error(data.error ?? `HTTP ${resp.status}`);
            setResult(data);
          } catch (error) {
            setUErr(error instanceof Error ? error.message : String(error));
          } finally {
            setULoading(false);
          }
        }

        const children: any[] = [
          React.createElement("h3", { className: "bl-title", key: "t" }, "阿里云百炼"),
          React.createElement(
            "p",
            { className: "bl-sub", key: "s" },
            "配置阿里云 AK/SK 后，所有百炼插件共用此凭证调用控制台接口。",
          ),
        ];

        // ── 凭证配置 ──
        const credChildren: any[] = [
          React.createElement("div", { className: "bl-section-title", key: "ct" }, "凭证配置"),
        ];
        credChildren.push(
          React.createElement(
            "div",
            { className: "bl-field", key: "ci" },
            React.createElement("label", { className: "bl-label" }, "AccessKey ID"),
            React.createElement("input", {
              className: "bl-input",
              value: cred.id,
              onChange: (e: any) => updateCred("id", e.target.value),
              placeholder: "LTAI...",
            }),
          ),
        );
        credChildren.push(
          React.createElement(
            "div",
            { className: "bl-field", key: "cs" },
            React.createElement("label", { className: "bl-label" }, "AccessKey Secret"),
            React.createElement("input", {
              className: "bl-input",
              type: "password",
              value: cred.secret,
              onChange: (e: any) => updateCred("secret", e.target.value),
              placeholder: "••••••••",
            }),
          ),
        );
        credChildren.push(
          React.createElement(
            "div",
            { className: "bl-field", key: "cak" },
            React.createElement("label", { className: "bl-label" }, "DashScope API Key"),
            React.createElement("input", {
              className: "bl-input",
              type: "password",
              value: cred.apiKey,
              onChange: (e: any) => updateCred("apiKey", e.target.value),
              placeholder: "sk-xxxx（按量付费，记忆库等共用）",
            }),
          ),
        );
        credChildren.push(
          React.createElement(
            "button",
            {
              className: "bl-btn",
              key: "cb",
              onClick: saveCred,
              disabled: cLoading || !cred.id || !cred.secret,
            },
            cLoading ? "保存中..." : "保存凭证",
          ),
        );
        if (credMsg.text) {
          credChildren.push(
            React.createElement(
              "div",
              { className: "bl-msg bl-msg-" + credMsg.type, key: "cm" },
              credMsg.text,
            ),
          );
        }
        children.push(
          React.createElement("div", { className: "bl-section", key: "cred" }, credChildren),
        );

        // ── TokenPlan 用量 ──
        const tpChildren: any[] = [
          React.createElement(
            "div",
            { className: "bl-section-title", key: "tt" },
            "TokenPlan 用量",
          ),
        ];
        tpChildren.push(
          React.createElement(
            "div",
            { className: "bl-row", key: "tr" },
            React.createElement(
              "div",
              { className: "bl-field" },
              React.createElement("label", { className: "bl-label" }, "区域"),
              React.createElement(
                "select",
                {
                  className: "bl-input",
                  value: uForm.region,
                  onChange: (e: any) => updateU("region", e.target.value),
                },
                React.createElement("option", { value: "cn-beijing" }, "cn-beijing"),
                React.createElement("option", { value: "ap-southeast-1" }, "ap-southeast-1"),
              ),
            ),
            React.createElement(
              "div",
              { className: "bl-field" },
              React.createElement("label", { className: "bl-label" }, "站点"),
              React.createElement(
                "select",
                {
                  className: "bl-input",
                  value: uForm.site,
                  onChange: (e: any) => updateU("site", e.target.value),
                },
                React.createElement("option", { value: "domestic" }, "国内站"),
                React.createElement("option", { value: "international" }, "国际站"),
              ),
            ),
            React.createElement(
              "button",
              {
                className: "bl-btn",
                onClick: fetchUsage,
                disabled: uLoading,
              },
              uLoading ? "查询中..." : "查询用量",
            ),
          ),
        );

        if (uErr) {
          tpChildren.push(
            React.createElement("div", { className: "bl-msg bl-msg-err", key: "te" }, uErr),
          );
        }
        if (uLoading) {
          tpChildren.push(
            React.createElement(
              "div",
              { className: "bl-loading", key: "tl" },
              React.createElement("span", { className: "bl-spinner" }),
              "正在调用控制台接口...",
            ),
          );
        }

        if (result) {
          // Usage card
          const usage = result.usage;
          if (
            usage &&
            typeof usage === "object" &&
            (usage.per5HourPercentage !== undefined || usage.per1WeekPercentage !== undefined)
          ) {
            const uc: any[] = [
              React.createElement("div", { className: "bl-card-title", key: "ut" }, "用量百分比"),
            ];
            if (usage.per5HourPercentage !== undefined) {
              uc.push(
                React.createElement(
                  "div",
                  { key: "u5" },
                  React.createElement(
                    "div",
                    { className: "bl-stat" },
                    React.createElement("span", { className: "bl-stat-label" }, "5 小时窗口"),
                    React.createElement(
                      "span",
                      { className: "bl-stat-val" },
                      fmtPct(usage.per5HourPercentage),
                    ),
                  ),
                  React.createElement(
                    "div",
                    { className: "bl-bar" },
                    React.createElement("div", {
                      className: "bl-bar-fill",
                      style: {
                        width: fmtPct(usage.per5HourPercentage),
                        background: barColor(usage.per5HourPercentage),
                      },
                    }),
                  ),
                  React.createElement(
                    "div",
                    { className: "bl-stat", style: { marginTop: "4px" } },
                    React.createElement(
                      "span",
                      { className: "bl-stat-label", style: { fontSize: "11px" } },
                      "重置时间",
                    ),
                    React.createElement(
                      "span",
                      { className: "bl-stat-val", style: { fontSize: "11px" } },
                      fmtTime(usage.per5HourResetTime),
                    ),
                  ),
                ),
              );
            }
            if (usage.per1WeekPercentage !== undefined) {
              uc.push(
                React.createElement(
                  "div",
                  { key: "u1w", style: { marginTop: "12px" } },
                  React.createElement(
                    "div",
                    { className: "bl-stat" },
                    React.createElement("span", { className: "bl-stat-label" }, "1 周窗口"),
                    React.createElement(
                      "span",
                      { className: "bl-stat-val" },
                      fmtPct(usage.per1WeekPercentage),
                    ),
                  ),
                  React.createElement(
                    "div",
                    { className: "bl-bar" },
                    React.createElement("div", {
                      className: "bl-bar-fill",
                      style: {
                        width: fmtPct(usage.per1WeekPercentage),
                        background: barColor(usage.per1WeekPercentage),
                      },
                    }),
                  ),
                  React.createElement(
                    "div",
                    { className: "bl-stat", style: { marginTop: "4px" } },
                    React.createElement(
                      "span",
                      { className: "bl-stat-label", style: { fontSize: "11px" } },
                      "重置时间",
                    ),
                    React.createElement(
                      "span",
                      { className: "bl-stat-val", style: { fontSize: "11px" } },
                      fmtTime(usage.per1WeekResetTime),
                    ),
                  ),
                ),
              );
            }
            tpChildren.push(React.createElement("div", { className: "bl-card", key: "uc" }, uc));
          }

          // Subscription card
          const sub = result.subscription;
          if (sub && typeof sub === "object" && sub.instanceCode) {
            const sm: Record<string, string> = {
              lite: "基础版",
              standard: "标准版",
              pro: "高级版",
            };
            const sc: any[] = [
              React.createElement("div", { className: "bl-card-title", key: "st" }, "套餐信息"),
            ];
            sc.push(
              React.createElement(
                "div",
                { className: "bl-stat", key: "s1" },
                React.createElement("span", { className: "bl-stat-label" }, "套餐类型"),
                React.createElement(
                  "span",
                  { className: "bl-stat-val" },
                  sm[sub.specCode] || sub.specCode,
                ),
              ),
            );
            sc.push(
              React.createElement(
                "div",
                { className: "bl-stat", key: "s2" },
                React.createElement("span", { className: "bl-stat-label" }, "状态"),
                React.createElement(
                  "span",
                  {
                    className: "bl-tag",
                    style: {
                      background: sub.status === "VALID" ? "#dcfce7" : "#fee2e2",
                      color: sub.status === "VALID" ? "#16a34a" : "#dc2626",
                    },
                  },
                  sub.status === "VALID" ? "有效" : "无效",
                ),
              ),
            );
            sc.push(
              React.createElement(
                "div",
                { className: "bl-stat", key: "s3" },
                React.createElement("span", { className: "bl-stat-label" }, "剩余天数"),
                React.createElement(
                  "span",
                  { className: "bl-stat-val" },
                  fmtDays(sub.remainingDays),
                ),
              ),
            );
            sc.push(
              React.createElement(
                "div",
                { className: "bl-stat", key: "s4" },
                React.createElement("span", { className: "bl-stat-label" }, "到期时间"),
                React.createElement("span", { className: "bl-stat-val" }, fmtTime(sub.endTime)),
              ),
            );
            sc.push(
              React.createElement(
                "div",
                { className: "bl-stat", key: "s5" },
                React.createElement("span", { className: "bl-stat-label" }, "自动续费"),
                React.createElement(
                  "span",
                  { className: "bl-stat-val" },
                  sub.autoRenewFlag ? "已开启" : "未开启",
                ),
              ),
            );
            tpChildren.push(React.createElement("div", { className: "bl-card", key: "sc" }, sc));
          }

          // Addon summary card
          const addon = result.addonSummary;
          if (addon && typeof addon === "object" && addon.totalCredits !== undefined) {
            const ac: any[] = [
              React.createElement("div", { className: "bl-card-title", key: "at" }, "额外用量包"),
            ];
            ac.push(
              React.createElement(
                "div",
                { className: "bl-stat", key: "a1" },
                React.createElement("span", { className: "bl-stat-label" }, "Credits 总量"),
                React.createElement("span", { className: "bl-stat-val" }, addon.totalCredits),
              ),
            );
            ac.push(
              React.createElement(
                "div",
                { className: "bl-stat", key: "a2" },
                React.createElement("span", { className: "bl-stat-label" }, "Credits 剩余"),
                React.createElement("span", { className: "bl-stat-val" }, addon.remainingCredits),
              ),
            );
            if (addon.activeCount !== undefined) {
              ac.push(
                React.createElement(
                  "div",
                  { className: "bl-stat", key: "a3" },
                  React.createElement("span", { className: "bl-stat-label" }, "生效中"),
                  React.createElement("span", { className: "bl-stat-val" }, addon.activeCount),
                ),
              );
            }
            tpChildren.push(React.createElement("div", { className: "bl-card", key: "ac" }, ac));
          }

          // Errors
          if (result.errors && result.errors.length > 0) {
            tpChildren.push(
              React.createElement(
                "div",
                {
                  className: "bl-card",
                  key: "ec",
                  style: { borderColor: "var(--dsw-danger, #e5484d)" },
                },
                result.errors.map((e: any, i: number) =>
                  React.createElement(
                    "div",
                    { key: "e" + i, style: { fontSize: "12px", marginBottom: "4px" } },
                    "[" + e.api + "] " + e.message,
                  ),
                ),
              ),
            );
          }
        }

        children.push(
          React.createElement("div", { className: "bl-section", key: "tp" }, tpChildren),
        );

        // ── 记忆库 ──
        function updateMemCfg(field: string, val: any): void {
          const patch: Record<string, any> = {};
          patch[field] = val;
          setMemCfg(Object.assign({}, memCfg, patch));
        }
        async function saveMemCfg(): Promise<void> {
          setMLoading(true);
          setMemMsg({ type: "", text: "" });
          try {
            const resp = await fetch("/api/bailian/memory/config", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(memCfg),
            });
            const data = (await resp.json()) as ErrorPayload;
            if (!resp.ok) throw new Error(data.error ?? `HTTP ${resp.status}`);
            setMemMsg({ type: "ok", text: "记忆库配置已保存。" });
          } catch (error) {
            setMemMsg({
              type: "err",
              text: error instanceof Error ? error.message : String(error),
            });
          } finally {
            setMLoading(false);
          }
        }
        async function fetchMemStatus(): Promise<void> {
          try {
            const resp = await fetch("/api/bailian/memory/status");
            const data = (await resp.json()) as MemoryStatusPayload;
            setMemStatus(data);
            if (data.userId) updateMemCfg("userId", data.userId);
            if (data.baseUrl) updateMemCfg("baseUrl", data.baseUrl);
            if (data.planVersion) updateMemCfg("planVersion", data.planVersion);
            if (data.topK) updateMemCfg("topK", data.topK);
            if (data.autoInject !== undefined) updateMemCfg("autoInject", data.autoInject);
            if (data.autoPersist !== undefined) updateMemCfg("autoPersist", data.autoPersist);
          } catch {
            /* memory module may not be enabled */
          }
        }
        React.useEffect(() => {
          void fetchMemStatus();
        }, []);

        const memChildren: any[] = [
          React.createElement("div", { className: "bl-section-title", key: "mt" }, "记忆库"),
        ];
        if (memStatus) {
          memChildren.push(
            React.createElement(
              "div",
              { className: "bl-stat", key: "ms" },
              React.createElement("span", { className: "bl-stat-label" }, "API Key"),
              React.createElement(
                "span",
                {
                  className: "bl-tag",
                  style: {
                    background: memStatus.configured ? "#dcfce7" : "#fee2e2",
                    color: memStatus.configured ? "#16a34a" : "#dc2626",
                  },
                },
                memStatus.configured ? "已配置" : "未配置",
              ),
            ),
          );
        }
        memChildren.push(
          React.createElement(
            "div",
            { className: "bl-field", key: "mu" },
            React.createElement("label", { className: "bl-label" }, "User ID"),
            React.createElement("input", {
              className: "bl-input",
              value: memCfg.userId,
              onChange: (e: any) => updateMemCfg("userId", e.target.value),
              placeholder: "留空用系统用户名",
            }),
          ),
        );
        memChildren.push(
          React.createElement(
            "div",
            { className: "bl-field", key: "mb" },
            React.createElement("label", { className: "bl-label" }, "Base URL"),
            React.createElement("input", {
              className: "bl-input",
              value: memCfg.baseUrl,
              onChange: (e: any) => updateMemCfg("baseUrl", e.target.value),
            }),
          ),
        );
        memChildren.push(
          React.createElement(
            "div",
            { className: "bl-row", key: "mr" },
            React.createElement(
              "div",
              { className: "bl-field" },
              React.createElement("label", { className: "bl-label" }, "策略版本"),
              React.createElement(
                "select",
                {
                  className: "bl-input",
                  value: memCfg.planVersion,
                  onChange: (e: any) => updateMemCfg("planVersion", e.target.value),
                },
                React.createElement("option", { value: "lite" }, "Lite（便宜）"),
                React.createElement("option", { value: "pro" }, "Pro（贵50倍）"),
              ),
            ),
            React.createElement(
              "div",
              { className: "bl-field" },
              React.createElement("label", { className: "bl-label" }, "Top K"),
              React.createElement("input", {
                className: "bl-input",
                type: "number",
                value: memCfg.topK,
                onChange: (e: any) => updateMemCfg("topK", Number(e.target.value)),
              }),
            ),
          ),
        );
        memChildren.push(
          React.createElement(
            "div",
            { className: "bl-row", key: "ms2" },
            React.createElement(
              "div",
              { className: "bl-field" },
              React.createElement(
                "label",
                { className: "bl-label" },
                React.createElement("input", {
                  type: "checkbox",
                  checked: memCfg.autoInject,
                  onChange: (e: any) => updateMemCfg("autoInject", e.target.checked),
                  style: { marginRight: "6px" },
                }),
                "自动检索注入",
              ),
            ),
            React.createElement(
              "div",
              { className: "bl-field" },
              React.createElement(
                "label",
                { className: "bl-label" },
                React.createElement("input", {
                  type: "checkbox",
                  checked: memCfg.autoPersist,
                  onChange: (e: any) => updateMemCfg("autoPersist", e.target.checked),
                  style: { marginRight: "6px" },
                }),
                "自动落库",
              ),
            ),
          ),
        );
        memChildren.push(
          React.createElement(
            "div",
            { className: "bl-field", key: "ml" },
            React.createElement("label", { className: "bl-label" }, "Memory Library ID（可选）"),
            React.createElement("input", {
              className: "bl-input",
              value: memCfg.memoryLibraryId,
              onChange: (e: any) => updateMemCfg("memoryLibraryId", e.target.value),
              placeholder: "留空用默认",
            }),
          ),
        );
        memChildren.push(
          React.createElement(
            "button",
            { className: "bl-btn", key: "mbtn", onClick: saveMemCfg, disabled: mLoading },
            mLoading ? "保存中..." : "保存记忆配置",
          ),
        );
        if (memMsg.text) {
          memChildren.push(
            React.createElement(
              "div",
              { className: "bl-msg bl-msg-" + memMsg.type, key: "mmsg" },
              memMsg.text,
            ),
          );
        }
        children.push(
          React.createElement("div", { className: "bl-section", key: "mem" }, memChildren),
        );

        return React.createElement("div", { className: "bl-wrap" }, children);
      },
    ),
  );

  // ── 欢迎页：每个新会话（blank）显示，开始对话后自动隐藏 ──
  const WELCOME_TABS: Array<{
    id: string;
    label: string;
    cards: Array<{ title: string; desc: string }>;
  }> = [
    {
      id: "rec",
      label: "为我推荐",
      cards: [
        {
          title: "免费额度一键防护",
          desc: "一键开启「用完即停」，免费额度耗尽自动停止调用，不再产生意外扣费",
        },
        { title: "API Key 配置诊断", desc: "自动排查 401 报错与配置问题，直接给出可用的正确配置" },
        {
          title: "账单消费分析",
          desc: "账单按 Key、模型、时间三个维度拆解，钱花在哪一目了然，顺手设置费用告警",
        },
        { title: "限流自查与提额", desc: "被 429 限流？帮你查清用量水位、定位原因，一键申请提额" },
        {
          title: "智能配置监控告警",
          desc: "不知道告警阈值设多少？根据你的历史调用数据自动算出建议值，批量创建规则",
        },
        { title: "模型用量统计", desc: "各模型的 Token 用量与费用一次查清，自动生成用量分析报告" },
      ],
    },
    {
      id: "key",
      label: "密钥与接入",
      cards: [
        { title: "API Key 配置诊断", desc: "自动排查 401 报错与配置问题，直接给出可用的正确配置" },
        {
          title: "API Key 管理",
          desc: "创建、禁用、重置、删除 Key 对话即可完成，全程脱敏展示，不怕泄露",
        },
        {
          title: "第三方工具一键接入",
          desc: "不用手动改配置，为 Claude Code、Cursor、OpenClaw 生成开箱即用的接入配置",
        },
        {
          title: "业务空间与成员管理",
          desc: "团队多人协作按空间划分：管理成员与权限，各空间 API Key 相互隔离",
        },
      ],
    },
    {
      id: "usage",
      label: "用量与费用",
      cards: [
        {
          title: "免费额度一键防护",
          desc: "一键开启「用完即停」，免费额度耗尽自动停止调用，不再产生意外扣费",
        },
        {
          title: "账单消费分析",
          desc: "账单按 Key、模型、时间三个维度拆解，钱花在哪一目了然，顺手设置费用告警",
        },
        { title: "限流自查与提额", desc: "被 429 限流？帮你查清用量水位、定位原因，一键申请提额" },
        { title: "模型用量统计", desc: "各模型的 Token 用量与费用一次查清，自动生成用量分析报告" },
        {
          title: "费用告警设置",
          desc: "设一条月度消费上限，快超时钉钉/邮件自动提醒，不用天天盯账单",
        },
      ],
    },
    {
      id: "ops",
      label: "运维监控",
      cards: [
        {
          title: "智能配置监控告警",
          desc: "不知道告警阈值设多少？根据你的历史调用数据自动算出建议值，批量创建规则",
        },
        {
          title: "监控总览与失败日志",
          desc: "一屏总览调用量、失败率和延时，出现异常时可直接定位到具体的失败请求",
        },
        { title: "告警规则管理", desc: "已有告警规则统一查看、修改、停用，触发历史随时回溯" },
      ],
    },
    {
      id: "task",
      label: "任务与部署",
      cards: [
        { title: "批量推理任务", desc: "大批量数据离线跑推理，费用只要一半，完成后一键下载结果" },
        { title: "模型部署管理", desc: "一键部署模型，快速实现扩/缩容，无需手动运维" },
        {
          title: "图像/视频生成任务",
          desc: "一句话生成图片或视频（通义万相等模型），任务进度随时可查",
        },
      ],
    },
    {
      id: "model",
      label: "模型管理",
      cards: [
        { title: "模型对比选型", desc: "选型拿不准？直接问 agent，帮你推荐最适合的模型" },
        { title: "模型评测", desc: "用自己的业务数据检验模型效果，自动生成评测报告与错例分析" },
        {
          title: "模型调优",
          desc: "让通用模型学会你的业务：对话式引导 SFT 微调，费用与耗时提前算清",
        },
      ],
    },
  ];

  insertStyles(`
    .bw-wrap{padding:8px 4px 20px;max-width:1100px;margin:0 auto;width:100%}
    .bw-head{display:flex;gap:14px;align-items:flex-start;margin-bottom:18px}
    .bw-logo{width:44px;height:44px;border-radius:12px;background:#6366f1;color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;flex:none}
    .bw-title{font-size:20px;font-weight:700;color:var(--dsw-text,#18181b);margin-bottom:4px}
    .bw-desc{font-size:13px;color:var(--dsw-text-secondary,#71717a);line-height:1.6;max-width:640px}
    .bw-tabs{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
    .bw-tab{padding:8px 18px;border-radius:999px;border:1px solid var(--dsw-border,#e4e4e7);background:var(--dsw-input,#fff);color:var(--dsw-text-secondary,#71717a);font-size:13px;cursor:pointer}
    .bw-tab-active{background:#6366f1;border-color:#6366f1;color:#fff}
    .bw-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
    .bw-card{border:1px solid var(--dsw-border,#e4e4e7);border-radius:12px;padding:18px;background:var(--dsw-input,#fff);cursor:pointer;transition:box-shadow .15s}
    .bw-card:hover{box-shadow:0 2px 10px rgba(0,0,0,.06)}
    .bw-card-title{font-size:15px;font-weight:600;color:var(--dsw-text,#18181b);margin-bottom:8px}
    .bw-card-desc{font-size:13px;color:var(--dsw-text-secondary,#71717a);line-height:1.6}
  `);

  slots.inject("conversation.input.dock", () =>
    slots.register(
      { name: "conversation.input.dock", id: "bailian-welcome", order: -100 },
      function (props: any) {
        const session = props && props.session;
        if (!session || session.blank !== true) return null;
        const [tab, setTab] = React.useState("rec");
        let active = WELCOME_TABS.find((t) => t.id === tab);
        if (!active) active = WELCOME_TABS[0];
        return React.createElement(
          "div",
          { className: "bw-wrap" },
          React.createElement(
            "div",
            { className: "bw-head" },
            React.createElement("div", { className: "bw-logo" }, "B"),
            React.createElement(
              "div",
              null,
              React.createElement("div", { className: "bw-title" }, "百炼 Agent"),
              React.createElement(
                "div",
                { className: "bw-desc" },
                "百炼 Agent 是您的智能百炼控制台，通过 Agent + CLI 帮助您高效管理百炼平台，覆盖密钥接入、用量费用、运维监控、任务部署、模型管理等场景。",
              ),
            ),
          ),
          React.createElement(
            "div",
            { className: "bw-tabs" },
            WELCOME_TABS.map((t) =>
              React.createElement(
                "button",
                {
                  key: t.id,
                  className: "bw-tab" + (t.id === tab ? " bw-tab-active" : ""),
                  onClick: () => setTab(t.id),
                },
                t.label,
              ),
            ),
          ),
          React.createElement(
            "div",
            { className: "bw-cards" },
            active.cards.map((c) =>
              React.createElement(
                "div",
                { key: c.title, className: "bw-card" },
                React.createElement("div", { className: "bw-card-title" }, c.title),
                React.createElement("div", { className: "bw-card-desc" }, c.desc),
              ),
            ),
          ),
        );
      },
    ),
  );
}
