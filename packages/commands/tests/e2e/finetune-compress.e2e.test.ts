import { describe, expect, test } from "vite-plus/test";
import { isDashScopeE2EReady, parseStdoutJson, runCommandE2e, runCommandHelp } from "./helpers.ts";
import { FINETUNE_ROUTES } from "./topic-routes.ts";

describe.skipIf(!isDashScopeE2EReady())("e2e: finetune compress (offline)", () => {
  test("compress group lists the lifecycle commands", async () => {
    const { stderr, exitCode } = await runCommandHelp(FINETUNE_ROUTES, [
      "finetune",
      "compress",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/templates|create|list|get|watch|logs|cancel|delete/);
  });

  test("create help exposes required flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(FINETUNE_ROUTES, [
      "finetune",
      "compress",
      "create",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--model/);
    expect(stderr).toMatch(/--template-id/);
  });

  test("create dry-run builds the compression request", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(FINETUNE_ROUTES, [
      "finetune",
      "compress",
      "create",
      "--model",
      "qwen3.5-flash-2026-02-23-ft-xxx",
      "--template-id",
      "quant-flash-nvfp4-mlp-nomtp",
      "--job-name",
      "compression-test",
      "--hparam",
      "calib_input=true",
      "--calibration-files",
      "file-aaa,file-bbb,file-aaa",
      "--suffix",
      "test1",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      request: Record<string, unknown>;
    }>(stdout);
    expect(data.action).toBe("finetune.compress.create");
    expect(data.request).toMatchObject({
      model: "qwen3.5-flash-2026-02-23-ft-xxx",
      template_id: "quant-flash-nvfp4-mlp-nomtp",
      job_name: "compression-test",
      hyper_parameters: { calib_input: "true" },
      custom_calibration_file_ids: ["file-aaa", "file-bbb"],
      output_model_suffix: "test1",
    });
  });

  test("create rejects an invalid output suffix", async () => {
    const { stderr, exitCode } = await runCommandE2e(FINETUNE_ROUTES, [
      "finetune",
      "compress",
      "create",
      "--model",
      "qwen-ft-xxx",
      "--template-id",
      "template-xxx",
      "--suffix",
      "Upper_Case",
      "--dry-run",
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/suffix/i);
  });

  test("delete dry-run does not require confirmation", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(FINETUNE_ROUTES, [
      "finetune",
      "compress",
      "delete",
      "--job-id",
      "quant-xxx",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson(stdout)).toMatchObject({
      action: "finetune.compress.delete",
      job_id: "quant-xxx",
    });
  });
});
