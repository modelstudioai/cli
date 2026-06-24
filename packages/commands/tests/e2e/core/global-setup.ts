import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { parseEnv } from "util";
import { E2E_RUN_SESSION_FILENAME, monorepoRoot } from "./output-dir.ts";

/**
 * Vitest 在所有 worker 启动前执行一次：写入共享会话 id，使多进程并行时仍共用一个 `test/output/<会话>/`。
 * 结束后删除标记文件，避免非 Vitest 流程误用上一次会话 id。
 */
export default function vitestGlobalSetup(): () => void {
  const rootEnv = join(monorepoRoot(), ".env");
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
