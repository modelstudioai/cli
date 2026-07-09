import { describe, expect, test } from "vite-plus/test";
import { join } from "path";
import { isDashScopeE2EReady, parseStdoutJson, runCli, cliPackageRoot } from "./helpers.ts";

/**
 * Fine-tune E2E.
 *
 * The suite exercises command discovery, help text, and the `--dry-run`
 * structured-output path (arg parsing + body construction) with no network
 * dependency. Because `ensureApiKey` runs before every command (see main.ts),
 * these cases are gated by isDashScopeE2EReady() — they are skipped when no
 * DashScope credential is present (e.g. on CI) and run offline when one is.
 * The remote list test is also gated and tolerates both empty accounts and
 * auth/permission failures (see the test comment).
 */

describe.skipIf(!isDashScopeE2EReady())("e2e: finetune (offline)", () => {
  test("finetune 列出子命令", async () => {
    const { stdout, stderr, exitCode } = await runCli(["finetune"]);
    expect(exitCode, stderr).toBe(0);
    const out = `${stdout}\n${stderr}`;
    expect(out).toMatch(/create|list|get|cancel|delete|logs|checkpoints|export|watch|capability/);
  });

  test("finetune create --help 正常退出并展示必填项", async () => {
    const { stderr, exitCode } = await runCli(["finetune", "create", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--model|--datasets/i);
  });

  test("finetune create --dry-run 构造 SFT 默认请求体", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "finetune",
      "create",
      "--model",
      "qwen3-8b",
      "--datasets",
      "file-aaa,file-bbb",
      "--validations",
      "file-ccc",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      body: {
        model: string;
        training_file_ids: string[];
        validation_file_ids: string[];
        training_type: string;
        hyper_parameters: { n_epochs: number };
      };
    }>(stdout);
    expect(data.action).toBe("finetune.create");
    expect(data.body.model).toBe("qwen3-8b");
    expect(data.body.training_file_ids).toEqual(["file-aaa", "file-bbb"]);
    expect(data.body.validation_file_ids).toEqual(["file-ccc"]);
    expect(data.body.training_type).toBe("efficient_sft");
    expect(data.body.hyper_parameters.n_epochs).toBe(3);
  });

  test("finetune create --dry-run 转发训练类型与超参", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "finetune",
      "create",
      "--model",
      "qwen3-8b",
      "--datasets",
      "file-aaa",
      "--training-type",
      "sft-lora",
      "--n-epochs",
      "5",
      "--batch-size",
      "16",
      "--learning-rate",
      "1.6e-5",
      "--max-length",
      "4096",
      "--model-name",
      "my-qwen-sft",
      "--suffix",
      "v1",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      body: {
        training_type: string;
        model_name: string;
        finetuned_output_suffix: string;
        hyper_parameters: {
          n_epochs: number;
          batch_size: number;
          learning_rate: string;
          max_length: number;
        };
      };
    }>(stdout);
    expect(data.body.training_type).toBe("efficient_sft");
    expect(data.body.model_name).toBe("my-qwen-sft");
    expect(data.body.finetuned_output_suffix).toBe("v1");
    // batch_size is forwarded verbatim when within the [8, 1024] server range.
    expect(data.body.hyper_parameters).toEqual({
      n_epochs: 5,
      batch_size: 16,
      learning_rate: "1.6e-5",
      max_length: 4096,
    });
  });

  test.each([
    ["sft", "sft"],
    ["sft-lora", "efficient_sft"],
    ["dpo", "dpo_full"],
    ["dpo-lora", "dpo_lora"],
    ["cpt", "cpt"],
  ])(
    "finetune create --training-type %s 经 profile 映射为 server 类型 %s",
    async (cliType, serverType) => {
      const { stdout, stderr, exitCode } = await runCli([
        "finetune",
        "create",
        "--model",
        "qwen3-8b",
        "--datasets",
        "file-aaa",
        "--training-type",
        cliType,
        "--dry-run",
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ action: string; body: { training_type: string } }>(stdout);
      expect(data.action).toBe("finetune.create");
      expect(data.body.training_type).toBe(serverType);
    },
  );

  test("finetune create --training-type 拒绝不支持的训练类型值", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "finetune",
      "create",
      "--model",
      "qwen3-8b",
      "--datasets",
      "file-aaa",
      "--training-type",
      "cpt-lora",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stdout + stderr).not.toBe(0);
  });

  test("finetune create --dry-run 把本地路径标记为 pending 上传且不发起网络请求", async () => {
    const localPath = join(cliPackageRoot, "tests", "e2e", ".dataset-valid.jsonl");
    const { stdout, stderr, exitCode } = await runCli([
      "finetune",
      "create",
      "--model",
      "qwen3-8b",
      "--datasets",
      `${localPath},file-bbb`,
      "--validations",
      localPath,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      body: { training_file_ids: string[]; validation_file_ids: string[] };
      pending_uploads: { field: string; path: string }[];
    }>(stdout);
    expect(data.action).toBe("finetune.create");
    // Local path preserved verbatim in the body (no upload in dry-run).
    expect(data.body.training_file_ids[0]).toBe(localPath);
    expect(data.body.training_file_ids[1]).toBe("file-bbb");
    expect(data.body.validation_file_ids).toEqual([localPath]);
    // Two pending uploads: training (1 local) + validation (1 local).
    expect(data.pending_uploads).toHaveLength(2);
    expect(data.pending_uploads.map((p) => p.field).sort()).toEqual(["datasets", "validations"]);
  });

  test("finetune create --datasets 为空时拒绝", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "finetune",
      "create",
      "--model",
      "qwen3-8b",
      "--datasets",
      " , ",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stdout + stderr).not.toBe(0);
  });

  test("finetune create 样本数 <= batch_size 时提交前快速失败且不上传", async () => {
    // The fixture has 3 records; the small-file auto-adjust sets batch_size=8,
    // so 3 <= 8 trips the pre-submit gate. The gate fires before any upload,
    // so this is fully offline (no key, no network) — the proof is that the
    // error is the gate message AND no "Uploaded …" line ever appears.
    const localPath = join(cliPackageRoot, "tests", "e2e", ".dataset-valid.jsonl");
    const { stdout, stderr, exitCode } = await runCli([
      "finetune",
      "create",
      "--model",
      "qwen3-8b",
      "--datasets",
      localPath,
      "--output",
      "json",
    ]);
    expect(exitCode, stdout + stderr).not.toBe(0);
    const combined = `${stdout}\n${stderr}`;
    expect(combined).toMatch(/not greater than batch_size/i);
    // Crucially, no upload happened — the gate must fire before the upload step.
    expect(combined).not.toMatch(/Uploaded .* → file-/);
  });

  test("finetune create --batch-size 过小仍按 8 下限比较（不绕过卡口）", async () => {
    // Even with --batch-size 1 (server clamps to 8), 3 samples <= 8 still trips
    // the gate — confirms the gate uses the clamped/effective batch, not the raw.
    const localPath = join(cliPackageRoot, "tests", "e2e", ".dataset-valid.jsonl");
    const { stdout, stderr, exitCode } = await runCli([
      "finetune",
      "create",
      "--model",
      "qwen3-8b",
      "--datasets",
      localPath,
      "--batch-size",
      "1",
      "--output",
      "json",
    ]);
    expect(exitCode, stdout + stderr).not.toBe(0);
    expect(`${stdout}\n${stderr}`).toMatch(/batch_size \(8\)/);
  });

  test.each([
    ["list", ["--status", "RUNNING"]],
    ["get", ["--job-id", "ft-xxx"]],
    ["checkpoints", ["--job-id", "ft-xxx"]],
    ["logs", ["--job-id", "ft-xxx", "--page-size", "50"]],
    ["export", ["--job-id", "ft-xxx", "--checkpoint", "ckpt-3", "--model-name", "m"]],
    ["cancel", ["--job-id", "ft-xxx"]],
    ["delete", ["--job-id", "ft-xxx"]],
    ["watch", ["--job-id", "ft-xxx"]],
    ["capability", ["--model", "qwen3-8b"]],
  ])("finetune %s --dry-run 发出结构化动作", async (sub, extra) => {
    const { stdout, stderr, exitCode } = await runCli([
      "finetune",
      sub,
      ...extra,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ action: string }>(stdout);
    expect(data.action).toBe(`finetune.${sub}`);
  });

  test("finetune create --dry-run 解析多 datasets 中的空白", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "finetune",
      "create",
      "--model",
      "qwen3-8b",
      "--datasets",
      " file-a , ,file-b ",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      body: { training_file_ids: string[] };
    }>(stdout);
    expect(data.body.training_file_ids).toEqual(["file-a", "file-b"]);
  });
});

describe.skipIf(!isDashScopeE2EReady())("e2e: finetune (DashScope)", () => {
  /**
   * 不同开发者的 key 状态不一：可能鉴权失败、可能账号下没有任何微调记录、
   * 也可能受区域/权限限制。因此本用例不假设"有数据"或"调用成功"：
   *   - 成功（exit 0）：响应必须可解析；jobs 可能为空数组或不存在。
   *   - 失败（非零退出）：只要 CLI 把服务端/鉴权错误优雅上抛（stderr 有内容、
   *     而非进程崩溃），即视为通过。
   */
  test("finetune list --output json 优雅返回（空账号或鉴权失败均通过）", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "finetune",
      "list",
      "--page-size",
      "5",
      "--output",
      "json",
    ]);
    if (exitCode === 0) {
      const data = parseStdoutJson<{ data?: { jobs?: unknown[] } }>(stdout);
      expect(data).toBeTruthy();
      if (data.data?.jobs) {
        expect(Array.isArray(data.data.jobs)).toBe(true);
      }
    } else {
      expect(stderr.length).toBeGreaterThan(0);
    }
  }, 60_000);
});
