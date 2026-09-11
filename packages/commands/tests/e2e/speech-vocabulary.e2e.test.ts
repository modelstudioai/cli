import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import {
  e2eLabelFromMetaUrl,
  isBailianE2EMediaEnabled,
  isDashScopeE2EReady,
  makeE2eOutputDir,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
} from "./helpers.ts";
import { SPEECH_ROUTES } from "./topic-routes.ts";

/**
 * Speech vocabulary：help / dry-run / 确认闸门无密钥；真实 CRUD 需媒体 E2E + DashScope。
 */

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

function makeTempJson(content: string): string {
  const tempDir = mkdtempSync(join(tmpdir(), "bl-vocab-e2e-"));
  tempDirs.push(tempDir);
  const filePath = join(tempDir, "hotwords.json");
  writeFileSync(filePath, content);
  return filePath;
}

describe("e2e: speech vocabulary", () => {
  test("speech vocabulary --help 列出 5 个子命令", async () => {
    const { stderr, exitCode } = await runCommandHelp(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/create/i);
    expect(stderr).toMatch(/list/i);
    expect(stderr).toMatch(/get/i);
    expect(stderr).toMatch(/update/i);
    expect(stderr).toMatch(/delete/i);
  });

  test("create --help 展示关键 flags 与静默失效 / weight 50 文案", async () => {
    const { stderr, exitCode } = await runCommandHelp(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "create",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--model/i);
    expect(stderr).toMatch(/--prefix/i);
    expect(stderr).toMatch(/--words/i);
    expect(stderr).toMatch(/--words-file/i);
    expect(stderr).toMatch(/silently ignored|静默失效/i);
    expect(stderr).toMatch(/50/);
  });

  test("delete --help 展示 Risk 与 --yes", async () => {
    const { stderr, exitCode } = await runCommandHelp(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "delete",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--yes/i);
    expect(stderr).toMatch(/Risk|风险/i);
  });

  test("update --help 展示 Risk、replace 语义与 --yes", async () => {
    const { stderr, exitCode } = await runCommandHelp(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "update",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--yes/i);
    expect(stderr).toMatch(/Risk|风险/i);
    expect(stderr).toMatch(/replaces|替换/i);
  });

  test("create 缺少 --model 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "create",
      "--prefix",
      "demo",
      "--words",
      '{"x":4}',
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--model|Missing required/i);
  });

  test("create 缺少 --prefix 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "create",
      "--model",
      "fun-asr",
      "--words",
      '{"x":4}',
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--prefix|Missing required/i);
  });

  test("create 两个词表 flag 都不传时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "create",
      "--model",
      "fun-asr",
      "--prefix",
      "demo",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--words|--words-file/i);
  });

  test("create 同时传 --words 与 --words-file 时退出为用法错误 (2)", async () => {
    const filePath = makeTempJson('{"x":4}');
    const { stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "create",
      "--model",
      "fun-asr",
      "--prefix",
      "demo",
      "--words",
      '{"x":4}',
      "--words-file",
      filePath,
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/either|--words|--words-file/i);
  });

  test("create 非法 JSON 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "create",
      "--model",
      "fun-asr",
      "--prefix",
      "demo",
      "--words",
      "{bad json",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/not valid JSON|JSON/i);
  });

  test("create 字符串权重时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "create",
      "--model",
      "fun-asr",
      "--prefix",
      "demo",
      "--words",
      '{"x":"4"}',
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/must be a number|number/i);
  });

  test("create 空词表 {} 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "create",
      "--model",
      "fun-asr",
      "--prefix",
      "demo",
      "--words",
      "{}",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/at least one|hot word/i);
  });

  test("get 缺少 --id 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "get",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--id|Missing required/i);
  });

  test("delete 缺少 --id 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "delete",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--id|Missing required/i);
  });

  test("create object 形态 --dry-run 输出 speech-biasing 信封", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "create",
      "--model",
      "fun-asr",
      "--prefix",
      "demo",
      "--words",
      '{"奋斗者":4,"鲸落":4}',
      "--dry-run",
      "--output",
      "json",
      "--quiet",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      request?: {
        model?: string;
        input?: {
          action?: string;
          target_model?: string;
          prefix?: string;
          vocabulary?: Array<{ text?: string; weight?: number; lang?: string }>;
        };
      };
    }>(stdout);
    expect(body.request?.model).toBe("speech-biasing");
    expect(body.request?.input?.action).toBe("create_vocabulary");
    expect(body.request?.input?.target_model).toBe("fun-asr");
    expect(body.request?.input?.prefix).toBe("demo");
    expect(body.request?.input?.vocabulary).toEqual([
      { text: "奋斗者", weight: 4 },
      { text: "鲸落", weight: 4 },
    ]);
  });

  test("create array 形态 --dry-run 原样透传 lang", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "create",
      "--model",
      "fun-asr",
      "--prefix",
      "demo",
      "--words",
      '[{"text":"x","weight":4,"lang":"zh"}]',
      "--dry-run",
      "--output",
      "json",
      "--quiet",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      request?: {
        input?: { vocabulary?: Array<{ text?: string; weight?: number; lang?: string }> };
      };
    }>(stdout);
    expect(body.request?.input?.vocabulary).toEqual([{ text: "x", weight: 4, lang: "zh" }]);
  });

  test("create object + --lang --dry-run 下发到每一条", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "create",
      "--model",
      "fun-asr",
      "--prefix",
      "demo",
      "--words",
      '{"x":4}',
      "--lang",
      "zh",
      "--dry-run",
      "--output",
      "json",
      "--quiet",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      request?: {
        input?: { vocabulary?: Array<{ text?: string; weight?: number; lang?: string }> };
      };
    }>(stdout);
    expect(body.request?.input?.vocabulary).toEqual([{ text: "x", weight: 4, lang: "zh" }]);
  });

  test("create --words-file --dry-run 读取文件", async () => {
    const filePath = makeTempJson('{"from-file":4}');
    const { stdout, stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "create",
      "--model",
      "fun-asr",
      "--prefix",
      "demo",
      "--words-file",
      filePath,
      "--dry-run",
      "--output",
      "json",
      "--quiet",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      request?: {
        input?: { vocabulary?: Array<{ text?: string; weight?: number }> };
      };
    }>(stdout);
    expect(body.request?.input?.vocabulary).toEqual([{ text: "from-file", weight: 4 }]);
  });

  test("list --page 2 --dry-run 将 page_index 转为 1", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "list",
      "--page",
      "2",
      "--dry-run",
      "--output",
      "json",
      "--quiet",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      request?: { input?: { action?: string; page_index?: number } };
    }>(stdout);
    expect(body.request?.input?.action).toBe("list_vocabulary");
    expect(body.request?.input?.page_index).toBe(1);
  });

  test("get --dry-run 使用 query_vocabulary", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "get",
      "--id",
      "vocab-x",
      "--dry-run",
      "--output",
      "json",
      "--quiet",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      request?: { input?: { action?: string; vocabulary_id?: string } };
    }>(stdout);
    expect(body.request?.input?.action).toBe("query_vocabulary");
    expect(body.request?.input?.vocabulary_id).toBe("vocab-x");
  });

  test("update --dry-run 无 --yes 也能预览", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "update",
      "--id",
      "vocab-x",
      "--words",
      '{"x":4}',
      "--dry-run",
      "--output",
      "json",
      "--quiet",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      request?: {
        input?: {
          action?: string;
          vocabulary_id?: string;
          vocabulary?: Array<{ text?: string; weight?: number }>;
        };
      };
    }>(stdout);
    expect(body.request?.input?.action).toBe("update_vocabulary");
    expect(body.request?.input?.vocabulary_id).toBe("vocab-x");
    expect(body.request?.input?.vocabulary).toEqual([{ text: "x", weight: 4 }]);
  });

  test("delete --dry-run 无 --yes 也能预览", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "delete",
      "--id",
      "vocab-x",
      "--dry-run",
      "--output",
      "json",
      "--quiet",
    ]);
    expect(exitCode, stderr).toBe(0);
    const body = parseStdoutJson<{
      request?: { input?: { action?: string; vocabulary_id?: string } };
    }>(stdout);
    expect(body.request?.input?.action).toBe("delete_vocabulary");
    expect(body.request?.input?.vocabulary_id).toBe("vocab-x");
  });
});

