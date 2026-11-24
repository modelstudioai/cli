import { afterAll, describe, expect, test } from "vite-plus/test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  BailianError,
  ExitCode,
  MIN_SPLIT_RECORDS,
  TEACHER_SYSTEM_PROMPT,
  agreementRatio,
  alignRow,
  balanceReport,
  buildGenerationMessages,
  buildManifest,
  buildPlans,
  buildTeacherMessages,
  dedupByState,
  extractItems,
  extractJson,
  loadWorkload,
  parseStateItems,
  parseTeacherRow,
  parseWorkload,
  questionOptions,
  renderValue,
  seededShuffle,
  smooth,
  splitRecords,
  stateKey,
  toTrainingRecord,
  validateWorkload,
  workloadIdFields,
  type GenerationPlan,
  type RawLabelRow,
  type WorkloadConfig,
} from "../src/index.ts";

const tmp = join(tmpdir(), `bl-dataset-prepare-test-${process.pid}`);
mkdirSync(tmp, { recursive: true });
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function file(name: string, content: string): string {
  const filePath = join(tmp, name);
  writeFileSync(filePath, content);
  return filePath;
}

function expectUsage(run: () => unknown): void {
  try {
    run();
    throw new Error("expected a USAGE BailianError");
  } catch (error) {
    expect(error).toBeInstanceOf(BailianError);
    expect((error as BailianError).exitCode).toBe(ExitCode.USAGE);
  }
}

const WORKLOAD: WorkloadConfig = {
  description: "客服工单分流与升级判断",
  state_schema: { ticket_id: "工单编号", content: "工单正文" },
  questions: {
    department: {
      type: "choice",
      instructions: "应该由哪个部门处理？",
      criteria: { billing: "账单与支付问题", technical: "产品故障问题" },
    },
    escalate: { type: "noul", instructions: "是否需要升级处理？" },
    severity: {
      type: "score",
      instructions: "严重程度档位？",
      criteria: ["低", "中", "高", "紧急"],
    },
  },
  guidance: ["涉及退款一律升级"],
  axes: { department: ["billing", "technical"], severity: [0, 1, 2, 3] },
};

const RAW_ROW: RawLabelRow = {
  state: { ticket_id: "T-1", content: "发票金额开错了，要求退款" },
  plan: { difficulty: "clean", department: "billing", escalate: false, severity: 1, index: 0 },
  answers: {
    department: { probabilities: { billing: 0.9, technical: 0.1 } },
    escalate: { noul: 0.8 },
    severity: { probabilities: { "0": 0.1, "1": 0.7, "2": 0.2, "3": 0 } },
  },
};

describe("workload — parse / load / validate", () => {
  test("parseWorkload keeps typed fields and drops non-string entries", () => {
    const parsed = parseWorkload({
      ...WORKLOAD,
      name: "cloud-support",
      id_fields: ["ticket_id", 42],
      guidance: ["规则一", 7],
    });
    expect(parsed.name).toBe("cloud-support");
    expect(parsed.id_fields).toEqual(["ticket_id"]);
    expect(parsed.guidance).toEqual(["规则一"]);
    expect(Object.keys(parsed.questions)).toEqual(["department", "escalate", "severity"]);
  });

  test("parseWorkload rejects non-object and empty questions", () => {
    expectUsage(() => parseWorkload(null));
    expectUsage(() => parseWorkload([]));
    expectUsage(() => parseWorkload({ questions: {} }));
    expectUsage(() => parseWorkload({ description: "x" }));
  });

  test("loadWorkload reads a file and reports invalid JSON as USAGE", () => {
    const good = file("workload.json", JSON.stringify(WORKLOAD));
    expect(loadWorkload(good).description).toBe(WORKLOAD.description);
    const bad = file("workload-bad.json", "{not json");
    expectUsage(() => loadWorkload(bad));
  });

  test("workloadIdFields defaults to ticket_id", () => {
    expect(workloadIdFields(WORKLOAD)).toEqual(["ticket_id"]);
    expect(workloadIdFields({ ...WORKLOAD, id_fields: ["case_id"] })).toEqual(["case_id"]);
  });

  test("validateWorkload rejects invalid question definitions", () => {
    const broken: WorkloadConfig = {
      questions: { department: { type: "choice", criteria: {} } },
    };
    expectUsage(() => validateWorkload(broken, false));
  });

  test("validateWorkload in generation mode requires description and state_schema", () => {
    expectUsage(() => validateWorkload({ questions: WORKLOAD.questions }, true));
    expectUsage(() => validateWorkload({ ...WORKLOAD, description: "  " }, true));
    expectUsage(() => validateWorkload({ ...WORKLOAD, state_schema: {} }, true));
    expectUsage(() => validateWorkload({ ...WORKLOAD, state_schema: { content: "" } }, true));
    expectUsage(() => validateWorkload({ ...WORKLOAD, axes: { department: [] } }, true));
    // 非生成模式不要求 description / state_schema。
    expect(() => validateWorkload({ questions: WORKLOAD.questions }, false)).not.toThrow();
    expect(() => validateWorkload(WORKLOAD, true)).not.toThrow();
  });
});

