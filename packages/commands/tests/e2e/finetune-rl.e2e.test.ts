import { describe, expect, test } from "vite-plus/test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isConsoleE2EReady,
  isDashScopeE2EReady,
  parseStdoutJson,
  runCommandHelp,
  runCommandInProcess,
} from "./helpers.ts";
import { FINETUNE_ROUTES } from "./topic-routes.ts";

// A dummy key keeps the offline cases hermetic; the confirmation gate runs
// before auth, and dry-run swallows credential resolution for these commands.
const DUMMY_KEY = ["--api-key", "e2e-dummy-key"];

describe("e2e: finetune rl/opd/runtime help", () => {
  test("rl group lists the job subcommands", async () => {
    const { stderr, exitCode } = await runCommandHelp(FINETUNE_ROUTES, [
      "finetune",
      "rl",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/run|get|list|watch|logs|cancel|delete|authorize/);
  });

  test("rl run help exposes the confirmation gate and execution flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(FINETUNE_ROUTES, [
      "finetune",
      "rl",
      "run",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--yes/);
    expect(stderr).toMatch(/--model/);
    expect(stderr).toMatch(/--watch/);
    expect(stderr).toMatch(/--wait-timeout/);
    expect(stderr).toMatch(/--config-file/);
    expect(stderr).toMatch(/--install-runtime/);
  });

  test("opd run help exposes the OpenAPI contract, not the RL sandbox flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "run",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--teacher-model/);
    expect(stderr).toMatch(/--base-model/);
    expect(stderr).toMatch(/--datasets/);
    expect(stderr).toMatch(/--hyper-parameters-file/);
    expect(stderr).toMatch(/--resource-config-file/);
    expect(stderr).toMatch(/--hp/);
    expect(stderr).toMatch(/--workspace-id/);
    expect(stderr).toMatch(/--yes/);
    expect(stderr).not.toMatch(/--rollout|--code-dir|--install-runtime|--config-file/);
  });

  test("opd group lists the job subcommands", async () => {
    const { stderr, exitCode } = await runCommandHelp(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/run|params|get|watch|logs|cancel|delete|authorize/);
    // Listing is shared with finetune list; opd has no list subcommand.
    expect(stderr).not.toMatch(/^\s*list\b/m);
  });

  test("opd params help exposes the parameter-group flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "params",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--base-model/);
    expect(stderr).toMatch(/--param-type/);
    expect(stderr).toMatch(/--mtu-spec-code/);
  });

  test("opd watch help exposes follow/interval/poll-timeout", async () => {
    const { stderr, exitCode } = await runCommandHelp(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "watch",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--follow/);
    expect(stderr).toMatch(/--interval/);
    expect(stderr).toMatch(/--poll-timeout/);
  });

  test("rl authorize help exposes --authorize and the injected --yes", async () => {
    const { stderr, exitCode } = await runCommandHelp(FINETUNE_ROUTES, [
      "finetune",
      "rl",
      "authorize",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--authorize/);
    expect(stderr).toMatch(/--yes/);
  });

  test("opd authorize help exposes --authorize and the injected --yes", async () => {
    const { stderr, exitCode } = await runCommandHelp(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "authorize",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--authorize/);
    expect(stderr).toMatch(/--yes/);
  });

  test("rl watch help exposes follow/interval/poll-timeout", async () => {
    const { stderr, exitCode } = await runCommandHelp(FINETUNE_ROUTES, [
      "finetune",
      "rl",
      "watch",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--follow/);
    expect(stderr).toMatch(/--interval/);
    expect(stderr).toMatch(/--poll-timeout/);
  });

  test("runtime prepare help exits cleanly and shows --manifest", async () => {
    const { stderr, exitCode } = await runCommandHelp(FINETUNE_ROUTES, [
      "finetune",
      "runtime",
      "prepare",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--manifest/);
  });

  test("runtime doctor help exits cleanly", async () => {
    const { stderr, exitCode } = await runCommandHelp(FINETUNE_ROUTES, [
      "finetune",
      "runtime",
      "doctor",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
  });
});

describe("e2e: finetune rl/opd offline contracts", () => {
  test("rl run without --yes requires confirmation (7)", async () => {
    const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "rl",
      "run",
      "--model",
      "qwen3.5-9b",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(7);
    expect(JSON.parse(stderr)).toMatchObject({
      error: { code: 7, type: "requires_confirmation" },
    });
  });

  test("rl run dry-run without a base model is a usage error (2)", async () => {
    const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "rl",
      "run",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/model/i);
  });

  test("rl run dry-run previews a reinforcement spec with no writes", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "rl",
      "run",
      "--model",
      "qwen3.5-9b",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      model: string;
      training_type: string;
      is_opd: boolean;
      has_functions: boolean;
      watch: boolean;
    }>(stdout);
    expect(data.action).toBe("finetune.rl.run");
    expect(data.model).toBe("qwen3.5-9b");
    expect(data.training_type).toBe("reinforcement");
    expect(data.is_opd).toBe(false);
    expect(data.has_functions).toBe(false);
    expect(data.watch).toBe(false);
  });

  test("opd run without --yes requires confirmation (7)", async () => {
    const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "run",
      "--base-model",
      "qwen3.5-9b",
      "--teacher-model",
      "qwen3.5-397b-a17b",
      "--datasets",
      "file-train",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(7);
    expect(JSON.parse(stderr)).toMatchObject({
      error: { code: 7, type: "requires_confirmation" },
    });
  });

  test("opd run dry-run without --teacher-model is a usage error (2)", async () => {
    const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "run",
      "--base-model",
      "qwen3.5-9b",
      "--datasets",
      "file-train",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/teacher-model/i);
  });

  test("opd run dry-run without --datasets is a usage error (2)", async () => {
    const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "run",
      "--base-model",
      "qwen3.5-9b",
      "--teacher-model",
      "qwen3.5-397b-a17b",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/datasets/i);
  });

  test("opd run dry-run builds the pg_opd OpenAPI body with dataset descriptors", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "run",
      "--base-model",
      "qwen3.5-9b",
      "--teacher-model",
      "qwen3.5-397b-a17b",
      "--datasets",
      "file-train",
      "--validations",
      "file-val",
      "--mtu-spec",
      "MTU4",
      "--mtu-count",
      "16",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      watch: boolean;
      body: {
        model: string;
        training_type: string;
        teacher_model: string;
        training_datasets: Array<{ type: string; data_source_type: string; file_id: string }>;
        validation_datasets: Array<{ type: string; data_source_type: string; file_id: string }>;
        resource_config: Record<string, unknown>;
      };
    }>(stdout);
    expect(data.action).toBe("finetune.opd.run");
    expect(data.watch).toBe(false);
    expect(data.body.model).toBe("qwen3.5-9b");
    expect(data.body.training_type).toBe("pg_opd");
    expect(data.body.teacher_model).toBe("qwen3.5-397b-a17b");
    expect(data.body.training_datasets).toEqual([
      { type: "training", data_source_type: "file_id", file_id: "file-train" },
    ]);
    expect(data.body.validation_datasets).toEqual([
      { type: "validation", data_source_type: "file_id", file_id: "file-val" },
    ]);
    // charge_type defaults locally; MTU fields come from the flags.
    expect(data.body.resource_config).toEqual({
      charge_type: "mtu_postpaid",
      mtu_spec_code: "MTU4",
      mtu_capacity: 16,
    });
    // No student layout fields -> default-layout capacity advisory.
    expect(stderr).toMatch(/OPD_DEFAULT_LAYOUT_CAPACITY/);
  });

  test("opd run dry-run reproduces the historical baseline body from JSON files", async () => {
    const hyperFile = fileURLToPath(
      new URL("./fixtures/opd-hyper-parameters.json", import.meta.url),
    );
    const resourceFile = fileURLToPath(
      new URL("./fixtures/opd-resource-config.json", import.meta.url),
    );
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "run",
      "--base-model",
      "qwen3.5-9b",
      "--teacher-model",
      "qwen3.8-flash",
      "--datasets",
      "file-train-placeholder",
      "--validations",
      "file-val-placeholder",
      "--hyper-parameters-file",
      hyperFile,
      "--resource-config-file",
      resourceFile,
      "--job-name",
      "e2e-opd-baseline",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ body: Record<string, unknown> }>(stdout);
    // Historical 9B←Flash success baseline (placeholder file IDs; job_name is
    // the only intentionally different field).
    expect(data.body).toEqual({
      model: "qwen3.5-9b",
      training_type: "pg_opd",
      teacher_model: "qwen3.8-flash",
      training_datasets: [
        { type: "training", data_source_type: "file_id", file_id: "file-train-placeholder" },
      ],
      validation_datasets: [
        { type: "validation", data_source_type: "file_id", file_id: "file-val-placeholder" },
      ],
      hyper_parameters: {
        n_epochs: 1,
        n_rollouts: 4,
        learning_rate: "1e-6",
        eval_steps: 50,
        ppo_mini_batch_size: 16,
        kl_loss_coef: 0,
        lr_scheduler_type: "cosine",
        algorithm: "gspo",
        batch_size: 64,
        max_prompt_length: 15360,
        max_length: 16384,
        nnodes_training: 1,
        nnodes_rollout: 1,
        n_gpus_training: 4,
        n_gpus_rollout: 2,
        save_strategy: "steps",
        save_steps: 50,
        save_total_limit: 1,
        lr_warmup_steps: -1,
        tensor_model_parallel_size: 4,
        inference_tensor_parallel_size: 2,
      },
      resource_config: { charge_type: "mtu_postpaid", mtu_spec_code: "MTU4", mtu_capacity: 16 },
      job_name: "e2e-opd-baseline",
    });
  });

  test("opd run dry-run: --hp and resource flags override the JSON files", async () => {
    const hyperFile = fileURLToPath(
      new URL("./fixtures/opd-hyper-parameters.json", import.meta.url),
    );
    const resourceFile = fileURLToPath(
      new URL("./fixtures/opd-resource-config.json", import.meta.url),
    );
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "run",
      "--base-model",
      "qwen3.5-9b",
      "--teacher-model",
      "qwen3.8-flash",
      "--datasets",
      "file-train",
      "--hyper-parameters-file",
      hyperFile,
      "--resource-config-file",
      resourceFile,
      "--hp",
      "batch_size=128",
      "--hp",
      "opd_teacher_num_replicas=2",
      "--mtu-count",
      "24",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      body: {
        hyper_parameters: Record<string, unknown>;
        resource_config: Record<string, unknown>;
      };
    }>(stdout);
    expect(data.body.hyper_parameters.batch_size).toBe(128);
    expect(data.body.hyper_parameters.opd_teacher_num_replicas).toBe(2);
    // Untouched file values survive the merge.
    expect(data.body.hyper_parameters.max_length).toBe(16384);
    expect(data.body.resource_config).toEqual({
      charge_type: "mtu_postpaid",
      mtu_spec_code: "MTU4",
      mtu_capacity: 24,
    });
  });

  test("opd run rejects a non-mtu charge_type flag with a usage error (2)", async () => {
    const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "run",
      "--base-model",
      "qwen3.5-9b",
      "--teacher-model",
      "qwen3.8-flash",
      "--datasets",
      "file-train",
      "--charge-type",
      "postpaid",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/mtu_postpaid/);
  });

  test("opd run rejects a non-mtu charge_type from the resource file with a usage error (2)", async () => {
    const root = mkdtempSync(join(tmpdir(), "bl-opd-charge-e2e-"));
    const resourceFile = join(root, "resource.json");
    writeFileSync(resourceFile, JSON.stringify({ charge_type: "prepaid", mtu_capacity: 16 }));
    try {
      const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
        "finetune",
        "opd",
        "run",
        "--base-model",
        "qwen3.5-9b",
        "--teacher-model",
        "qwen3.8-flash",
        "--datasets",
        "file-train",
        "--resource-config-file",
        resourceFile,
        "--dry-run",
        ...DUMMY_KEY,
        "--output",
        "json",
      ]);
      expect(exitCode).toBe(2);
      expect(stderr).toMatch(/mtu_postpaid/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("opd run without MTU fields is a usage error before upload (2)", async () => {
    const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "run",
      "--base-model",
      "qwen3.5-9b",
      "--teacher-model",
      "qwen3.8-flash",
      "--datasets",
      "file-train",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/mtu_spec_code/);
    expect(stderr).toMatch(/mtu_capacity/);
  });

  test("opd run with --mtu-spec but no capacity is a usage error (2)", async () => {
    const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "run",
      "--base-model",
      "qwen3.5-9b",
      "--teacher-model",
      "qwen3.8-flash",
      "--datasets",
      "file-train",
      "--mtu-spec",
      "MTU4",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/mtu_capacity/);
    expect(stderr).not.toMatch(/mtu_spec_code/);
  });

  test("opd run rejects mismatched teacher TP and GPUs per node (2)", async () => {
    const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "run",
      "--base-model",
      "qwen3.5-9b",
      "--teacher-model",
      "qwen3.8-flash",
      "--datasets",
      "file-train",
      "--mtu-spec",
      "MTU4",
      "--mtu-count",
      "24",
      "--hp",
      "opd_teacher_infer_tp=4",
      "--hp",
      "opd_teacher_n_gpus_per_node=8",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/opd_teacher_infer_tp/);
  });

  test("opd run accepts equal teacher TP and GPUs per node", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "run",
      "--base-model",
      "qwen3.5-9b",
      "--teacher-model",
      "qwen3.8-flash",
      "--datasets",
      "file-train",
      "--mtu-spec",
      "MTU4",
      "--mtu-count",
      "24",
      "--hp",
      "opd_teacher_infer_tp=8",
      "--hp",
      "opd_teacher_n_gpus_per_node=8",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson(stdout)).toMatchObject({ action: "finetune.opd.run" });
  });

  test("opd run warns when student lengths exceed the explicit teacher limit", async () => {
    const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "run",
      "--base-model",
      "qwen3.5-9b",
      "--teacher-model",
      "qwen3.8-flash",
      "--datasets",
      "file-train",
      "--mtu-spec",
      "MTU4",
      "--mtu-count",
      "24",
      "--hp",
      "opd_teacher_max_model_len=16385",
      "--hp",
      "max_length=33792",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toMatch(/OPD_LENGTH_EXCEEDS_TEACHER/);
  });

  test("opd run warns when the student/teacher pair is not published", async () => {
    const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "run",
      "--base-model",
      "qwen3.5-9b",
      "--teacher-model",
      "qwen3.5-2b",
      "--datasets",
      "file-train",
      "--mtu-spec",
      "MTU4",
      "--mtu-count",
      "24",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toMatch(/OPD_PAIR_NOT_PUBLISHED/);
  });

  test("opd run rejects a zero-step configuration before upload (2)", async () => {
    const trainFile = fileURLToPath(new URL("./fixtures/opd-train-12.jsonl", import.meta.url));
    const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "run",
      "--base-model",
      "qwen3.5-9b",
      "--teacher-model",
      "qwen3.5-397b-a17b",
      "--datasets",
      trainFile,
      "--mtu-spec",
      "MTU4",
      "--mtu-count",
      "24",
      "--hp",
      "batch_size=64",
      "--hp",
      "n_epochs=1",
      "--yes",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/training steps/i);
    expect(stderr).toMatch(/lr_decay_steps/);
    expect(stderr).not.toMatch(/Uploaded/);
  });

  test("opd run rejects ppo_mini_batch_size above batch_size × n_rollouts (2)", async () => {
    const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "run",
      "--base-model",
      "qwen3.5-9b",
      "--teacher-model",
      "qwen3.5-397b-a17b",
      "--datasets",
      "file-train",
      "--mtu-spec",
      "MTU4",
      "--mtu-count",
      "24",
      "--hp",
      "batch_size=64",
      "--hp",
      "n_rollouts=4",
      "--hp",
      "ppo_mini_batch_size=300",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/ppo_mini_batch_size/);
  });

  test("opd run warns when the sample count is unknown (file-id datasets)", async () => {
    const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "run",
      "--base-model",
      "qwen3.5-9b",
      "--teacher-model",
      "qwen3.5-397b-a17b",
      "--datasets",
      "file-train",
      "--mtu-spec",
      "MTU4",
      "--mtu-count",
      "24",
      "--hp",
      "batch_size=64",
      "--hp",
      "n_epochs=1",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toMatch(/OPD_BATCH_FIT_UNKNOWN/);
  });

  test("opd batch-fit helpers compute steps, minimum samples, and the mini-batch limit", async () => {
    const { computeOpdBatchFit, opdMiniBatchLimit } =
      await import("../../src/commands/finetune/opd-batch-fit.ts");
    expect(computeOpdBatchFit({ batch_size: 64, n_epochs: 1 }, 12)).toMatchObject({
      steps: 0,
      requiredSamples: 64,
    });
    expect(computeOpdBatchFit({ batch_size: 64, n_epochs: 1 }, 96)).toMatchObject({
      steps: 1,
      requiredSamples: 64,
    });
    expect(computeOpdBatchFit({ batch_size: 64, n_epochs: 3 }, 22)).toMatchObject({
      steps: 1,
      requiredSamples: 22,
    });
    expect(
      computeOpdBatchFit(
        { batch_size: "64", n_epochs: "1" } as unknown as Parameters<typeof computeOpdBatchFit>[0],
        12,
      ).steps,
    ).toBe(0);
    expect(computeOpdBatchFit({ batch_size: 64 }, 96).steps).toBeUndefined();
    expect(computeOpdBatchFit({ batch_size: 64 }, 96).requiredSamples).toBeUndefined();
    expect(computeOpdBatchFit({ batch_size: 64, n_epochs: 1 }).steps).toBeUndefined();
    expect(opdMiniBatchLimit({ ppo_mini_batch_size: 16, batch_size: 64, n_rollouts: 4 })).toEqual({
      miniBatchSize: 16,
      limit: 256,
    });
    expect(opdMiniBatchLimit({ ppo_mini_batch_size: 16, batch_size: 64 })).toBeUndefined();
  });

  test("opd run emits warmup/interval warnings before the upload attempt", async () => {
    // Loopback schema server: the batch-fit warnings must surface before any
    // upload; the upload itself hits the mock 404 and fails (no real network).
    const { createServer } = await import("node:http");
    const schemaRows = [
      "batch_size",
      "n_epochs",
      "eval_steps",
      "save_steps",
      "lr_warmup_steps",
    ].map((name) => ({
      name,
      type: "intInputNumber",
      data_range: ["-1", "1000000"],
      editable: true,
    }));
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      response.setHeader("content-type", "application/json");
      if (url.pathname === "/api/v1/fine-tunes/fine-tunes-params") {
        response.end(JSON.stringify({ output: { hyper_params: schemaRows } }));
        return;
      }
      response.statusCode = 404;
      response.end('{"message":"unexpected path"}');
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a local TCP server.");
    try {
      const trainFile = fileURLToPath(new URL("./fixtures/opd-train-12.jsonl", import.meta.url));
      const { stderr, exitCode } = await runCommandInProcess(
        FINETUNE_ROUTES,
        [
          "finetune",
          "opd",
          "run",
          "--base-model",
          "qwen3.5-9b",
          "--teacher-model",
          "qwen3.5-397b-a17b",
          "--datasets",
          trainFile,
          "--mtu-spec",
          "MTU4",
          "--mtu-count",
          "24",
          "--hp",
          "batch_size=8",
          "--hp",
          "n_epochs=1",
          "--hp",
          "lr_warmup_steps=5",
          "--hp",
          "eval_steps=50",
          "--hp",
          "save_steps=50",
          "--yes",
          ...DUMMY_KEY,
          "--output",
          "json",
        ],
        {
          DASHSCOPE_API_KEY: "offline-test-only",
          DASHSCOPE_BASE_URL: `http://127.0.0.1:${address.port}`,
          BAILIAN_WORKSPACE_ID: "",
          NODE_OPTIONS: "",
          HTTP_PROXY: "",
          HTTPS_PROXY: "",
          ALL_PROXY: "",
          NO_PROXY: "",
          http_proxy: "",
          https_proxy: "",
          all_proxy: "",
          no_proxy: "",
          NODE_USE_ENV_PROXY: "",
        },
      );
      expect(exitCode).not.toBe(0);
      expect(stderr).toMatch(/OPD_WARMUP_EXCEEDS_STEPS/);
      expect(stderr).toMatch(/OPD_INTERVAL_EXCEEDS_STEPS/);
      expect(stderr).not.toMatch(/Uploaded/);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test("opd params without --base-model is a usage error (2)", async () => {
    const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "params",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/base-model/i);
  });

  test("opd params dry-run previews the pg_opd query without network", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "params",
      "--base-model",
      "qwen3.5-9b",
      "--param-type",
      "resource",
      "--mtu-spec-code",
      "MTU4",
      "--workspace-id",
      "ws-e2e",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson(stdout)).toMatchObject({
      action: "finetune.opd.params",
      base_model: "qwen3.5-9b",
      training_type: "pg_opd",
      param_type: "resource",
      mtu_spec_code: "MTU4",
      workspace_id: "ws-e2e",
    });
  });

  test("opd get without --job-id is a usage error (2)", async () => {
    const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "get",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--job-id/);
  });

  test("opd get dry-run previews the job id under the opd action", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "get",
      "--job-id",
      "ft-xxx",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson(stdout)).toMatchObject({
      action: "finetune.opd.get",
      job_id: "ft-xxx",
    });
  });

  test("opd get dry-run previews the workspace when provided", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "get",
      "--job-id",
      "ft-xxx",
      "--workspace-id",
      "ws-e2e",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson(stdout)).toMatchObject({
      action: "finetune.opd.get",
      job_id: "ft-xxx",
      workspace_id: "ws-e2e",
    });
  });

  test("opd watch dry-run defaults to a non-blocking probe", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "watch",
      "--job-id",
      "ft-xxx",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson(stdout)).toMatchObject({
      action: "finetune.opd.watch",
      job_id: "ft-xxx",
      follow: false,
      interval: 10,
    });
  });

  test("opd logs dry-run previews page and page_size", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "logs",
      "--job-id",
      "ft-xxx",
      "--page",
      "1",
      "--page-size",
      "100",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson(stdout)).toMatchObject({
      action: "finetune.opd.logs",
      job_id: "ft-xxx",
      page: 1,
      page_size: 100,
    });
  });

  test("opd cancel without --yes requires confirmation (7)", async () => {
    const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "cancel",
      "--job-id",
      "ft-xxx",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(7);
    expect(JSON.parse(stderr)).toMatchObject({
      error: { code: 7, type: "requires_confirmation" },
    });
  });

  test("opd cancel dry-run previews the job id without confirmation", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "cancel",
      "--job-id",
      "ft-xxx",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson(stdout)).toMatchObject({
      action: "finetune.opd.cancel",
      job_id: "ft-xxx",
    });
  });

  test("opd delete without --yes requires confirmation (7)", async () => {
    const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "delete",
      "--job-id",
      "ft-xxx",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(7);
    expect(JSON.parse(stderr)).toMatchObject({
      error: { code: 7, type: "requires_confirmation" },
    });
  });

  test("opd delete dry-run previews the job id without confirmation", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "delete",
      "--job-id",
      "ft-xxx",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson(stdout)).toMatchObject({
      action: "finetune.opd.delete",
      job_id: "ft-xxx",
    });
  });

  test("rl cancel without --yes requires confirmation (7)", async () => {
    const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "rl",
      "cancel",
      "--job-id",
      "rl-xxx",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(7);
    expect(JSON.parse(stderr)).toMatchObject({
      error: { code: 7, type: "requires_confirmation" },
    });
  });

  test("rl cancel dry-run previews the job id without confirmation", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "rl",
      "cancel",
      "--job-id",
      "rl-xxx",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson(stdout)).toMatchObject({
      action: "finetune.rl.cancel",
      job_id: "rl-xxx",
    });
  });

  test("rl watch dry-run defaults to a non-blocking probe", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "rl",
      "watch",
      "--job-id",
      "ft-xxx",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson(stdout)).toMatchObject({
      action: "finetune.rl.watch",
      job_id: "ft-xxx",
      follow: false,
      interval: 10,
    });
  });

  test("rl watch dry-run previews follow polling without a default timeout", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "rl",
      "watch",
      "--job-id",
      "ft-xxx",
      "--follow",
      "--interval",
      "5",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson(stdout)).toMatchObject({
      action: "finetune.rl.watch",
      job_id: "ft-xxx",
      follow: true,
      interval: 5,
    });
  });

  test("rl list dry-run previews pagination", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "rl",
      "list",
      "--page",
      "1",
      "--size",
      "20",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson(stdout)).toMatchObject({
      action: "finetune.rl.list",
      page: 1,
      size: 20,
    });
  });

  test("rl authorize without --yes requires confirmation (7)", async () => {
    const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "rl",
      "authorize",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(7);
    expect(JSON.parse(stderr)).toMatchObject({
      error: { code: 7, type: "requires_confirmation" },
    });
  });

  test("rl authorize dry-run previews a read-only probe", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "rl",
      "authorize",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson(stdout)).toMatchObject({
      action: "finetune.rl.authorize",
      target: "rl",
      authorize: false,
    });
  });

  test("opd authorize dry-run targets opd and stays read-only", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "authorize",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson(stdout)).toMatchObject({
      action: "finetune.opd.authorize",
      target: "opd",
      authorize: false,
    });
  });

  test("runtime prepare dry-run previews the managed install plan", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "runtime",
      "prepare",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson(stdout)).toMatchObject({
      action: "finetune.runtime.prepare",
      override_env: "BAILIAN_RL_RUNTIME",
      allow_install: true,
    });
  });

  test("runtime doctor dry-run previews the credential deny path", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "runtime",
      "doctor",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      credential_deny_paths: string[];
    }>(stdout);
    expect(data.action).toBe("finetune.runtime.doctor");
    expect(data.credential_deny_paths.some((path) => path.endsWith(".dashscope"))).toBe(true);
  });
});