describe("e2e: speech vocabulary high-risk confirmation", () => {
  test("delete 无 --yes 返回确认请求 (7)", async () => {
    const { stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "delete",
      "--id",
      "vocab-x",
      "--api-key",
      "e2e-dummy-key",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(7);
    expect(JSON.parse(stderr)).toMatchObject({
      error: { code: 7, type: "requires_confirmation" },
    });
  });

  test("update 无 --yes 返回确认请求 (7)", async () => {
    const { stderr, exitCode } = await runCommandE2e(SPEECH_ROUTES, [
      "speech",
      "vocabulary",
      "update",
      "--id",
      "vocab-x",
      "--words",
      '{"x":4}',
      "--api-key",
      "e2e-dummy-key",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(7);
    expect(JSON.parse(stderr)).toMatchObject({
      error: { code: 7, type: "requires_confirmation" },
    });
  });
});

describe.skipIf(!isBailianE2EMediaEnabled() || !isDashScopeE2EReady())(
  "e2e: speech vocabulary（DashScope 媒体）",
  () => {
    test("create → list/get → delete 完整链路", async () => {
      const outDir = makeE2eOutputDir(e2eLabelFromMetaUrl(import.meta.url));
      let vocabularyId = "";

      try {
        const created = await runCommandE2e(SPEECH_ROUTES, [
          "speech",
          "vocabulary",
          "create",
          "--model",
          "fun-asr",
          "--prefix",
          "blcli",
          "--words",
          '{"奋斗者":4}',
          "--quiet",
        ]);
        expect(created.exitCode, created.stderr).toBe(0);
        vocabularyId = created.stdout.trim();
        expect(vocabularyId.length).toBeGreaterThan(0);
        writeFileSync(join(outDir, "vocabulary-id.txt"), vocabularyId + "\n");

        const listed = await runCommandE2e(SPEECH_ROUTES, [
          "speech",
          "vocabulary",
          "list",
          "--prefix",
          "blcli",
          "--output",
          "json",
        ]);
        expect(listed.exitCode, listed.stderr).toBe(0);
        const listBody = parseStdoutJson<{
          output?: { vocabulary_list?: Array<{ vocabulary_id?: string; status?: string }> };
        }>(listed.stdout);
        const listedItem = listBody.output?.vocabulary_list?.find(
          (item) => item.vocabulary_id === vocabularyId,
        );
        expect(listedItem).toBeTruthy();
        expect(listedItem?.status).toBe("OK");

        const got = await runCommandE2e(SPEECH_ROUTES, [
          "speech",
          "vocabulary",
          "get",
          "--id",
          vocabularyId,
          "--output",
          "json",
        ]);
        expect(got.exitCode, got.stderr).toBe(0);
        const getBody = parseStdoutJson<{
          output?: { status?: string; target_model?: string };
        }>(got.stdout);
        expect(getBody.output?.status).toBe("OK");
        expect(getBody.output?.target_model).toBe("fun-asr");
      } finally {
        if (vocabularyId) {
          const deleted = await runCommandE2e(SPEECH_ROUTES, [
            "speech",
            "vocabulary",
            "delete",
            "--id",
            vocabularyId,
            "--yes",
            "--quiet",
          ]);
          expect(deleted.exitCode, deleted.stderr).toBe(0);
        }
      }
    }, 120_000);
  },
);