describe("rng / plan — determinism and balance", () => {
  test("seededShuffle is deterministic, permutes, and does not mutate input", () => {
    const items = Array.from({ length: 50 }, (_item, index) => index);
    const first = seededShuffle(items, 42);
    const second = seededShuffle(items, 42);
    expect(first).toEqual(second);
    expect(first).not.toEqual(items);
    expect([...first].sort((left, right) => left - right)).toEqual(items);
    expect(items).toEqual(Array.from({ length: 50 }, (_item, index) => index));
    expect(seededShuffle(items, 43)).not.toEqual(first);
  });

  test("buildPlans cycles the axes grid evenly and appends unknowable plans", () => {
    const plans = buildPlans(WORKLOAD, 20, 3, 7);
    expect(plans).toHaveLength(23);
    const normal = plans.filter((plan) => plan.difficulty !== "unknowable");
    const unknowable = plans.filter((plan) => plan.difficulty === "unknowable");
    expect(normal).toHaveLength(20);
    expect(unknowable).toHaveLength(3);
    // 8 种组合循环 20 次：每种组合出现 2 或 3 次。
    const comboCounts = new Map<string, number>();
    for (const plan of normal) {
      const key = `${plan.department}/${plan.severity}`;
      comboCounts.set(key, (comboCounts.get(key) ?? 0) + 1);
    }
    expect(comboCounts.size).toBe(8);
    for (const count of comboCounts.values()) {
      expect(count === 2 || count === 3).toBe(true);
    }
    expect(new Set(plans.map((plan) => plan.index)).size).toBe(23);
  });

  test("buildPlans is reproducible for the same seed and rejects empty axes", () => {
    expect(buildPlans(WORKLOAD, 12, 2, 9)).toEqual(buildPlans(WORKLOAD, 12, 2, 9));
    expectUsage(() => buildPlans({ ...WORKLOAD, axes: { department: [] } }, 5, 0, 0));
  });
});