describe("e2e: finetune runtime clean (offline)", () => {
  /** Exclusive temp config dir (the explicit BAILIAN_CONFIG_DIR is reused by the isolation infra); cleaned up in finally. */
  function seedCleanFixture() {
    const root = mkdtempSync(join(tmpdir(), "bl-clean-e2e-"));
    const configDir = join(root, "config");
    const oldRun = join(configDir, "runs", "old-run");
    const youngRun = join(configDir, "runs", "young-run");
    mkdirSync(oldRun, { recursive: true });
    mkdirSync(youngRun, { recursive: true });
    const aged = new Date(Date.now() - 25 * 3_600_000);
    utimesSync(oldRun, aged, aged);
    return {
      configDir,
      oldRun,
      youngRun,
      dispose: () => rmSync(root, { recursive: true, force: true }),
    };
  }

  test("runtime clean help exposes --ttl-hours and the injected --yes", async () => {
    const { stderr, exitCode } = await runCommandHelp(FINETUNE_ROUTES, [
      "finetune",
      "runtime",
      "clean",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--ttl-hours/);
    expect(stderr).toMatch(/--yes/);
    expect(stderr).toMatch(/--dry-run/);
  });

  test("runtime clean without --yes requires confirmation (7)", async () => {
    const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "runtime",
      "clean",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(7);
    expect(JSON.parse(stderr)).toMatchObject({
      error: { code: 7, type: "requires_confirmation" },
    });
  });

  test("runtime clean rejects a non-positive --ttl-hours (2)", async () => {
    const { stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "runtime",
      "clean",
      "--ttl-hours",
      "0",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/ttl-hours/);
  });

  test("runtime clean dry-run previews the plan without deleting", async () => {
    const fixture = seedCleanFixture();
    try {
      const { stdout, stderr, exitCode } = await runCommandInProcess(
        FINETUNE_ROUTES,
        ["finetune", "runtime", "clean", "--dry-run", "--output", "json"],
        { BAILIAN_CONFIG_DIR: fixture.configDir },
      );
      expect(exitCode, stderr).toBe(0);
      expect(parseStdoutJson(stdout)).toMatchObject({
        action: "finetune.runtime.clean",
        dryRun: true,
        removedCount: 1,
      });
      expect(existsSync(fixture.oldRun)).toBe(true);
      expect(existsSync(fixture.youngRun)).toBe(true);
    } finally {
      fixture.dispose();
    }
  });

  test("runtime clean --yes enters run and removes only expired runs", async () => {
    const fixture = seedCleanFixture();
    try {
      const { stdout, stderr, exitCode } = await runCommandInProcess(
        FINETUNE_ROUTES,
        ["finetune", "runtime", "clean", "--yes", "--output", "json"],
        { BAILIAN_CONFIG_DIR: fixture.configDir },
      );
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{
        dryRun: boolean;
        removedCount: number;
        entries: { kind: string; action: string }[];
      }>(stdout);
      expect(data.dryRun).toBe(false);
      expect(data.removedCount).toBe(1);
      expect(data.entries.every((entry) => entry.kind === "run")).toBe(true);
      expect(existsSync(fixture.oldRun)).toBe(false);
      expect(existsSync(fixture.youngRun)).toBe(true);
    } finally {
      fixture.dispose();
    }
  });
});

// Live RL/OPD execution needs a prepared sandbox runtime (BAILIAN_RL_RUNTIME or a
// reviewed manifest), an API key, a console token and an account whitelist. CI
// ships no bundled runtime, so these stay opt-in via BAILIAN_E2E_RL=1 and never
// create billed jobs by default. The read-only authorize probe below is the
// representative live integration; run/watch/list live cases additionally
// require BAILIAN_RL_RUNTIME to point at a local dashscope Python directory.
const rlLiveReady =
  isDashScopeE2EReady() && isConsoleE2EReady() && process.env.BAILIAN_E2E_RL === "1";

describe.skipIf(!rlLiveReady)("e2e: finetune rl (live, opt-in)", () => {
  test("rl authorize read-only probe reports capability states", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "rl",
      "authorize",
      "--yes",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ target?: string }>(stdout);
    expect(data.target).toBe("rl");
  });
});

// OPD submission creates billed jobs and stays manual-acceptance only; the
// read-only parameter query is the representative live integration here.
describe.skipIf(!isDashScopeE2EReady())("e2e: finetune opd params (live, read-only)", () => {
  test("opd params returns the pg_opd hyper schema for qwen3.5-9b", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(
      FINETUNE_ROUTES,
      [
        "finetune",
        "opd",
        "params",
        "--base-model",
        "qwen3.5-9b",
        "--param-type",
        "hyper",
        "--output",
        "json",
      ],
      // The shared .env workspace may belong to a different primary account
      // than the key; query the key's own workspace instead.
      { BAILIAN_WORKSPACE_ID: "" },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ output?: { hyper_params?: Array<{ name?: string }> } }>(stdout);
    expect(Array.isArray(data.output?.hyper_params)).toBe(true);
    expect(data.output?.hyper_params?.length ?? 0).toBeGreaterThan(0);
  });
});
