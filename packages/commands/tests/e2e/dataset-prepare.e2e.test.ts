import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vite-plus/test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseStdoutJson, runCommandHelp, runCommandInProcess } from "./helpers.ts";
import { DATASET_ROUTES } from "./topic-routes.ts";

/**
 * Decision data preparation E2E (offline).
 *
 * `dataset split` is keyless and purely local; `dataset generate` local modes
 * (--from-raw / --dry-run) never touch the network, and its API pipeline is
 * exercised against a loopback chat/completions mock. No real credentials or
 * endpoints are used anywhere in this file.
 */

let fixtureDir = "";

function decisionRecord(index: number, overrides?: { label?: string }): string {
  return JSON.stringify({
    state: { ticket_id: `T-${index}`, content: `客户反馈问题描述 ${index}` },
    questions: {
      team: {
        type: "choice",
        instructions: "应该由哪个团队处理？",
        criteria: { billing: "账单与支付问题", technical: "产品故障问题" },
        label: overrides?.label ?? "billing",
      },
    },
  });
}

function decisionLines(count: number): string[] {
  return Array.from({ length: count }, (_line, index) => decisionRecord(index));
}

const WORKLOAD = {
  name: "cloud-support-zh",
  description: "客服工单分流",
  state_schema: { ticket_id: "工单编号", content: "工单正文" },
  id_fields: ["case_id"],
  questions: {
    team: {
      type: "choice",
      instructions: "应该由哪个团队处理？",
      criteria: { billing: "账单与支付问题", technical: "产品故障问题" },
    },
  },
};

beforeAll(() => {
  fixtureDir = mkdtempSync(join(tmpdir(), "bl-dataset-prepare-e2e-"));
  writeFileSync(join(fixtureDir, "labeled-20.jsonl"), decisionLines(20).join("\n"));
  writeFileSync(join(fixtureDir, "labeled-6.jsonl"), decisionLines(6).join("\n"));
  writeFileSync(join(fixtureDir, "workload.json"), JSON.stringify(WORKLOAD));
  // 两条记录 content 相同、ticket_id 不同：默认忽略 ticket_id 后应判重。
  writeFileSync(
    join(fixtureDir, "duplicate.jsonl"),
    [decisionRecord(1), decisionRecord(2)].join("\n").replace("问题描述 2", "问题描述 1"),
  );
  // 编号字段为 case_id 的重复对：默认 ticket_id 规则判不出，--workload 才能判出。
  const caseLines = [1, 2].map((index) =>
    JSON.stringify({
      state: { case_id: `C-${index}`, content: "同一份工单正文" },
      questions: {
        team: {
          type: "choice",
          instructions: "哪个团队？",
          criteria: { billing: "账单", technical: "技术" },
          label: "billing",
        },
      },
    }),
  );
  writeFileSync(join(fixtureDir, "case-duplicate.jsonl"), caseLines.join("\n"));
  writeFileSync(join(fixtureDir, "bad-label.jsonl"), decisionRecord(1, { label: "sales" }));
  writeFileSync(join(fixtureDir, "broken.jsonl"), "{not json}\n");
});

afterAll(() => rmSync(fixtureDir, { recursive: true, force: true }));

function runSplit(args: string[]) {
  return runCommandInProcess(DATASET_ROUTES, ["dataset", "split", ...args]);
}

interface SplitResult {
  action: string;
  counts: { total: number; train: number; development: number };
  files: { train: string; development: string };
  validation?: { valid: boolean; errors: number };
}

