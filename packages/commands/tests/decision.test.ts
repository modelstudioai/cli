import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import {
  inspectDecisionQuestions,
  inspectDecisionState,
  stripDecisionTrainingFields,
  unwrapDecisionQuestions,
  type LocalizedText,
} from "bailian-cli-core";
import {
  buildDecisionInput,
  formatDecisionAnswers,
  formatDecisionStats,
  resolveDecisionEndpoint,
} from "../src/commands/decision/shared.ts";

const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);

function createUrlResolver(baseUrl: string, usesDefaultBaseUrl: boolean) {
  return {
    url(path: string, defaultBaseUrl?: () => string): string {
      const resolvedBaseUrl = usesDefaultBaseUrl && defaultBaseUrl ? defaultBaseUrl() : baseUrl;
      return resolvedBaseUrl + path;
    },
  };
}

function issueCodes(issues: Array<{ code: string }>): string[] {
  return issues.map((issue) => issue.code);
}

let workDirectory: string;

beforeEach(() => {
  workDirectory = mkdtempSync(join(tmpdir(), "bl-decision-unit-"));
});

afterEach(() => {
  rmSync(workDirectory, { recursive: true, force: true });
});

describe("decision question rules", () => {
  test("state 接受非空字符串、对象和数组", () => {
    expect(inspectDecisionState("text")).toEqual([]);
    expect(inspectDecisionState({ ticket_id: "T-1" })).toEqual([]);
    expect(inspectDecisionState([{ role: "user" }])).toEqual([]);
    for (const invalidState of ["  ", {}, [], 1, null, undefined]) {
      expect(issueCodes(inspectDecisionState(invalidState))).toEqual(["DECISION_INVALID_STATE"]);
    }
  });

  test("choice 选项数为 1-255", () => {
    const options = (count: number) =>
      Object.fromEntries(Array.from({ length: count }, (_option, index) => [`o${index}`, "desc"]));
    expect(inspectDecisionQuestions({ team: { type: "choice", criteria: options(1) } })).toEqual(
      [],
    );
    expect(inspectDecisionQuestions({ team: { type: "choice", criteria: options(255) } })).toEqual(
      [],
    );
    expect(
      issueCodes(inspectDecisionQuestions({ team: { type: "choice", criteria: options(256) } })),
    ).toEqual(["DECISION_INVALID_CHOICE_CRITERIA"]);
    expect(
      issueCodes(inspectDecisionQuestions({ team: { type: "choice", criteria: {} } })),
    ).toEqual(["DECISION_INVALID_CHOICE_CRITERIA"]);
  });

  test("score 等级数为 2-255", () => {
    const levels = (count: number) => Array.from({ length: count }, () => "level");
    expect(
      issueCodes(inspectDecisionQuestions({ severity: { type: "score", criteria: levels(1) } })),
    ).toEqual(["DECISION_INVALID_SCORE_CRITERIA"]);
    expect(inspectDecisionQuestions({ severity: { type: "score", criteria: levels(2) } })).toEqual(
      [],
    );
    expect(
      inspectDecisionQuestions({ severity: { type: "score", criteria: levels(255) } }),
    ).toEqual([]);
    expect(
      issueCodes(inspectDecisionQuestions({ severity: { type: "score", criteria: levels(256) } })),
    ).toEqual(["DECISION_INVALID_SCORE_CRITERIA"]);
  });

  test("noul criteria 可选，填写时只能含 true/false", () => {
    expect(inspectDecisionQuestions({ refund: { type: "noul" } })).toEqual([]);
    expect(
      inspectDecisionQuestions({ refund: { type: "noul", criteria: { true: "是", false: "否" } } }),
    ).toEqual([]);
    expect(
      issueCodes(
        inspectDecisionQuestions({ refund: { type: "noul", criteria: { maybe: "不确定" } } }),
      ),
    ).toEqual(["DECISION_INVALID_NOUL_CRITERIA"]);
  });

  test("instructions 可选，类型与问题类型受校验", () => {
    expect(
      issueCodes(
        inspectDecisionQuestions({
          refund: { type: "noul", instructions: 1 },
          other: { type: "summary" },
        }),
      ),
    ).toEqual(["DECISION_INVALID_INSTRUCTIONS", "DECISION_INVALID_QUESTION_TYPE"]);
  });

  test("解包 {questions:{...}}，但不误解包 ID 为 questions 的问题", () => {
    const table = { refund: { type: "noul" } };
    expect(unwrapDecisionQuestions({ questions: table, name: "workload" })).toEqual(table);
    const idNamedQuestions = { questions: { type: "noul" } };
    expect(unwrapDecisionQuestions(idNamedQuestions)).toBe(idNamedQuestions);
  });

  test("去掉 label/target 且不修改原对象", () => {
    const original = { refund: { type: "noul", label: true, target: { true: 1, false: 0 } } };
    expect(stripDecisionTrainingFields(original)).toEqual({ refund: { type: "noul" } });
    expect(original.refund).toHaveProperty("label");
  });
});

