import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseStdoutJson, runCli } from "./setup.ts";

describe("e2e: pipeline", () => {
  let tempDir: string;
  let chatBasicPath: string;
  let invalidPipelinePath: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "bailian-cli-pipeline-"));
    chatBasicPath = join(tempDir, "chat-basic.json");
    await writeFile(
      chatBasicPath,
      JSON.stringify({
        version: "workflow/v1",
        inputs: {
          type: "object",
          properties: {
            message: { type: "string", default: "Hello from the demo pipeline." },
          },
          additionalProperties: false,
        },
        steps: [
          {
            id: "chat",
            type: "text/chat",
            input: {
              message: { $input: "/message" },
              system: "You are a concise assistant for pipeline demos.",
              temperature: 0.2,
            },
          },
        ],
      }),
    );

    invalidPipelinePath = join(tempDir, "invalid-dependency-pipeline.json");
    await writeFile(
      invalidPipelinePath,
      JSON.stringify({
        version: "workflow/v1",
        steps: [
          {
            id: "chat",
            type: "text/chat",
            input: { message: { $from: "later", path: "/data/value" } },
          },
          {
            id: "later",
            type: "text/chat",
            dependsOn: ["chat"],
            input: { message: "hello" },
          },
        ],
      }),
    );
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("pipeline 分组展示子命令帮助且成功退出", async () => {
    const { stdout, stderr, exitCode } = await runCli(["pipeline"]);
    expect(exitCode, stderr).toBe(0);
    const out = `${stdout}\n${stderr}`;
    expect(out).toMatch(/pipeline|run|validate/i);
    expect(out).toMatch(/Minimal workflow\.yaml|text\/chat|bl pipeline run workflow\.yaml/i);
    expect(out).toMatch(/Say hello in one short sentence|--dry-run --output json/i);
  });

  test("pipeline run --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["pipeline", "run", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/pipeline run|--input|--input-file|--events|--concurrency/i);
    expect(stderr).not.toMatch(/--session-(?:dir|id)/i);
  });

  test("pipeline validate --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["pipeline", "validate", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/pipeline validate|workflow\.json|output json/i);
  });

  test("pipeline validate --output json 校验合法 workflow", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "pipeline",
      "validate",
      chatBasicPath,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ valid?: boolean; issues?: string[] }>(stdout);
    expect(data.valid).toBe(true);
    expect(data.issues).toEqual([]);
  });

  test("pipeline validate 使用 config 输出格式", async () => {
    const { stdout, stderr, exitCode } = await runCli(["pipeline", "validate", chatBasicPath], {
      DASHSCOPE_OUTPUT: "text",
    });
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toBe("Pipeline definition is valid.\n");
  });

  test("pipeline validate 拒绝非法依赖 workflow", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "pipeline",
      "validate",
      invalidPipelinePath,
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toBe("");
    const data = parseStdoutJson<{ valid?: boolean; issues?: string[] }>(stdout);
    expect(data.valid).toBe(false);
    expect(data.issues?.join("\n")).toMatch(/pipeline graph contains cycle/i);
  });

  test("pipeline run 缺少 file 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCli(["pipeline", "run", "--non-interactive"]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/pipeline file is required|Usage: bl pipeline run <file>/i);
  });

  test("pipeline run --dry-run --output json 仅输出计划", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "pipeline",
      "run",
      chatBasicPath,
      "--input",
      '{"message":"hello"}',
      "--dry-run",
      "--output",
      "json",
      "--non-interactive",
    ]);
    expect(exitCode, stderr).toBe(0);
    const report = parseStdoutJson<{
      status?: string;
      version?: string;
      steps?: Array<{
        id?: string;
        type?: string;
        status?: string;
        input?: Record<string, unknown>;
      }>;
    }>(stdout);
    expect(report.status).toBe("planned");
    expect(report.version).toBe("workflow/v1");
    expect(report.steps?.[0]).toMatchObject({
      id: "chat",
      type: "text/chat",
      status: "planned",
      input: { message: "hello" },
    });
  });

  test("pipeline run 使用 config 输出格式", async () => {
    const { stdout, stderr, exitCode } = await runCli(
      [
        "pipeline",
        "run",
        chatBasicPath,
        "--input",
        '{"message":"hello"}',
        "--dry-run",
        "--non-interactive",
      ],
      { DASHSCOPE_OUTPUT: "text" },
    );
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toMatch(/Pipeline planned/);
    expect(stdout).toMatch(/\[~\] chat \(text\/chat\) — planned/);
  });

  test("pipeline run --verbose 打印总步数和当前步骤序号", async () => {
    const { stderr, exitCode } = await runCli([
      "pipeline",
      "run",
      chatBasicPath,
      "--input",
      '{"message":"hello"}',
      "--dry-run",
      "--verbose",
      "--non-interactive",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/\[pipeline\.started\] 1 step/);
    expect(stderr).toMatch(/\[step\.planned\] 1\/1 chat \(text\/chat\)/);
  });

  test("pipeline run --events jsonl 在 dry-run 下输出生命周期事件", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "pipeline",
      "run",
      chatBasicPath,
      "--input",
      '{"message":"hello"}',
      "--dry-run",
      "--events",
      "jsonl",
      "--non-interactive",
    ]);
    expect(exitCode, stderr).toBe(0);
    const events = stdout
      .trim()
      .split("\n")
      .map((line) =>
        parseStdoutJson<{ type?: string; step?: { id?: string; type?: string } }>(line),
      );
    expect(events.map((event) => event.type)).toEqual([
      "pipeline.started",
      "step.input.resolved",
      "step.planned",
      "pipeline.planned",
    ]);
    expect(events[1]?.step).toMatchObject({ id: "chat", type: "text/chat" });
  });

  test("pipeline run 拒绝未知 events format", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "pipeline",
      "run",
      chatBasicPath,
      "--dry-run",
      "--events",
      "bogus",
      "--non-interactive",
    ]);
    expect(exitCode).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toMatch(/unsupported --events format: bogus/i);
  });
});
