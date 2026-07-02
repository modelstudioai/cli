import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { parseEnv } from "util";
import {
  E2E_RUN_SESSION_FILENAME,
  isDashScopeE2EReady,
  isConsoleE2EReady,
  isKnowledgeE2EReady,
  monorepoRoot,
} from "./helpers.ts";

/**
 * Vitest 在所有 worker 启动前执行一次：写入共享会话 id，使多进程并行时仍共用一个 `test/output/<会话>/`。
 * 结束后删除标记文件，避免非 Vitest 流程误用上一次会话 id。
 */

export default function vitestGlobalSetup(): () => void {
  // 加载根目录 `.env` 合并变量（包含shell 注入）
  const rootEnv = join(monorepoRoot(), ".env");
  if (existsSync(rootEnv)) {
    const parsed = parseEnv(readFileSync(rootEnv, "utf8"));
    Object.assign(process.env, parsed);
  } else {
    process.env.BAILIAN_E2E = "1";
    process.env.BAILIAN_E2E_MEDIA = "1";
    process.env.BAILIAN_E2E_VIDEO = "1";
    // 如根目录不存在 .env，则生成一个 .env
    const envContent = `# 是否开启 E2E 测试
BAILIAN_E2E=1
# 是否开启图片/语音 E2E 测试
BAILIAN_E2E_MEDIA=1
# 是否开启视频 E2E 测试
BAILIAN_E2E_VIDEO=1
# DashScope API Key
DASHSCOPE_API_KEY=
# -------------------------------
BAILIAN_E2E_VIDEO_TASK_ID=b499a8cb-1fc4-4d43-9495-e23c7f78ae0d
# -------------------------------
# 阿里云 AK
ALIBABA_CLOUD_ACCESS_KEY_ID=
# 阿里云 SK
ALIBABA_CLOUD_ACCESS_KEY_SECRET=
# -------------------------------
# 知识库 ID
BAILIAN_WORKSPACE_ID=
# 索引 ID
BAILIAN_E2E_INDEX_ID=
# -------------------------------
    `;
    writeFileSync(rootEnv, envContent, "utf8");
  }

  // === DEBUG: 排查 CI 中 DASHSCOPE_API_KEY 来源 ===
  console.log("\n========== [global-setup] DEBUG ==========");
  console.log("[global-setup] CI =", JSON.stringify(process.env.CI));
  console.log("[global-setup] BAILIAN_E2E =", JSON.stringify(process.env.BAILIAN_E2E));
  console.log("[global-setup] DASHSCOPE_API_KEY =", JSON.stringify(process.env.DASHSCOPE_API_KEY));
  console.log(
    "[global-setup] DASHSCOPE_API_KEY.trim() =",
    JSON.stringify(process.env.DASHSCOPE_API_KEY?.trim()),
  );
  console.log(
    "[global-setup] DASHSCOPE_ACCESS_TOKEN =",
    JSON.stringify(process.env.DASHSCOPE_ACCESS_TOKEN),
  );
  console.log(
    "[global-setup] BAILIAN_E2E_INDEX_ID =",
    JSON.stringify(process.env.BAILIAN_E2E_INDEX_ID),
  );
  console.log("[global-setup] isDashScopeE2EReady() =", isDashScopeE2EReady());
  console.log("[global-setup] isConsoleE2EReady() =", isConsoleE2EReady());
  console.log("[global-setup] isKnowledgeE2EReady() =", isKnowledgeE2EReady());
  try {
    const cfg = JSON.parse(
      readFileSync(join(process.env.HOME || "", ".bailian", "config.json"), "utf8"),
    );
    console.log("[global-setup] ~/.bailian/config.json exists, keys =", Object.keys(cfg));
    console.log("[global-setup] config.api_key length =", cfg.api_key?.length);
  } catch {
    console.log("[global-setup] ~/.bailian/config.json not found or unreadable");
  }
  console.log("========== [global-setup] DEBUG END ==========\n");

  // 创建生成内容目录
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const dateStr = [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join("-");
  const timeStr = [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join(":");
  const runId = `e2e-run-${dateStr} ${timeStr}`;
  const outDir = join(monorepoRoot(), "test", "output");
  mkdirSync(outDir, { recursive: true });
  const marker = join(outDir, E2E_RUN_SESSION_FILENAME);
  writeFileSync(marker, `${runId}\n`, "utf8");
  return () => {
    try {
      unlinkSync(marker);
    } catch {
      /* 忽略：已删或权限等 */
    }
  };
}
