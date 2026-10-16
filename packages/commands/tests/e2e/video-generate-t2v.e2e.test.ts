import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import {
  cliTimeoutPrefix,
  e2eLabelFromMetaUrl,
  isBailianE2EVideoEnabled,
  isDashScopeE2EReady,
  makeE2eOutputDir,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
} from "./helpers.ts";
import { VIDEO_ROUTES } from "./topic-routes.ts";

let isolatedDirectory: string;

beforeEach(() => {
  isolatedDirectory = mkdtempSync(join(tmpdir(), "bl-video-prime-e2e-"));
  writeFileSync(join(isolatedDirectory, "config.json"), "{}");
});

afterEach(() => {
  rmSync(isolatedDirectory, { recursive: true, force: true });
});

function runIsolatedVideoGenerate(args: string[], envOverrides: NodeJS.ProcessEnv = {}) {
  return runCommandE2e(VIDEO_ROUTES, args, {
    BAILIAN_CONFIG_DIR: isolatedDirectory,
    HOME: isolatedDirectory,
    USERPROFILE: isolatedDirectory,
    ...envOverrides,
  });
}

const EMPTY_MODEL_ENV = {
  DASHSCOPE_API_KEY: "",
  DASHSCOPE_BASE_URL: "",
  BAILIAN_WORKSPACE_ID: "",
};

/**
 * Video generate (t2v)：help / 分组不依赖密钥；长任务需视频 E2E + DashScope。
 */

describe("e2e: video generate (t2v)", () => {
  test("video generate --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(VIDEO_ROUTES, [
      "video",
      "generate",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--prime/i);
    expect(stderr).toMatch(/--workspace-id/i);
    expect(stderr).toMatch(/generate|--prompt|--model|download|image/i);
  });

  test("Prime 模式要求显式 --model", async () => {
    const { stderr, exitCode } = await runIsolatedVideoGenerate(
      ["video", "generate", "--prime", "--prompt", "hello"],
      EMPTY_MODEL_ENV,
    );
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--prime.*--model/i);
  });

  test("未启用 Prime 时拒绝 --workspace-id", async () => {
    const { stderr, exitCode } = await runIsolatedVideoGenerate(
      ["video", "generate", "--workspace-id", "ws_test", "--prompt", "hello"],
      EMPTY_MODEL_ENV,
    );
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--workspace-id.*--prime/i);
  });

  test("Prime dry-run 输出 workspace Endpoint 和请求体", async () => {
    const { stdout, stderr, exitCode } = await runIsolatedVideoGenerate(
      [
        "video",
        "generate",
        "--prime",
        "--workspace-id",
        "ws_test",
        "--model",
        "wan3.0-video-prime",
        "--prompt",
        "hello",
        "--dry-run",
        "--output",
        "json",
      ],
      EMPTY_MODEL_ENV,
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ endpoint?: string; request?: { model?: string } }>(stdout);
    expect(data.endpoint).toBe(
      "https://ws_test.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
    );
    expect(data.request?.model).toBe("wan3.0-video-prime");
  });

  test("Prime dry-run 允许自定义 Base URL 覆盖 workspace Endpoint", async () => {
    const { stdout, stderr, exitCode } = await runIsolatedVideoGenerate(
      [
        "video",
        "generate",
        "--prime",
        "--model",
        "wan3.0-video-prime",
        "--prompt",
        "hello",
        "--base-url",
        "https://example.test",
        "--dry-run",
        "--output",
        "json",
      ],
      EMPTY_MODEL_ENV,
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ endpoint?: string }>(stdout);
    expect(data.endpoint).toBe(
      "https://example.test/api/v1/services/aigc/video-generation/video-synthesis",
    );
  });
});

describe.skipIf(!isBailianE2EVideoEnabled() || !isDashScopeE2EReady())(
  "e2e: video generate (t2v)（DashScope 视频）",
  () => {
    test("video generate 缺少 --prompt 时报用法错误并退出 (2)", async () => {
      const { stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
        "video",
        "generate",
        ...cliTimeoutPrefix(),
        "--model",
        "wan3.0-video",
      ]);
      expect(exitCode).toBe(2);
      expect(stderr).toMatch(/--prompt|Usage:/i);
    });

    test("video generate --dry-run（无 --image）仅输出 request 且不调生成接口", async () => {
      const { stdout, stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
        "video",
        "generate",
        "--dry-run",
        ...cliTimeoutPrefix(),
        "--prompt",
        "干跑校验",
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ request?: { model?: string; input?: { prompt?: string } } }>(
        stdout,
      );
      expect(data.request?.model).toBe("wan3.0-video");
      expect(data.request?.input?.prompt).toBe("干跑校验");
    });

    test("【wan3.0-video】文本生成视频", async () => {
      const outDir = makeE2eOutputDir(e2eLabelFromMetaUrl(import.meta.url));
      const { stdout, stderr, exitCode } = await runCommandE2e(VIDEO_ROUTES, [
        "video",
        "generate",
        ...cliTimeoutPrefix(),
        "--model",
        "wan3.0-video",
        "--prompt",
        "夕阳下海面波光，远景静态镜头",
        "--download",
        join(outDir, "e2e-video-t2v.mp4"),
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ status?: string; video_url?: string }>(stdout);
      expect(data.status).toBe("SUCCEEDED");
      expect(data.video_url?.startsWith("https://")).toBe(true);
    }, 3_600_000);
  },
);