describe("decision command helpers", () => {
  test("state-file：.json 解析为对象，其他扩展名按文本", () => {
    const jsonPath = join(workDirectory, "ticket.json");
    const textPath = join(workDirectory, "ticket.txt");
    writeFileSync(jsonPath, JSON.stringify({ ticket_id: "T-1001" }));
    writeFileSync(textPath, "订单未到账");
    const questions = JSON.stringify({ refund: { type: "noul" } });

    expect(buildDecisionInput({ stateFile: jsonPath, questions }, localize).state).toEqual({
      ticket_id: "T-1001",
    });
    expect(buildDecisionInput({ stateFile: textPath, questions }, localize).state).toBe(
      "订单未到账",
    );
  });

  test("questions-file 兼容裸问题表与包裹格式", () => {
    const barePath = join(workDirectory, "bare.json");
    const wrappedPath = join(workDirectory, "wrapped.json");
    const table = { refund: { type: "noul" } };
    writeFileSync(barePath, JSON.stringify(table));
    writeFileSync(wrappedPath, JSON.stringify({ questions: table }));

    expect(buildDecisionInput({ state: "x", questionsFile: barePath }, localize).questions).toEqual(
      table,
    );
    expect(
      buildDecisionInput({ state: "x", questionsFile: wrappedPath }, localize).questions,
    ).toEqual(table);
  });

  test("request-file 携带的 model 被读出", () => {
    const requestPath = join(workDirectory, "request.json");
    writeFileSync(
      requestPath,
      JSON.stringify({ model: "my-ft", state: "x", questions: { refund: { type: "noul" } } }),
    );
    expect(buildDecisionInput({ requestFile: requestPath }, localize).model).toBe("my-ft");
  });

  test("非法 JSON 与非法问题定义抛 USAGE 错误", () => {
    expect(() => buildDecisionInput({ state: "x", questions: "{" }, localize)).toThrow(
      /not valid JSON/,
    );
    expect(() =>
      buildDecisionInput({ state: "x", questions: JSON.stringify({ q: { type: "x" } }) }, localize),
    ).toThrow(/Invalid decision request/);
  });

  test("Endpoint：默认按 workspace + region 拼接，显式 Base URL 优先", () => {
    const base = { binName: "bl", localize };
    expect(
      resolveDecisionEndpoint({
        ...base,
        workspaceId: "ws_test",
        region: "ap-southeast-1",
        client: createUrlResolver("https://dashscope.aliyuncs.com", true),
      }),
    ).toBe("https://ws_test.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/systemone");
    expect(
      resolveDecisionEndpoint({
        ...base,
        region: "cn-beijing",
        client: createUrlResolver("https://example.test", false),
      }),
    ).toBe("https://example.test/compatible-mode/v1/systemone");
    expect(() =>
      resolveDecisionEndpoint({
        ...base,
        region: "cn-beijing",
        client: createUrlResolver("https://dashscope.aliyuncs.com", true),
      }),
    ).toThrow(/Workspace ID/);
  });

  test("文本输出：每题一行，score 显示概率最高的等级", () => {
    const response = {
      answers: {
        department: {
          type: "choice",
          choice: "billing",
          confidence: 0.88,
          probabilities: { billing: 0.94, technical: 0.06 },
        },
        escalate: { type: "noul", noul: 0.99 },
        severity: {
          type: "score",
          score: 2.25,
          confidence: 0.91,
          legend: { "0": "轻微", "1": "部分受影响", "2": "核心不可用", "3": "严重" },
          probabilities: { "0": 0, "1": 0.01, "2": 0.73, "3": 0.26 },
        },
        future: { type: "rank", rank: [1, 2] },
      },
      usage: { input_tokens: 125 },
      latency_ms: 52.9,
    };
    expect(formatDecisionAnswers(response).split("\n")).toEqual([
      "department  choice=billing  confidence=0.88  billing=0.94 technical=0.06",
      "escalate    noul P(yes)=0.99",
      "severity    score=2.25  confidence=0.91  top=2 核心不可用",
      'future      {"type":"rank","rank":[1,2]}',
    ]);
    expect(formatDecisionStats(response)).toBe("input_tokens=125  latency_ms=52.9");
  });
});