describe("prompt — question options and message construction", () => {
  test("questionOptions keeps ordered keys for choice / score / noul", () => {
    const choice = questionOptions(WORKLOAD.questions.department);
    expect(Object.keys(choice)).toEqual(["billing", "technical"]);
    const score = questionOptions(WORKLOAD.questions.severity);
    expect(Object.keys(score)).toEqual(["0", "1", "2", "3"]);
    expect(score["2"]).toBe("高");
    const noul = questionOptions(WORKLOAD.questions.escalate);
    expect(Object.keys(noul)).toEqual(["false", "true"]);
    const described = questionOptions({
      type: "noul",
      instructions: "x",
      criteria: { false: "无需升级", true: "需要升级" },
    });
    expect(described).toEqual({ false: "无需升级", true: "需要升级" });
  });

  test("questionOptions rejects malformed definitions", () => {
    expect(() => questionOptions({ type: "choice", instructions: "x" })).toThrow();
    expect(() =>
      questionOptions({ type: "score", instructions: "x", criteria: ["只有一档"] }),
    ).toThrow();
    expect(() =>
      questionOptions({ type: "noul", instructions: "x", criteria: { yes: "是" } }),
    ).toThrow();
  });

  test("buildTeacherMessages emits system + user with skeleton and guidance", () => {
    const messages = buildTeacherMessages(RAW_ROW.state, WORKLOAD.questions, WORKLOAD.guidance);
    expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
    const system = String(messages[0].content);
    const user = String(messages[1].content);
    expect(system.startsWith(TEACHER_SYSTEM_PROMPT)).toBe(true);
    expect(system).toContain("Business rules:");
    expect(system).toContain("涉及退款一律升级");
    expect(user).toContain('QUESTION id="department"  type=choice');
    expect(user).toContain("billing: 账单与支付问题");
    expect(user).toContain('"severity"');
    expect(user).toContain('{"department":{"billing":0,"technical":0}');
    expect(user).toContain("发票金额开错了");
    const withoutGuidance = buildTeacherMessages(RAW_ROW.state, WORKLOAD.questions);
    expect(String(withoutGuidance[0].content)).not.toContain("Business rules:");
  });

  test("buildGenerationMessages lists schema fields and profiles without index", () => {
    const plans = buildPlans(WORKLOAD, 3, 1, 5);
    const messages = buildGenerationMessages(WORKLOAD, plans);
    const user = String(messages[1].content);
    expect(user).toContain('"ticket_id": 工单编号');
    expect(user).toContain('"content": 工单正文');
    expect(user).toContain("客服工单分流与升级判断");
    expect(user).toContain('输出格式：{"samples": [...]}，数组长度为 4');
    expect(user).not.toContain('"index"');
    expect(user).toContain("缺少作出判断所需的信息");
  });
});

describe("parse — JSON extraction from model replies", () => {
  test("extractJson handles bare, fenced, and prose-prefixed payloads", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('好的，结果如下：\n{"a":1}\n以上。')).toEqual({ a: 1 });
    expect(extractJson("[1,2,3]")).toEqual([1, 2, 3]);
    expect(extractJson('前缀 [{"a":1}] 后缀')).toEqual([{ a: 1 }]);
    expect(extractJson("没有 JSON")).toBeUndefined();
    expect(extractJson("")).toBeUndefined();
  });

  test("extractItems accepts wrapped lists, bare arrays, and single objects", () => {
    expect(extractItems('{"samples":[{"x":1},{"x":2}]}')).toEqual([{ x: 1 }, { x: 2 }]);
    expect(extractItems('[{"x":1}]')).toEqual([{ x: 1 }]);
    expect(extractItems('{"x":1}')).toEqual([{ x: 1 }]);
    expect(extractItems("纯文本")).toBeUndefined();
  });

  test("renderValue is key-order independent for objects", () => {
    expect(renderValue({ b: 2, a: { d: 4, c: 3 } })).toBe(renderValue({ a: { c: 3, d: 4 }, b: 2 }));
    expect(renderValue("原样")).toBe("原样");
  });
});