describe("e2e: dataset split (offline)", () => {
  test("split --help 展示切分 flag 且标明仅 decision", async () => {
    const { stderr, exitCode } = await runCommandHelp(DATASET_ROUTES, [
      "dataset",
      "split",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--input/);
    expect(stderr).toMatch(/--dev-ratio/);
    expect(stderr).toMatch(/--seed/);
    expect(stderr).toMatch(/decision/i);
  });

  test("split 缺少 --input 退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runSplit(["--quiet"]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--input|Missing required/i);
  });

  test("split 按 15% 切分并写出两份文件", async () => {
    const outDir = join(fixtureDir, "out-default");
    const { stdout, stderr, exitCode } = await runSplit([
      "--input",
      join(fixtureDir, "labeled-20.jsonl"),
      "--out-dir",
      outDir,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<SplitResult>(stdout);
    expect(data.action).toBe("dataset.split");
    expect(data.counts).toEqual({ total: 20, train: 17, development: 3 });
    expect(data.validation?.valid).toBe(true);
    const trainLines = readFileSync(join(outDir, "tickets.train.jsonl"), "utf8").trim().split("\n");
    const devLines = readFileSync(join(outDir, "tickets.development.jsonl"), "utf8")
      .trim()
      .split("\n");
    expect(trainLines).toHaveLength(17);
    expect(devLines).toHaveLength(3);
  });

  test("split 同 seed 两次切分结果逐字节一致", async () => {
    const firstDir = join(fixtureDir, "out-seed-a");
    const secondDir = join(fixtureDir, "out-seed-b");
    const input = join(fixtureDir, "labeled-20.jsonl");
    const first = await runSplit(["--input", input, "--out-dir", firstDir, "--seed", "42"]);
    const second = await runSplit(["--input", input, "--out-dir", secondDir, "--seed", "42"]);
    expect(first.exitCode, first.stderr).toBe(0);
    expect(second.exitCode, second.stderr).toBe(0);
    expect(readFileSync(join(firstDir, "tickets.train.jsonl"), "utf8")).toBe(
      readFileSync(join(secondDir, "tickets.train.jsonl"), "utf8"),
    );
  });

  test("split --dev-ratio 0.5 --prefix cases 自定义比例与文件名", async () => {
    const outDir = join(fixtureDir, "out-half");
    const { stdout, stderr, exitCode } = await runSplit([
      "--input",
      join(fixtureDir, "labeled-20.jsonl"),
      "--out-dir",
      outDir,
      "--prefix",
      "cases",
      "--dev-ratio",
      "0.5",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<SplitResult>(stdout);
    expect(data.counts.train).toBe(10);
    expect(data.counts.development).toBe(10);
    expect(existsSync(join(outDir, "cases.train.jsonl"))).toBe(true);
    expect(existsSync(join(outDir, "cases.development.jsonl"))).toBe(true);
  });

  test("split 重复 state（忽略 ticket_id）退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runSplit([
      "--input",
      join(fixtureDir, "duplicate.jsonl"),
      "--out-dir",
      join(fixtureDir, "out-dup"),
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/重复|Duplicate/i);
  });

  test("split --workload 用 id_fields 判重，--id-fields 可覆盖", async () => {
    const input = join(fixtureDir, "case-duplicate.jsonl");
    // 仅两条记录：先绕过最少记录数限制不现实，这里直接断言判重先于数量校验。
    const viaWorkload = await runSplit([
      "--input",
      input,
      "--workload",
      join(fixtureDir, "workload.json"),
    ]);
    expect(viaWorkload.exitCode).toBe(2);
    expect(viaWorkload.stderr).toMatch(/重复|Duplicate/i);
    // 覆盖为不忽略任何编号字段后，两条 state 不再重复，转而触发最少记录数校验。
    const viaOverride = await runSplit(["--input", input, "--id-fields", "none"]);
    expect(viaOverride.exitCode).toBe(2);
    expect(viaOverride.stderr).toMatch(/至少|at least/i);
  });

  test("split 少于 7 条退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runSplit([
      "--input",
      join(fixtureDir, "labeled-6.jsonl"),
      "--out-dir",
      join(fixtureDir, "out-few"),
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/至少|at least/i);
  });

  test("split 非法 JSON 行退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runSplit(["--input", join(fixtureDir, "broken.jsonl")]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/JSON/i);
  });

  test.each(["0", "1", "abc"])("split --dev-ratio %s 拒绝", async (ratio) => {
    const { stderr, exitCode } = await runSplit([
      "--input",
      join(fixtureDir, "labeled-20.jsonl"),
      "--dev-ratio",
      ratio,
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/dev-ratio/i);
  });

  test("split --schema 拒绝非 decision 值", async () => {
    const { stderr, exitCode } = await runSplit([
      "--input",
      join(fixtureDir, "labeled-20.jsonl"),
      "--schema",
      "chatml",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/schema|decision/i);
  });

  test("split --dry-run 预览计数且不写文件", async () => {
    const outDir = join(fixtureDir, "out-dry");
    const { stdout, stderr, exitCode } = await runSplit([
      "--input",
      join(fixtureDir, "labeled-20.jsonl"),
      "--out-dir",
      outDir,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<SplitResult>(stdout);
    expect(data.counts).toEqual({ total: 20, train: 17, development: 3 });
    expect(existsSync(outDir)).toBe(false);
  });

  test("split 产物自检失败时仍写文件并以警告透出", async () => {
    const outDir = join(fixtureDir, "out-bad-label");
    // 7 条全部坏标签：无论洗牌结果如何，train 文件自检必失败。
    const mixed = join(fixtureDir, "mixed-label.jsonl");
    writeFileSync(
      mixed,
      Array.from({ length: 7 }, (_line, index) => decisionRecord(index, { label: "sales" })).join(
        "\n",
      ),
    );
    const { stdout, stderr, exitCode } = await runSplit([
      "--input",
      mixed,
      "--out-dir",
      outDir,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<SplitResult>(stdout);
    expect(data.validation?.valid).toBe(false);
    expect(stderr).toMatch(/自检|self-check/i);
    expect(existsSync(data.files.train)).toBe(true);
  });
});

// ---- dataset generate：本地模式（--from-raw / --dry-run）与参数闸门 ----

const GENERATE_WORKLOAD = {
  name: "cloud-support-zh",
  description: "客服工单分流",
  state_schema: { ticket_id: "工单编号", content: "工单正文" },
  questions: {
    team: {
      type: "choice",
      instructions: "应该由哪个团队处理？",
      criteria: { billing: "账单与支付问题", technical: "产品故障问题" },
    },
  },
  guidance: ["涉及退款一律升级"],
  axes: { team: ["billing", "technical"] },
};

function rawRow(
  index: number,
  overrides?: { difficulty?: string; content?: string; probabilities?: Record<string, number> },
): string {
  return JSON.stringify({
    state: { ticket_id: `T-${index}`, content: overrides?.content ?? `工单正文 ${index}` },
    plan: { difficulty: overrides?.difficulty ?? "clean", team: "billing", index },
    answers: {
      team: {
        type: "choice",
        probabilities: overrides?.probabilities ?? { billing: 0.9, technical: 0.1 },
      },
    },
    missing: [],
  });
}

interface GenerateResult {
  action: string;
  mode: string;
  records: { train: number; development: number };
  unknowable_records: number;
  rejected_raw_records: number;
  duplicate_raw_records: number;
  files: { train: string; development: string; manifest: string; raw: string };
  generator_teacher_agreement?: Record<string, number>;
  usage: { calls: number } | null;
}

describe("e2e: dataset generate local modes (offline)", () => {
  let genServer: Server;
  let genOrigin = "";
  let genRequests = 0;
  let genDir = "";
  let workloadPath = "";
  let raw10 = "";
  let rawMixed = "";
  let rawFew = "";

  function runGenerate(args: string[], env: NodeJS.ProcessEnv = {}) {
    return runCommandInProcess(DATASET_ROUTES, ["dataset", "generate", ...args], {
      DASHSCOPE_API_KEY: "offline-test-only",
      DASHSCOPE_BASE_URL: genOrigin,
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
      ...env,
    });
  }

  beforeAll(async () => {
    genDir = mkdtempSync(join(tmpdir(), "bl-dataset-generate-e2e-"));
    workloadPath = join(genDir, "workload.json");
    writeFileSync(workloadPath, JSON.stringify(GENERATE_WORKLOAD));
    raw10 = join(genDir, "raw-10.jsonl");
    writeFileSync(raw10, Array.from({ length: 10 }, (_line, index) => rawRow(index)).join("\n"));
    // 10 clean + 2 unknowable + 1 重复 state + 1 missing → 12 条可用记录。
    rawMixed = join(genDir, "raw-mixed.jsonl");
    writeFileSync(
      rawMixed,
      [
        ...Array.from({ length: 10 }, (_line, index) => rawRow(index)),
        rawRow(20, { difficulty: "unknowable" }),
        rawRow(21, { difficulty: "unknowable" }),
        rawRow(22, { content: "工单正文 0" }),
        JSON.stringify({
          state: { ticket_id: "T-23", content: "缺标注的工单" },
          plan: { difficulty: "clean", index: 23 },
          answers: {},
          missing: ["team"],
        }),
      ].join("\n"),
    );
    rawFew = join(genDir, "raw-few.jsonl");
    writeFileSync(rawFew, Array.from({ length: 3 }, (_line, index) => rawRow(index)).join("\n"));
    // 本地模式不应触网：任何请求都计数并返回 500，便于断言零调用。
    genServer = createServer((_request, response) => {
      genRequests += 1;
      response.statusCode = 500;
      response.setHeader("content-type", "application/json");
      response.end('{"message":"local mode must not call the API"}');
    });
    await new Promise<void>((resolve, reject) => {
      genServer.once("error", reject);
      genServer.listen(0, "127.0.0.1", resolve);
    });
    const address = genServer.address();
    if (!address || typeof address === "string") throw new Error("Expected a local TCP server.");
    genOrigin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    genServer.closeAllConnections();
    await new Promise<void>((resolve) => genServer.close(() => resolve()));
    rmSync(genDir, { recursive: true, force: true });
  });

  test("generate --help 展示全模式 flag 且标明仅 decision", async () => {
    const { stderr, exitCode } = await runCommandHelp(DATASET_ROUTES, [
      "dataset",
      "generate",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--workload/);
    expect(stderr).toMatch(/--from-raw/);
    expect(stderr).toMatch(/--from-states/);
    expect(stderr).toMatch(/--resume-raw/);
    expect(stderr).toMatch(/--states-only/);
    expect(stderr).toMatch(/--target-temp/);
    expect(stderr).toMatch(/decision/i);
  });

  test("generate 缺少 --workload 退出为用法错误 (2)，并给出骨架与字段速查指引", async () => {
    const { stderr, exitCode } = await runGenerate(["--quiet"]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--workload/);
    // 报错现场即给出最小骨架（questions 键）与字段写法出处（--help Notes）。
    expect(stderr).toMatch(/questions/);
    expect(stderr).toMatch(/--help/);
  });

  test("generate --from-raw 零网络转换并写出产物与 manifest", async () => {
    const outDir = join(genDir, "out-from-raw");
    const { stdout, stderr, exitCode } = await runGenerate([
      "--workload",
      workloadPath,
      "--from-raw",
      rawMixed,
      "--out-dir",
      outDir,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(genRequests).toBe(0);
    const data = parseStdoutJson<GenerateResult>(stdout);
    expect(data.action).toBe("dataset.generate");
    expect(data.mode).toBe("from_raw");
    expect(data.records).toEqual({ train: 11, development: 1 });
    expect(data.unknowable_records).toBe(2);
    expect(data.duplicate_raw_records).toBe(1);
    expect(data.rejected_raw_records).toBe(1);
    expect(data.usage).toBeNull();
    const manifest = JSON.parse(readFileSync(data.files.manifest, "utf8")) as Record<
      string,
      unknown
    >;
    expect(manifest.mode).toBe("from_raw");
    expect(manifest.usage).toBeNull();
    expect((manifest.generator as Record<string, unknown>).model).toBeNull();
    expect(typeof manifest.workload_sha256).toBe("string");
    expect((manifest.state_token_check as Record<string, unknown>).status).toBe("skipped");
    // unknowable 记录保留均匀 target 与 _meta.source。
    const allLines = [
      ...readFileSync(data.files.train, "utf8").trim().split("\n"),
      ...readFileSync(data.files.development, "utf8").trim().split("\n"),
    ].map(
      (line) =>
        JSON.parse(line) as {
          _meta?: { source: string };
          questions: Record<string, { target?: Record<string, number> }>;
        },
    );
    const unknowable = allLines.filter((record) => record._meta?.source === "unknowable");
    expect(unknowable).toHaveLength(2);
    expect(unknowable[0].questions.team.target).toEqual({ billing: 0.5, technical: 0.5 });
  });

  test("generate --from-raw --target-temp 1.0 保留 teacher 原分布", async () => {
    const outDir = join(genDir, "out-temp1");
    const { stderr, exitCode } = await runGenerate([
      "--workload",
      workloadPath,
      "--from-raw",
      raw10,
      "--target-temp",
      "1.0",
      "--out-dir",
      outDir,
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(genRequests).toBe(0);
    const lines = readFileSync(join(outDir, "tickets.train.jsonl"), "utf8").trim().split("\n");
    for (const line of lines) {
      const record = JSON.parse(line) as {
        questions: { team: { target: Record<string, number> } };
      };
      expect(record.questions.team.target.billing).toBeCloseTo(0.9, 5);
      expect(record.questions.team.target.technical).toBeCloseTo(0.1, 5);
    }
  });

  test("generate --from-raw --no-soft-target 仅硬标签", async () => {
    const outDir = join(genDir, "out-no-soft");
    const { stderr, exitCode } = await runGenerate([
      "--workload",
      workloadPath,
      "--from-raw",
      raw10,
      "--no-soft-target",
      "--out-dir",
      outDir,
    ]);
    expect(exitCode, stderr).toBe(0);
    const lines = readFileSync(join(outDir, "tickets.train.jsonl"), "utf8").trim().split("\n");
    for (const line of lines) {
      const record = JSON.parse(line) as {
        questions: { team: { label: string; target?: unknown } };
      };
      expect(record.questions.team.label).toBe("billing");
      expect(record.questions.team.target).toBeUndefined();
    }
  });

  test("generate --from-raw 可用记录不足 7 条以非零码退出", async () => {
    const { stderr, exitCode } = await runGenerate([
      "--workload",
      workloadPath,
      "--from-raw",
      rawFew,
      "--out-dir",
      join(genDir, "out-few"),
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/至少|at least/i);
    expect(genRequests).toBe(0);
  });

  test("generate --dry-run 预览画像与调用数，零网络零写入", async () => {
    const outDir = join(genDir, "out-dry-gen");
    const { stdout, stderr, exitCode } = await runGenerate([
      "--workload",
      workloadPath,
      "--samples",
      "12",
      "--unknowable",
      "2",
      "--batch",
      "5",
      "--out-dir",
      outDir,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(genRequests).toBe(0);
    expect(existsSync(outDir)).toBe(false);
    const data = parseStdoutJson<{
      mode: string;
      plans: { total: number; unknowable: number };
      estimated_calls: { generation: number; labeling: number };
      sample: { generation_messages: unknown[]; teacher_messages: unknown[] };
    }>(stdout);
    expect(data.mode).toBe("generate");
    expect(data.plans).toEqual({ total: 14, unknowable: 2 });
    expect(data.estimated_calls).toEqual({ generation: 3, labeling: 14 });
    expect(data.sample.generation_messages).toHaveLength(2);
    expect(data.sample.teacher_messages).toHaveLength(2);
  });

  test("generate --from-raw --dry-run 预览行数且不转换不写文件", async () => {
    const outDir = join(genDir, "out-dry-raw");
    const { stdout, stderr, exitCode } = await runGenerate([
      "--workload",
      workloadPath,
      "--from-raw",
      raw10,
      "--out-dir",
      outDir,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(genRequests).toBe(0);
    expect(existsSync(outDir)).toBe(false);
    const data = parseStdoutJson<{
      mode: string;
      rows: number;
      estimated_calls: { generation: number; labeling: number };
    }>(stdout);
    expect(data.mode).toBe("from_raw");
    expect(data.rows).toBe(10);
    expect(data.estimated_calls).toEqual({ generation: 0, labeling: 0 });
  });

  test("generate 生成模式缺少 state_schema 退出为用法错误 (2)", async () => {
    const bare = join(genDir, "workload-bare.json");
    writeFileSync(
      bare,
      JSON.stringify({ description: "客服工单分流", questions: GENERATE_WORKLOAD.questions }),
    );
    const { stderr, exitCode } = await runGenerate(["--workload", bare, "--dry-run"]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/state_schema/);
  });

  test.each([
    ["--from-raw 与 --states-only 互斥", ["--from-raw", "x.jsonl", "--states-only"]],
    ["--from-raw 与 --from-states 互斥", ["--from-raw", "x.jsonl", "--from-states", "y.jsonl"]],
    ["--resume-raw 需要 --from-states", ["--resume-raw", "x.jsonl"]],
    ["--states-only 与 --from-states 互斥", ["--states-only", "--from-states", "y.jsonl"]],
    ["--batch 必须为正", ["--batch", "0"]],
    ["--samples 必须非负", ["--samples", "-1"]],
    ["--target-temp 必须为正", ["--target-temp", "0"]],
  ])("generate %s 退出为用法错误 (2)", async (_label, extraArgs) => {
    const { stderr, exitCode } = await runGenerate(["--workload", workloadPath, ...extraArgs]);
    expect(exitCode).toBe(2);
    expect(stderr.length).toBeGreaterThan(0);
    expect(genRequests).toBe(0);
  });
});

// ---- dataset generate：API 管线（loopback mock chat/completions，零真实网络） ----

// 单轴 billing：生成意图与 teacher 硬标签一致率应为 1，technical 占比 0 触发 <5% 警告。
const PIPELINE_WORKLOAD = { ...GENERATE_WORKLOAD, axes: { team: ["billing"] } };

interface ChatBody {
  model?: string;
  temperature?: number;
  enable_thinking?: boolean;
  enable_search?: boolean;
  messages?: Array<{ role: string; content: string }>;
  [key: string]: unknown;
}

function chatResponse(content: string): Record<string, unknown> {
  return {
    id: "chatcmpl-mock",
    object: "chat.completion",
    created: 0,
    model: "mock",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

function respondJson(response: ServerResponse, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(payload));
}

function generationSamples(count: number, offset: number): string {
  return JSON.stringify({
    samples: Array.from({ length: count }, (_item, index) => ({
      ticket_id: `T-${offset + index}`,
      content: `生成工单 ${offset + index}`,
    })),
  });
}

const TEACHER_DISTRIBUTION = JSON.stringify({ team: { billing: 0.9, technical: 0.1 } });

function generationBatchSize(body: ChatBody): number {
  const user = body.messages?.[1]?.content ?? "";
  const match = /数组长度为 (\d+)/.exec(user);
  return match ? Number(match[1]) : 0;
}

describe("e2e: dataset generate API pipeline (loopback)", () => {
  let pipeServer: Server;
  let pipeOrigin = "";
  let pipeDir = "";
  let pipeWorkloadPath = "";
  const requests: ChatBody[] = [];
  let stateCounter = 0;
  let handler: (body: ChatBody, response: ServerResponse) => void = defaultHandler;

  function defaultHandler(body: ChatBody, response: ServerResponse): void {
    if (body.enable_thinking === false) {
      const count = generationBatchSize(body);
      const offset = stateCounter;
      stateCounter += count;
      respondJson(response, 200, chatResponse(generationSamples(count, offset)));
    } else {
      respondJson(response, 200, chatResponse(TEACHER_DISTRIBUTION));
    }
  }

  function runPipeline(args: string[]) {
    return runCommandInProcess(DATASET_ROUTES, ["dataset", "generate", ...args], {
      DASHSCOPE_API_KEY: "offline-test-only",
      DASHSCOPE_BASE_URL: pipeOrigin,
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
    });
  }

  beforeAll(async () => {
    pipeDir = mkdtempSync(join(tmpdir(), "bl-dataset-pipeline-e2e-"));
    pipeWorkloadPath = join(pipeDir, "workload.json");
    writeFileSync(pipeWorkloadPath, JSON.stringify(PIPELINE_WORKLOAD));
    pipeServer = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        let body: ChatBody = {};
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as ChatBody;
        } catch {
          // 保留空 body，交由 handler 处理。
        }
        requests.push(body);
        handler(body, response);
      });
    });
    await new Promise<void>((resolve, reject) => {
      pipeServer.once("error", reject);
      pipeServer.listen(0, "127.0.0.1", resolve);
    });
    const address = pipeServer.address();
    if (!address || typeof address === "string") throw new Error("Expected a local TCP server.");
    pipeOrigin = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    requests.length = 0;
    stateCounter = 0;
    handler = defaultHandler;
  });

  afterAll(async () => {
    pipeServer.closeAllConnections();
    await new Promise<void>((resolve) => pipeServer.close(() => resolve()));
    rmSync(pipeDir, { recursive: true, force: true });
  });

  test("generate 完整管线：生成 + 标注 + 切分 + manifest 用量", async () => {
    const outDir = join(pipeDir, "out-full");
    const { stdout, stderr, exitCode } = await runPipeline([
      "--workload",
      pipeWorkloadPath,
      "--samples",
      "10",
      "--batch",
      "5",
      "--concurrency",
      "4",
      "--out-dir",
      outDir,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<GenerateResult>(stdout);
    expect(data.mode).toBe("generate");
    expect(data.records).toEqual({ train: 9, development: 1 });
    expect(data.usage?.calls).toBe(12);
    const generationCalls = requests.filter((call) => call.enable_thinking === false);
    const teacherCalls = requests.filter((call) => call.enable_thinking === true);
    expect(generationCalls).toHaveLength(2);
    expect(teacherCalls).toHaveLength(10);
    for (const call of generationCalls) {
      expect(call.temperature).toBe(1.0);
      expect(call.enable_search).toBe(false);
    }
    for (const call of teacherCalls) {
      expect(call.temperature).toBe(0.2);
      expect(call.enable_search).toBe(false);
    }
    const statesPath = data.files.raw.replace("labeled", "states");
    expect(readFileSync(statesPath, "utf8").trim().split("\n")).toHaveLength(10);
    const manifest = JSON.parse(readFileSync(data.files.manifest, "utf8")) as Record<
      string,
      unknown
    >;
    expect(manifest.usage).toEqual({ calls: 12, prompt_tokens: 120, completion_tokens: 60 });
    expect((manifest.generator as Record<string, unknown>).model).toBe("qwen3.8-max");
    expect(data.generator_teacher_agreement).toEqual({ team: 1 });
    // technical 硬标签占比 0，应透出 <5% 均衡警告。
    expect(stderr).toMatch(/5%/);
  });

  test("generate --states-only 生成后停止，不产生标注调用", async () => {
    const outDir = join(pipeDir, "out-states-only");
    const { stdout, stderr, exitCode } = await runPipeline([
      "--workload",
      pipeWorkloadPath,
      "--samples",
      "5",
      "--states-only",
      "--out-dir",
      outDir,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      states_only: boolean;
      counts: { states: number };
      files: { states: string };
      usage: { calls: number };
    }>(stdout);
    expect(data.states_only).toBe(true);
    expect(data.counts.states).toBe(5);
    expect(data.usage.calls).toBe(1);
    expect(requests.filter((call) => call.enable_thinking === true)).toHaveLength(0);
    expect(readFileSync(data.files.states, "utf8").trim().split("\n")).toHaveLength(5);
    expect(existsSync(join(outDir, "tickets.train.jsonl"))).toBe(false);
  });

  test("generate --from-states + --resume-raw 跳过已标注 state 续跑", async () => {
    const statesFile = join(pipeDir, "states-10.jsonl");
    writeFileSync(
      statesFile,
      Array.from({ length: 10 }, (_line, index) =>
        JSON.stringify({
          state: { ticket_id: `T-${index}`, content: `工单正文 ${index}` },
          plan: { difficulty: "clean", team: "billing", index },
        }),
      ).join("\n"),
    );
    const resumeFile = join(pipeDir, "resume-raw.jsonl");
    writeFileSync(
      resumeFile,
      Array.from({ length: 4 }, (_line, index) => rawRow(index)).join("\n"),
    );
    const outDir = join(pipeDir, "out-resume");
    const { stdout, stderr, exitCode } = await runPipeline([
      "--workload",
      pipeWorkloadPath,
      "--from-states",
      statesFile,
      "--resume-raw",
      resumeFile,
      "--out-dir",
      outDir,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(requests).toHaveLength(6);
    expect(requests.every((call) => call.enable_thinking === true)).toBe(true);
    const data = parseStdoutJson<GenerateResult>(stdout);
    expect(data.mode).toBe("from_states");
    expect(data.records).toEqual({ train: 9, development: 1 });
    expect(data.files.raw).toBe(resumeFile);
    // 历史 4 条 + 新标注 6 条全部保留在同一 raw 文件。
    expect(readFileSync(resumeFile, "utf8").trim().split("\n")).toHaveLength(10);
  });

  test("generate 坏批（条数不符）跳过，其余批次照常完成", async () => {
    let generationSeen = 0;
    handler = (body, response) => {
      if (body.enable_thinking === false) {
        generationSeen += 1;
        if (generationSeen === 1) {
          const offset = stateCounter;
          stateCounter += 3;
          respondJson(response, 200, chatResponse(generationSamples(3, offset)));
          return;
        }
      }
      defaultHandler(body, response);
    };
    const outDir = join(pipeDir, "out-bad-batch");
    const { stdout, stderr, exitCode } = await runPipeline([
      "--workload",
      pipeWorkloadPath,
      "--samples",
      "15",
      "--batch",
      "5",
      "--concurrency",
      "2",
      "--out-dir",
      outDir,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/跳过|skipped/i);
    const data = parseStdoutJson<GenerateResult>(stdout);
    expect(data.records).toEqual({ train: 9, development: 1 });
    expect(data.usage?.calls).toBe(13);
    const statesPath = data.files.raw.replace("labeled", "states");
    expect(readFileSync(statesPath, "utf8").trim().split("\n")).toHaveLength(10);
  });

  test("generate 服务端 4xx 原样透传且不重试", async () => {
    handler = (_body, response) => {
      respondJson(response, 400, { message: "Invalid API key provided" });
    };
    const { stderr, exitCode } = await runPipeline([
      "--workload",
      pipeWorkloadPath,
      "--samples",
      "5",
      "--out-dir",
      join(pipeDir, "out-4xx"),
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Invalid API key provided");
    expect(requests).toHaveLength(1);
  });

  test("generate 429 退避重试后成功", async () => {
    let seen = 0;
    handler = (body, response) => {
      seen += 1;
      if (seen === 1) {
        respondJson(response, 429, { message: "throttled" });
        return;
      }
      defaultHandler(body, response);
    };
    const outDir = join(pipeDir, "out-429");
    const { stdout, stderr, exitCode } = await runPipeline([
      "--workload",
      pipeWorkloadPath,
      "--samples",
      "10",
      "--batch",
      "5",
      "--concurrency",
      "1",
      "--out-dir",
      outDir,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    // 1 次 429 + 2 次生成 + 10 次标注；usage 只计成功调用。
    expect(requests).toHaveLength(13);
    const data = parseStdoutJson<GenerateResult>(stdout);
    expect(data.usage?.calls).toBe(12);
    expect(data.records).toEqual({ train: 9, development: 1 });
  }, 20000);

  test("generate teacher 分布非法时整行跳过，无可用记录以非零码退出", async () => {
    handler = (body, response) => {
      if (body.enable_thinking === false) {
        defaultHandler(body, response);
        return;
      }
      respondJson(
        response,
        200,
        chatResponse(JSON.stringify({ team: { billing: 2, technical: 0.1 } })),
      );
    };
    const { stderr, exitCode } = await runPipeline([
      "--workload",
      pipeWorkloadPath,
      "--samples",
      "10",
      "--out-dir",
      join(pipeDir, "out-bad-label"),
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/没有可用记录|no usable records/i);
    expect(stderr).toMatch(/跳过|skipped/i);
  });
});
