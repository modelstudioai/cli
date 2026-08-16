window.__ModuleLoader__.load({
  id: "bailian-cli-dsh",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");

    function insertStyles(css) {
      if (typeof document === "undefined") return function () {};
      var tag = document.createElement("style");
      tag.dataset.plugin = "bailian-cli-dsh";
      tag.textContent = css;
      document.head.appendChild(tag);
      return function () {
        if (tag.parentNode) tag.parentNode.removeChild(tag);
      };
    }
    var styles = { insert: insertStyles };

    function jfetch(url, opts) {
      return fetch(url, opts).then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok) throw new Error((d && d.error) || "HTTP " + r.status);
          return d;
        });
      });
    }

    styles.insert(
      ".bl-wrap{padding:20px;max-width:640px}" +
        ".bl-title{font-size:16px;font-weight:600;margin:0 0 4px;color:var(--dsw-text,#18181b)}" +
        ".bl-sub{font-size:12px;color:var(--dsw-text-secondary,#71717a);margin:0 0 20px}" +
        ".bl-section{border:1px solid var(--dsw-border,#e4e4e7);border-radius:8px;padding:16px;margin-bottom:16px}" +
        ".bl-section-title{font-size:14px;font-weight:600;margin:0 0 12px;color:var(--dsw-text,#18181b)}" +
        ".bl-field{margin-bottom:12px}" +
        ".bl-label{display:block;font-size:13px;font-weight:500;margin-bottom:4px;color:var(--dsw-text,#18181b)}" +
        ".bl-input{width:100%;padding:7px 10px;border:1px solid var(--dsw-border,#e4e4e7);border-radius:6px;background:var(--dsw-input,#fff);color:var(--dsw-text,#18181b);font-size:13px;box-sizing:border-box}" +
        ".bl-row{display:flex;gap:12px;align-items:flex-end}" +
        ".bl-row>.bl-field{flex:1;margin-bottom:0}" +
        ".bl-btn{padding:7px 18px;border:none;border-radius:6px;background:var(--dsw-accent,#2563eb);color:#fff;cursor:pointer;font-size:13px;font-weight:500;white-space:nowrap}" +
        ".bl-btn:disabled{opacity:.4;cursor:not-allowed}" +
        ".bl-card{border:1px solid var(--dsw-border,#e4e4e7);border-radius:8px;padding:14px;margin-top:12px}" +
        ".bl-card-title{font-size:13px;font-weight:600;margin:0 0 10px;color:var(--dsw-text,#18181b)}" +
        ".bl-stat{display:flex;justify-content:space-between;align-items:center;padding:5px 0}" +
        ".bl-stat-label{font-size:13px;color:var(--dsw-text-secondary,#71717a)}" +
        ".bl-stat-val{font-size:13px;font-weight:600;color:var(--dsw-text,#18181b)}" +
        ".bl-bar{width:100%;height:6px;background:var(--dsw-surface-hover,#f4f4f5);border-radius:3px;overflow:hidden;margin-top:4px}" +
        ".bl-bar-fill{height:100%;border-radius:3px}" +
        ".bl-msg{font-size:13px;margin-top:8px;padding:8px 12px;border-radius:6px}" +
        ".bl-msg-ok{color:#16a34a;background:#dcfce7}" +
        ".bl-msg-err{color:var(--dsw-danger,#e5484d);background:var(--dsw-danger-bg,#fef2f2)}" +
        ".bl-tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}" +
        ".bw-wrap{padding:8px 4px 20px;max-width:1100px;margin:0 auto;width:100%}" +
        ".bw-head{display:flex;gap:14px;align-items:flex-start;margin-bottom:18px}" +
        ".bw-logo{width:44px;height:44px;border-radius:12px;background:#6366f1;color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;flex:none}" +
        ".bw-title{font-size:20px;font-weight:700;color:var(--dsw-text,#18181b);margin-bottom:4px}" +
        ".bw-desc{font-size:13px;color:var(--dsw-text-secondary,#71717a);line-height:1.6;max-width:640px}" +
        ".bw-tabs{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}" +
        ".bw-tab{padding:8px 18px;border-radius:999px;border:1px solid var(--dsw-border,#e4e4e7);background:var(--dsw-input,#fff);color:var(--dsw-text-secondary,#71717a);font-size:13px;cursor:pointer}" +
        ".bw-tab-active{background:#6366f1;border-color:#6366f1;color:#fff}" +
        ".bw-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}" +
        ".bw-card{border:1px solid var(--dsw-border,#e4e4e7);border-radius:12px;padding:18px;background:var(--dsw-input,#fff)}" +
        ".bw-card-title{font-size:15px;font-weight:600;color:var(--dsw-text,#18181b);margin-bottom:8px}" +
        ".bw-card-desc{font-size:13px;color:var(--dsw-text-secondary,#71717a);line-height:1.6}",
    );

    function fmtPct(v) {
      if (v === undefined || v === null) return "—";
      var p = (typeof v === "number" ? v : Number(v)) * 100;
      return (isNaN(p) ? 0 : p).toFixed(1) + "%";
    }
    function barColor(p) {
      var n = typeof p === "number" ? p : Number(p);
      if (isNaN(n)) n = 0;
      if (n >= 0.9) return "#ef4444";
      if (n >= 0.7) return "#f59e0b";
      return "#22c55e";
    }
    function fmtTime(t) {
      return t ? new Date(t).toLocaleString() : "—";
    }
    function fmtDays(d) {
      return d === undefined || d === null ? "—" : d + " 天";
    }

    var WELCOME_TABS = [
      {
        id: "rec",
        label: "为我推荐",
        cards: [
          {
            title: "免费额度一键防护",
            desc: "一键开启「用完即停」，免费额度耗尽自动停止调用，不再产生意外扣费",
          },
          {
            title: "API Key 配置诊断",
            desc: "自动排查 401 报错与配置问题，直接给出可用的正确配置",
          },
          {
            title: "账单消费分析",
            desc: "账单按 Key、模型、时间三个维度拆解，钱花在哪一目了然，顺手设置费用告警",
          },
          {
            title: "限流自查与提额",
            desc: "被 429 限流？帮你查清用量水位、定位原因，一键申请提额",
          },
          {
            title: "智能配置监控告警",
            desc: "不知道告警阈值设多少？根据你的历史调用数据自动算出建议值，批量创建规则",
          },
          {
            title: "模型用量统计",
            desc: "各模型的 Token 用量与费用一次查清，自动生成用量分析报告",
          },
        ],
      },
      {
        id: "key",
        label: "密钥与接入",
        cards: [
          {
            title: "API Key 配置诊断",
            desc: "自动排查 401 报错与配置问题，直接给出可用的正确配置",
          },
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
          {
            title: "限流自查与提额",
            desc: "被 429 限流？帮你查清用量水位、定位原因，一键申请提额",
          },
          {
            title: "模型用量统计",
            desc: "各模型的 Token 用量与费用一次查清，自动生成用量分析报告",
          },
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

    exports.inject = ["slots"];
    exports.apply = function (ctx) {
      var slots = ctx.get("slots");
      if (slots === undefined) return;

      // ── Bailian settings section ──
      slots.inject("settings.section", function () {
        return slots.register(
          { name: "settings.section", id: "bailian", label: "Bailian", order: 90 },
          function () {
            var cs = React.useState({ id: "", secret: "", apiKey: "" });
            var cm = React.useState({ type: "", text: "" });
            var cl = React.useState(false);
            var us = React.useState({ region: "cn-beijing", site: "domestic" });
            var ud = React.useState(null);
            var ul = React.useState(false);
            var ue = React.useState("");
            var mc = React.useState({
              userId: "",
              baseUrl: "https://dashscope.aliyuncs.com/api/v2/apps/memory/",
              planVersion: "lite",
              topK: 10,
              autoInject: true,
              autoPersist: true,
              memoryLibraryId: "",
            });
            var mm = React.useState({ type: "", text: "" });
            var ml = React.useState(false);
            var ms = React.useState(null);

            var cred = cs[0],
              setCred = cs[1],
              cmsg = cm[0],
              setCmsg = cm[1],
              cLoading = cl[0],
              setCLoading = cl[1];
            var uForm = us[0],
              setUform = us[1],
              result = ud[0],
              setResult = ud[1],
              uLoading = ul[0],
              setULoading = ul[1],
              uErr = ue[0],
              setUErr = ue[1];
            var memCfg = mc[0],
              setMemCfg = mc[1],
              memMsg = mm[0],
              setMemMsg = mm[1],
              mLoading = ml[0],
              setMLoading = ml[1],
              memStatus = ms[0],
              setMemStatus = ms[1];

            function updC(f, v) {
              var o = {};
              o[f] = v;
              setCred(Object.assign({}, cred, o));
            }
            function updU(f, v) {
              var o = {};
              o[f] = v;
              setUform(Object.assign({}, uForm, o));
            }
            function updM(f, v) {
              var o = {};
              o[f] = v;
              setMemCfg(Object.assign({}, memCfg, o));
            }

            function saveCred() {
              if (!cred.id || !cred.secret) return;
              setCLoading(true);
              setCmsg({ type: "", text: "" });
              jfetch("/api/bailian/credentials", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accessKeyId: cred.id, accessKeySecret: cred.secret }),
              })
                .then(function (d) {
                  var p = ["AK/SK 已存入 bl " + (d.profile || "dsh") + " profile"];
                  if (cred.apiKey) {
                    return jfetch("/api/bailian/memory/config", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ apiKey: cred.apiKey }),
                    })
                      .then(function () {
                        p.push("API Key 已同步到记忆库");
                        return;
                      })
                      .catch(function () {
                        return;
                      });
                  }
                })
                .then(function () {
                  setCmsg({ type: "ok", text: p.join("；") + "。" });
                })
                .catch(function (e) {
                  setCmsg({ type: "err", text: e && e.message ? e.message : String(e) });
                })
                .then(function () {
                  setCLoading(false);
                });
            }

            function fetchUsage() {
              setULoading(true);
              setUErr("");
              setResult(null);
              jfetch("/api/bailian/tokenplan/usage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ region: uForm.region, site: uForm.site }),
              })
                .then(function (r) {
                  setResult(r);
                })
                .catch(function (e) {
                  setUErr(e && e.message ? e.message : String(e));
                })
                .then(function () {
                  setULoading(false);
                });
            }

            function fetchMemStatus() {
              jfetch("/api/bailian/memory/status")
                .then(function (s) {
                  setMemStatus(s);
                  setMemCfg(
                    Object.assign({}, memCfg, {
                      userId: s.userId || memCfg.userId,
                      baseUrl: s.baseUrl || memCfg.baseUrl,
                      planVersion: s.planVersion || memCfg.planVersion,
                      topK: s.topK || memCfg.topK,
                      autoInject: s.autoInject !== undefined ? s.autoInject : memCfg.autoInject,
                      autoPersist: s.autoPersist !== undefined ? s.autoPersist : memCfg.autoPersist,
                    }),
                  );
                })
                .catch(function () {});
            }
            React.useEffect(function () {
              fetchMemStatus();
            }, []);

            function saveMemCfg() {
              setMLoading(true);
              setMemMsg({ type: "", text: "" });
              jfetch("/api/bailian/memory/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(memCfg),
              })
                .then(function (r) {
                  setMemMsg({
                    type: "ok",
                    text: "记忆库配置已保存。API Key " + (r.configured ? "已配置" : "未配置"),
                  });
                })
                .catch(function (e) {
                  setMemMsg({ type: "err", text: e && e.message ? e.message : String(e) });
                })
                .then(function () {
                  setMLoading(false);
                });
            }

            var children = [
              React.createElement("h3", { className: "bl-title", key: "t" }, "阿里云百炼"),
              React.createElement(
                "p",
                { className: "bl-sub", key: "s" },
                "配置阿里云 AK/SK 和 DashScope API Key 后，所有百炼插件共用此凭证。",
              ),
            ];

            var cc = [
              React.createElement("div", { className: "bl-section-title", key: "ct" }, "凭证配置"),
            ];
            cc.push(
              React.createElement(
                "div",
                { className: "bl-field", key: "ci" },
                React.createElement("label", { className: "bl-label" }, "AccessKey ID"),
                React.createElement("input", {
                  className: "bl-input",
                  value: cred.id,
                  onChange: function (e) {
                    updC("id", e.target.value);
                  },
                  placeholder: "LTAI...",
                }),
              ),
            );
            cc.push(
              React.createElement(
                "div",
                { className: "bl-field", key: "cs" },
                React.createElement("label", { className: "bl-label" }, "AccessKey Secret"),
                React.createElement("input", {
                  className: "bl-input",
                  type: "password",
                  value: cred.secret,
                  onChange: function (e) {
                    updC("secret", e.target.value);
                  },
                  placeholder: "••••••••",
                }),
              ),
            );
            cc.push(
              React.createElement(
                "div",
                { className: "bl-field", key: "cak" },
                React.createElement("label", { className: "bl-label" }, "DashScope API Key"),
                React.createElement("input", {
                  className: "bl-input",
                  type: "password",
                  value: cred.apiKey,
                  onChange: function (e) {
                    updC("apiKey", e.target.value);
                  },
                  placeholder: "sk-xxxx（按量付费，记忆库共用）",
                }),
              ),
            );
            cc.push(
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
            if (cmsg.text)
              cc.push(
                React.createElement(
                  "div",
                  { className: "bl-msg bl-msg-" + cmsg.type, key: "cm" },
                  cmsg.text,
                ),
              );
            children.push(React.createElement("div", { className: "bl-section", key: "cred" }, cc));

            var tp = [
              React.createElement(
                "div",
                { className: "bl-section-title", key: "tt" },
                "TokenPlan 用量",
              ),
            ];
            tp.push(
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
                      onChange: function (e) {
                        updU("region", e.target.value);
                      },
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
                      onChange: function (e) {
                        updU("site", e.target.value);
                      },
                    },
                    React.createElement("option", { value: "domestic" }, "国内站"),
                    React.createElement("option", { value: "international" }, "国际站"),
                  ),
                ),
                React.createElement(
                  "button",
                  { className: "bl-btn", onClick: fetchUsage, disabled: uLoading },
                  uLoading ? "查询中..." : "查询用量",
                ),
              ),
            );
            if (uErr)
              tp.push(
                React.createElement("div", { className: "bl-msg bl-msg-err", key: "te" }, uErr),
              );
            if (uLoading)
              tp.push(
                React.createElement(
                  "div",
                  { key: "tl", className: "bl-sub" },
                  "正在调用控制台接口...",
                ),
              );
            if (result) {
              var u = result.usage;
              if (
                u &&
                typeof u === "object" &&
                (u.per5HourPercentage !== undefined || u.per1WeekPercentage !== undefined)
              ) {
                var uc = [
                  React.createElement(
                    "div",
                    { className: "bl-card-title", key: "ut" },
                    "用量百分比",
                  ),
                ];
                if (u.per5HourPercentage !== undefined)
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
                          fmtPct(u.per5HourPercentage),
                        ),
                      ),
                      React.createElement(
                        "div",
                        { className: "bl-bar" },
                        React.createElement("div", {
                          className: "bl-bar-fill",
                          style: {
                            width: fmtPct(u.per5HourPercentage),
                            background: barColor(u.per5HourPercentage),
                          },
                        }),
                      ),
                      React.createElement(
                        "div",
                        { className: "bl-stat" },
                        React.createElement("span", { className: "bl-stat-label" }, "重置时间"),
                        React.createElement(
                          "span",
                          { className: "bl-stat-val" },
                          fmtTime(u.per5HourResetTime),
                        ),
                      ),
                    ),
                  );
                if (u.per1WeekPercentage !== undefined)
                  uc.push(
                    React.createElement(
                      "div",
                      { key: "u1w" },
                      React.createElement(
                        "div",
                        { className: "bl-stat" },
                        React.createElement("span", { className: "bl-stat-label" }, "1 周窗口"),
                        React.createElement(
                          "span",
                          { className: "bl-stat-val" },
                          fmtPct(u.per1WeekPercentage),
                        ),
                      ),
                      React.createElement(
                        "div",
                        { className: "bl-bar" },
                        React.createElement("div", {
                          className: "bl-bar-fill",
                          style: {
                            width: fmtPct(u.per1WeekPercentage),
                            background: barColor(u.per1WeekPercentage),
                          },
                        }),
                      ),
                      React.createElement(
                        "div",
                        { className: "bl-stat" },
                        React.createElement("span", { className: "bl-stat-label" }, "重置时间"),
                        React.createElement(
                          "span",
                          { className: "bl-stat-val" },
                          fmtTime(u.per1WeekResetTime),
                        ),
                      ),
                    ),
                  );
                tp.push(React.createElement("div", { className: "bl-card", key: "uc" }, uc));
              }
              var sub = result.subscription;
              if (sub && typeof sub === "object" && sub.instanceCode) {
                var sm = { lite: "基础版", standard: "标准版", pro: "高级版" };
                var sc = [
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
                tp.push(React.createElement("div", { className: "bl-card", key: "sc" }, sc));
              }
              var ad = result.addonSummary;
              if (ad && typeof ad === "object" && ad.totalCredits !== undefined) {
                var ac = [
                  React.createElement(
                    "div",
                    { className: "bl-card-title", key: "at" },
                    "额外用量包",
                  ),
                ];
                ac.push(
                  React.createElement(
                    "div",
                    { className: "bl-stat", key: "a1" },
                    React.createElement("span", { className: "bl-stat-label" }, "Credits 总量"),
                    React.createElement("span", { className: "bl-stat-val" }, ad.totalCredits),
                  ),
                );
                ac.push(
                  React.createElement(
                    "div",
                    { className: "bl-stat", key: "a2" },
                    React.createElement("span", { className: "bl-stat-label" }, "Credits 剩余"),
                    React.createElement("span", { className: "bl-stat-val" }, ad.remainingCredits),
                  ),
                );
                tp.push(React.createElement("div", { className: "bl-card", key: "ac" }, ac));
              }
              if (result.errors && result.errors.length > 0)
                tp.push(
                  React.createElement(
                    "div",
                    { className: "bl-card", key: "ec" },
                    result.errors.map(function (e, i) {
                      return React.createElement(
                        "div",
                        { key: "e" + i, style: { fontSize: "12px" } },
                        "[" + e.api + "] " + e.message,
                      );
                    }),
                  ),
                );
            }
            children.push(React.createElement("div", { className: "bl-section", key: "tp" }, tp));

            var mem = [
              React.createElement("div", { className: "bl-section-title", key: "mt" }, "记忆库"),
            ];
            if (memStatus)
              mem.push(
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
            mem.push(
              React.createElement(
                "div",
                { className: "bl-field", key: "mu" },
                React.createElement("label", { className: "bl-label" }, "User ID"),
                React.createElement("input", {
                  className: "bl-input",
                  value: memCfg.userId,
                  onChange: function (e) {
                    updM("userId", e.target.value);
                  },
                  placeholder: "留空用系统用户名",
                }),
              ),
            );
            mem.push(
              React.createElement(
                "div",
                { className: "bl-field", key: "mb" },
                React.createElement("label", { className: "bl-label" }, "Base URL"),
                React.createElement("input", {
                  className: "bl-input",
                  value: memCfg.baseUrl,
                  onChange: function (e) {
                    updM("baseUrl", e.target.value);
                  },
                }),
              ),
            );
            mem.push(
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
                      onChange: function (e) {
                        updM("planVersion", e.target.value);
                      },
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
                    onChange: function (e) {
                      updM("topK", Number(e.target.value));
                    },
                  }),
                ),
              ),
            );
            mem.push(
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
                      onChange: function (e) {
                        updM("autoInject", e.target.checked);
                      },
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
                      onChange: function (e) {
                        updM("autoPersist", e.target.checked);
                      },
                      style: { marginRight: "6px" },
                    }),
                    "自动落库",
                  ),
                ),
              ),
            );
            mem.push(
              React.createElement(
                "button",
                { className: "bl-btn", key: "mbtn", onClick: saveMemCfg, disabled: mLoading },
                mLoading ? "保存中..." : "保存记忆配置",
              ),
            );
            if (memMsg.text)
              mem.push(
                React.createElement(
                  "div",
                  { className: "bl-msg bl-msg-" + memMsg.type, key: "mmsg" },
                  memMsg.text,
                ),
              );
            children.push(React.createElement("div", { className: "bl-section", key: "mem" }, mem));

            return React.createElement("div", { className: "bl-wrap" }, children);
          },
        );
      });

      // ── Welcome page on blank sessions ──
      slots.inject("conversation.input.dock", function () {
        return slots.register(
          { name: "conversation.input.dock", id: "bailian-welcome", order: -100 },
          function (props) {
            var session = props && props.session;
            if (!session || session.blank !== true) return null;
            var st = React.useState("rec");
            var tab = st[0],
              setTab = st[1];
            var active = null;
            for (var i = 0; i < WELCOME_TABS.length; i++)
              if (WELCOME_TABS[i].id === tab) active = WELCOME_TABS[i];
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
                WELCOME_TABS.map(function (t) {
                  return React.createElement(
                    "button",
                    {
                      key: t.id,
                      className: "bw-tab" + (t.id === tab ? " bw-tab-active" : ""),
                      onClick: function () {
                        setTab(t.id);
                      },
                    },
                    t.label,
                  );
                }),
              ),
              React.createElement(
                "div",
                { className: "bw-cards" },
                active.cards.map(function (c) {
                  return React.createElement(
                    "div",
                    { key: c.title, className: "bw-card" },
                    React.createElement("div", { className: "bw-card-title" }, c.title),
                    React.createElement("div", { className: "bw-card-desc" }, c.desc),
                  );
                }),
              ),
            );
          },
        );
      });
    };

    return module.exports;
  },
});
