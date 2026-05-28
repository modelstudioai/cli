/**
 * 在目标页面（例如 https://bailian.console.aliyun.com/...）打开 DevTools → Console，
 * 将本文件全文粘贴回车执行；按提示输入 bl 监听的本机端口（127.0.0.1:PORT）。
 *
 * 用于观察：当前 HTTPS 页面能否对 http://127.0.0.1:PORT 发起请求（混合内容 / CORS 等）。
 *
 * 注意：控制台里若报 Failed to fetch / NetworkError，常见是混合内容被拦截，与 CLI 服务是否正常无关。
 */
void (async () => {
  const portStr = window.prompt("请输入本机监听端口（数字，例如 54321）");
  if (portStr === null) {
    console.log("[probe] 已取消");
    return;
  }
  const port = parseInt(portStr.trim(), 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    console.error("[probe] 无效端口:", portStr);
    return;
  }

  const base = `http://127.0.0.1:${port}`;
  const url = `${base}/`;

  console.log("[probe] 当前页面:", location.href);
  console.log("[probe] 目标 URL:", url);

  // 1) 普通 GET（会走 CORS；若混合内容被拦，通常在这里失败）
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    const text = await res.text();
    console.log("[probe] GET 成功 status=", res.status, "body前200字=", text.slice(0, 200));
  } catch (e) {
    console.error("[probe] GET 失败:", e?.name, e?.message, e);
  }

  // 2) no-cors：不读响应体；若仍失败，多为混合内容等
  try {
    const res = await fetch(url, { method: "GET", mode: "no-cors", cache: "no-store" });
    console.log("[probe] no-cors GET 完成 opaque type=", res.type, "status(常为0)=", res.status);
  } catch (e) {
    console.error("[probe] no-cors GET 失败:", e?.name, e?.message, e);
  }
})();