describe("label — alignment, smoothing, and training records", () => {
  test("alignRow validates keys, range, sum, and normalizes", () => {
    expect(alignRow({ a: 0.5, b: 0.5 }, ["a", "b"])).toEqual([0.5, 0.5]);
    expect(alignRow({ a: "0.2", b: "0.2" }, ["a", "b"])).toEqual([0.5, 0.5]);
    expect(() => alignRow({ a: 1 }, ["a", "b"])).toThrow();
    expect(() => alignRow({ a: 0.5, c: 0.5 }, ["a", "b"])).toThrow();
    expect(() => alignRow({ a: 1.2, b: 0 }, ["a", "b"])).toThrow();
    expect(() => alignRow({ a: -0.1, b: 0.5 }, ["a", "b"])).toThrow();
    expect(() => alignRow({ a: 0, b: 0 }, ["a", "b"])).toThrow();
    expect(() => alignRow(null, ["a"])).toThrow();
  });

  test("smooth keeps distribution at temp 1 and flattens above 1", () => {
    const probs = { a: 0.9, b: 0.1 };
    expect(smooth(probs, 1)).toEqual(probs);
    const flattened = smooth(probs, 1.5);
    expect(flattened.a).toBeLessThan(0.9);
    expect(flattened.b).toBeGreaterThan(0.1);
    expect(flattened.a + flattened.b).toBeCloseTo(1, 10);
  });

  test("toTrainingRecord derives hard labels by question type", () => {
    const { record, intentMatch } = toTrainingRecord(RAW_ROW, WORKLOAD, 1.5, true);
    expect(record).not.toBeNull();
    const questions = record!.questions;
    expect(questions.department.label).toBe("billing");
    expect(questions.escalate.label).toBe(true);
    expect(questions.severity.label).toBe(1);
    // 软标签保留问题定义且概率和为 1。
    expect(questions.department.criteria).toEqual(WORKLOAD.questions.department.criteria);
    for (const question of Object.values(questions)) {
      const total = Object.values(question.target ?? {}).reduce((sum, value) => sum + value, 0);
      expect(total).toBeCloseTo(1, 10);
    }
    expect(intentMatch).toEqual({ department: true, escalate: false, severity: true });
    expect(record!._meta).toBeUndefined();
  });

  test("noul boundary 0.5 counts as true; no-soft omits targets", () => {
    const boundary: RawLabelRow = {
      ...RAW_ROW,
      answers: { ...RAW_ROW.answers, escalate: { noul: 0.5 } },
    };
    const { record } = toTrainingRecord(boundary, WORKLOAD, 1.5, false);
    expect(record!.questions.escalate.label).toBe(true);
    expect(record!.questions.department.target).toBeUndefined();
  });

  test("unknowable plans get uniform targets and _meta.source", () => {
    const unknowable: RawLabelRow = {
      ...RAW_ROW,
      plan: { difficulty: "unknowable", index: 3 },
    };
    const { record, intentMatch } = toTrainingRecord(unknowable, WORKLOAD, 1.5, true);
    expect(record!._meta).toEqual({ source: "unknowable" });
    expect(record!.questions.department.target).toEqual({ billing: 0.5, technical: 0.5 });
    expect(record!.questions.severity.target).toEqual({
      "0": 0.25,
      "1": 0.25,
      "2": 0.25,
      "3": 0.25,
    });
    expect(intentMatch).toEqual({});
  });

  test("invalid or missing teacher answers reject the whole row", () => {
    expect(
      toTrainingRecord({ ...RAW_ROW, missing: ["department"] }, WORKLOAD, 1.5, true).record,
    ).toBeNull();
    const broken: RawLabelRow = {
      ...RAW_ROW,
      answers: { ...RAW_ROW.answers, department: { probabilities: { billing: 2 } } },
    };
    expect(toTrainingRecord(broken, WORKLOAD, 1.5, true).record).toBeNull();
    const absent: RawLabelRow = { ...RAW_ROW, answers: {} };
    expect(toTrainingRecord(absent, WORKLOAD, 1.5, true).record).toBeNull();
  });
});

