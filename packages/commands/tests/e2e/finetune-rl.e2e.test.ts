import { describe, expect, test } from "vite-plus/test";
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

  test("opd run help requires a teacher model", async () => {
    const { stderr, exitCode } = await runCommandHelp(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "run",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--teacher-model/);
    expect(stderr).toMatch(/--yes/);
  });

  test("opd group lists the job subcommands", async () => {
    const { stderr, exitCode } = await runCommandHelp(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/run|get|list|watch|logs|cancel|delete|authorize/);
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
      "--model",
      "qwen3.5-9b",
      "--teacher-model",
      "qwen3.5-397b-a17b",
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
      "--model",
      "qwen3.5-9b",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/teacher-model/i);
  });

  test("opd run dry-run forces pg_opd with a teacher model", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "run",
      "--model",
      "qwen3.5-9b",
      "--teacher-model",
      "qwen3.5-397b-a17b",
      "--dry-run",
      ...DUMMY_KEY,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      training_type: string;
      is_opd: boolean;
      spec: { teacher_model?: string };
    }>(stdout);
    expect(data.action).toBe("finetune.opd.run");
    expect(data.training_type).toBe("pg_opd");
    expect(data.is_opd).toBe(true);
    expect(data.spec.teacher_model).toBe("qwen3.5-397b-a17b");
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

  test("opd list dry-run previews pagination under the opd action", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
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
      action: "finetune.opd.list",
      page: 1,
      size: 20,
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

  test("opd logs dry-run previews offset and lines", async () => {
    const { stdout, stderr, exitCode } = await runCommandInProcess(FINETUNE_ROUTES, [
      "finetune",
      "opd",
      "logs",
      "--job-id",
      "ft-xxx",
      "--offset",
      "0",
      "--lines",
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
      offset: 0,
      lines: 100,
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
