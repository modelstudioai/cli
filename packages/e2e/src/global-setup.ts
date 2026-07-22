import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { parseEnv } from "util";
import { monorepoRoot } from "./monorepo-root.ts";

/** Vitest globalSetup 写入的会话标记文件名 */
export const E2E_RUN_SESSION_FILENAME = ".e2e-run-session";

/**
 * Vitest 在所有 worker 启动前执行一次：加载 `.env` 并写入共享 E2E 输出会话 id。
 */
export default function vitestGlobalSetup(): () => void {
  const root = monorepoRoot();
  const rootEnv = join(root, ".env");
  if (existsSync(rootEnv)) {
    const parsed = parseEnv(readFileSync(rootEnv, "utf8"));
    Object.assign(process.env, parsed);
  } else {
    process.env.BAILIAN_E2E = "1";
    process.env.BAILIAN_E2E_MEDIA = "1";
    process.env.BAILIAN_E2E_VIDEO = "1";
    const envContent = `# 是否开启 E2E 测试
BAILIAN_E2E=1
# 是否开启图片/语音 E2E 测试
BAILIAN_E2E_MEDIA=1
# 是否开启视频 E2E 测试
BAILIAN_E2E_VIDEO=1
# DashScope Base URL
DASHSCOPE_BASE_URL=
# DashScope API Key
DASHSCOPE_API_KEY=
# Alibaba Cloud OpenAPI AccessKey
ALIBABA_CLOUD_ACCESS_KEY_ID=
ALIBABA_CLOUD_ACCESS_KEY_SECRET=
# -------------------------------
BAILIAN_E2E_VIDEO_TASK_ID=b499a8cb-1fc4-4d43-9495-e23c7f78ae0d
# -------------------------------
# Workspace ID
BAILIAN_WORKSPACE_ID=
# -------------------------------
# 知识库检索Agent ID
BAILIAN_E2E_SEARCH_AGENT_ID=
# 知识库问答Agent ID
BAILIAN_E2E_CHAT_AGENT_ID=
`;
    writeFileSync(rootEnv, envContent, "utf8");
  }

  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const dateStr = [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join("-");
  const timeStr = [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join(":");
  const runId = `e2e-run-${dateStr} ${timeStr}`;
  const outDir = join(root, "test", "output");
  mkdirSync(outDir, { recursive: true });
  const marker = join(outDir, E2E_RUN_SESSION_FILENAME);
  writeFileSync(marker, `${runId}\n`, "utf8");
  return () => {
    try {
      unlinkSync(marker);
    } catch {
      /* 忽略 */
    }
  };
}