describe("split — dedup key and deterministic split", () => {
  test("stateKey ignores id fields and key order", () => {
    const left = stateKey({ ticket_id: "T-1", content: "x", meta: { b: 2, a: 1 } }, ["ticket_id"]);
    const right = stateKey({ content: "x", meta: { a: 1, b: 2 }, ticket_id: "T-2" }, ["ticket_id"]);
    expect(left).toBe(right);
    expect(stateKey({ content: "y" }, ["ticket_id"])).not.toBe(left);
  });

  test("dedupByState keeps first occurrences and counts duplicates", () => {
    const records = [
      { state: { ticket_id: "T-1", content: "x" } },
      { state: { ticket_id: "T-2", content: "x" } },
      { state: { ticket_id: "T-3", content: "y" } },
    ];
    const { unique, duplicateCount } = dedupByState(records, ["ticket_id"]);
    expect(duplicateCount).toBe(1);
    expect(unique).toHaveLength(2);
    expect(unique[0]).toBe(records[0]);
  });

  test("splitRecords uses floor(n * ratio) for development and is deterministic", () => {
    expect(MIN_SPLIT_RECORDS).toBe(7);
    const records = Array.from({ length: 20 }, (_item, index) => ({ id: index }));
    const parts = splitRecords(records, 3);
    expect(parts.development).toHaveLength(3);
    expect(parts.train).toHaveLength(17);
    expect(splitRecords(records, 3)).toEqual(parts);
    const merged = [...parts.development, ...parts.train];
    expect(merged.map((record) => record.id).sort((left, right) => left - right)).toEqual(
      records.map((record) => record.id),
    );
    expect(splitRecords(records, 3, 0.5).development).toHaveLength(10);
  });
});

describe("report — balance, agreement, manifest", () => {
  test("balanceReport counts hard labels per option", () => {
    const first = toTrainingRecord(RAW_ROW, WORKLOAD, 1.5, true).record!;
    const second = toTrainingRecord(
      {
        ...RAW_ROW,
        plan: { difficulty: "clean", department: "technical", index: 1 },
        answers: {
          ...RAW_ROW.answers,
          department: { probabilities: { billing: 0.1, technical: 0.9 } },
        },
      },
      WORKLOAD,
      1.5,
      true,
    ).record!;
    const balance = balanceReport([first, second], WORKLOAD);
    expect(balance.department).toEqual({ billing: 1, technical: 1 });
    expect(balance.escalate).toEqual({ false: 0, true: 2 });
    expect(balance.severity).toEqual({ "0": 0, "1": 2, "2": 0, "3": 0 });
  });

  test("agreementRatio rounds to 4 decimals and guards zero totals", () => {
    expect(
      agreementRatio({ department: { hit: 2, total: 3 }, escalate: { hit: 0, total: 0 } }),
    ).toEqual({ department: 0.6667, escalate: 0 });
  });

  test("buildManifest mirrors the script structure with skipped token check", () => {
    const manifest = buildManifest({
      created: "2026-01-01T00:00:00Z",
      mode: "generate",
      workloadPath: "workload.json",
      rawPath: "raw/labeled.jsonl",
      workloadSha256: "abc123",
      generator: {
        model: "qwen3.8-max",
        base_url: "https://example.com/compatible-mode/v1",
        seed: 0,
        target_temp: 1.5,
        soft_target: true,
      },
      unknowableRecords: 1,
      rejectedRawRecords: 2,
      duplicateRawRecords: 3,
      records: { train: 17, development: 3 },
      labelBalance: { department: { billing: 10, technical: 10 } },
      agreement: { department: 0.9 },
      wallSeconds: 12.5,
      usage: { calls: 25, prompt_tokens: 1000, completion_tokens: 500 },
    });
    expect(manifest.workload_sha256).toBe("abc123");
    expect(manifest.mode).toBe("generate");
    expect(manifest.state_token_check).toEqual({
      status: "skipped",
      reason: expect.stringContaining("transformers"),
    });
    expect(manifest.records).toEqual({ train: 17, development: 3 });
    expect(manifest.usage).toEqual({ calls: 25, prompt_tokens: 1000, completion_tokens: 500 });
    expect(manifest.generator_teacher_agreement).toEqual({ department: 0.9 });
    expect(manifest.wall_s).toBe(12.5);
  });
});

const GROUP: GenerationPlan[] = [
  { difficulty: "clean", department: "billing", severity: 1, index: 0 },
  { difficulty: "clean", department: "technical", severity: 2, index: 1 },
];
const SCHEMA_FIELDS = ["ticket_id", "content"];
const STATE: Record<string, unknown> = { ticket_id: "T-1", content: "发票金额开错了，要求退款" };
const GEN_CONTENT = JSON.stringify({
  samples: [STATE, { ticket_id: "T-2", content: "产品无法开机" }],
});
const TEACHER_CONTENT = JSON.stringify({
  department: { billing: 0.9, technical: 0.1 },
  escalate: { false: 0.2, true: 0.8 },
  severity: { "0": 0.1, "1": 0.7, "2": 0.2, "3": 0 },
});

describe("label — parseTeacherRow", () => {
  test("parses a full teacher reply into normalized answers", () => {
    const { answers, missing } = parseTeacherRow(TEACHER_CONTENT, WORKLOAD.questions);
    expect(missing).toEqual([]);
    expect(answers.department.probabilities).toEqual({ billing: 0.9, technical: 0.1 });
    expect(answers.escalate.noul).toBe(0.8);
    expect(answers.escalate.probabilities).toEqual({ false: 0.2, true: 0.8 });
    expect(answers.severity.probabilities).toEqual({ "0": 0.1, "1": 0.7, "2": 0.2, "3": 0 });
  });

  test("normalizes unnormalized weights and rounds to 4 decimals", () => {
    const content = JSON.stringify({
      department: { billing: 0.4, technical: 0.4 },
      escalate: { false: 0.1, true: 0.3 },
      severity: { "0": 0.3, "1": 0.3, "2": 0.3, "3": 0 },
    });
    const { answers, missing } = parseTeacherRow(content, WORKLOAD.questions);
    expect(missing).toEqual([]);
    expect(answers.department.probabilities).toEqual({ billing: 0.5, technical: 0.5 });
    expect(answers.escalate.noul).toBe(0.75);
    expect(answers.severity.probabilities).toEqual({
      "0": 0.3333,
      "1": 0.3333,
      "2": 0.3333,
      "3": 0,
    });
  });

  test("non-JSON reply marks every question missing", () => {
    const { answers, missing } = parseTeacherRow("没有 JSON", WORKLOAD.questions);
    expect(answers).toEqual({});
    expect(missing).toEqual(["department", "escalate", "severity"]);
  });

  test("one invalid distribution only marks that question missing", () => {
    const content = JSON.stringify({
      department: { billing: 1.2, technical: 0 },
      escalate: { false: 0.2, true: 0.8 },
      severity: { "0": 0.1, "1": 0.7, "2": 0.2, "3": 0 },
    });
    const { answers, missing } = parseTeacherRow(content, WORKLOAD.questions);
    expect(missing).toEqual(["department"]);
    expect(answers.department).toBeUndefined();
    expect(answers.escalate.noul).toBe(0.8);
  });
});

describe("parse — parseStateItems", () => {
  test("keeps schema-complete items and attaches the matching plan", () => {
    const { items, invalid } = parseStateItems(GEN_CONTENT, GROUP, SCHEMA_FIELDS);
    expect(invalid).toBe(false);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ state: STATE, plan: GROUP[0] });
    expect(items[1].plan).toBe(GROUP[1]);
  });

  test("count mismatch or non-JSON marks the whole batch invalid", () => {
    const short = JSON.stringify({ samples: [STATE] });
    expect(parseStateItems(short, GROUP, SCHEMA_FIELDS)).toEqual({ items: [], invalid: true });
    expect(parseStateItems("纯文本", GROUP, SCHEMA_FIELDS)).toEqual({ items: [], invalid: true });
  });

  test("items missing schema fields are skipped individually, not invalid", () => {
    const content = JSON.stringify({
      samples: [STATE, { ticket_id: "T-2", content: "  " }],
    });
    const { items, invalid } = parseStateItems(content, GROUP, SCHEMA_FIELDS);
    expect(invalid).toBe(false);
    expect(items).toHaveLength(1);
    expect(items[0].state).toEqual(STATE);
  });
});
