import { afterAll, describe, expect, test } from "vite-plus/test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  compareDecisionQuestionTables,
  decisionQuestionSignature,
  decisionQuestionTableSignature,
  getProfile,
  readDecisionQuestionSignature,
} from "../src/index.ts";

const tmp = join(tmpdir(), `bl-decision-profile-test-${process.pid}`);
mkdirSync(tmp, { recursive: true });
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function file(name: string, lines: string[]): string {
  const filePath = join(tmp, name);
  writeFileSync(filePath, lines.join("\n"));
  return filePath;
}

const profile = getProfile("sft-lora");

const DECISION_RECORD = JSON.stringify({
  state: "客户投诉发票抬头写错了。",
  questions: {
    team: {
      type: "choice",
      instructions: "应该由哪个团队处理？",
      criteria: { billing: "支付和账单问题", technical: "产品故障问题" },
      label: "billing",
    },
  },
});

describe("sft-lora profile — decision modality", () => {
  test("server training type stays efficient_sft", () => {
    expect(profile.serverTrainingType).toBe("efficient_sft");
  });

  test("validate routes .jsonl through the decision schema", async () => {
    const validPath = file("decision_valid.jsonl", [DECISION_RECORD]);
    const validResult = await profile.validate(validPath, "decision", { fullValidate: true });
    expect(validResult.valid).toBe(true);

    // A bad choice label is a decision-schema error — proves the routing did
    // not fall through to ChatML (which would report missing messages).
    const invalidPath = file("decision_invalid_label.jsonl", [
      JSON.stringify({
        state: "x",
        questions: {
          team: {
            type: "choice",
            instructions: "team?",
            criteria: { billing: "账单", technical: "技术" },
            label: "sales",
          },
        },
      }),
    ]);
    const invalidResult = await profile.validate(invalidPath, "decision", { fullValidate: true });
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors.map((issue) => issue.code)).toContain(
      "DECISION_INVALID_CHOICE_LABEL",
    );
  });

  test("non-.jsonl files are rejected with DECISION_UNSUPPORTED_FORMAT", async () => {
    const result = await profile.validate(join(tmp, "decision.zip"), "decision", {});
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe("DECISION_UNSUPPORTED_FORMAT");
    expect(result.errors[0].message).toContain(".jsonl");
  });

  test("resolveHyperParameters sends documented defaults and honors the three decision knobs", () => {
    // The API requires hyper_parameters in the request body ("n_epochs is
    // required"), so omitted knobs are filled with the documented defaults.
    expect(profile.resolveHyperParameters("decision", {})).toEqual({
      n_epochs: 2,
      batch_size: 1,
      learning_rate: "2e-5",
    });
    expect(
      profile.resolveHyperParameters("decision", {
        nEpochs: 3,
        batchSize: 2,
        learningRate: "1e-4",
      }),
    ).toEqual({ n_epochs: 3, batch_size: 2, learning_rate: "1e-4" });
    // Text-only knobs must not leak into the decision request body.
    expect(
      profile.resolveHyperParameters("decision", { loraRank: 16, split: 0.9, evalSteps: 50 }),
    ).toEqual({ n_epochs: 2, batch_size: 1, learning_rate: "2e-5" });
  });

  test("skips the generic batch-size gate and the capability check", () => {
    expect(profile.shouldSkipGate("batch_size", "decision")).toBe(true);
    expect(profile.shouldSkipGate("batch_size", "text")).toBe(false);
    expect(profile.shouldSkipCapabilityCheck("decision")).toBe(true);
    expect(profile.shouldSkipCapabilityCheck("text")).toBe(false);
  });
});

describe("decision question signatures", () => {
  const baseQuestion = {
    type: "choice",
    instructions: "哪个团队？",
    criteria: { billing: "账单", technical: "技术" },
    label: "billing",
    target: { billing: 0.9, technical: 0.1 },
  };

  test("label/target and criteria key order do not affect the signature", () => {
    const variant = {
      criteria: { technical: "技术", billing: "账单" },
      instructions: "哪个团队？",
      type: "choice",
      label: "technical",
    };
    expect(decisionQuestionSignature(variant)).toBe(decisionQuestionSignature(baseQuestion));
  });

  test("type, instructions and criteria changes all change the signature", () => {
    const baseline = decisionQuestionSignature(baseQuestion);
    expect(decisionQuestionSignature({ ...baseQuestion, type: "noul" })).not.toBe(baseline);
    expect(decisionQuestionSignature({ ...baseQuestion, instructions: "换个问法" })).not.toBe(
      baseline,
    );
    expect(decisionQuestionSignature({ ...baseQuestion, criteria: { billing: "账单" } })).not.toBe(
      baseline,
    );
  });

  test("non-object questions and tables yield undefined; non-object entries are skipped", () => {
    expect(decisionQuestionSignature("nope")).toBeUndefined();
    expect(decisionQuestionTableSignature([1, 2])).toBeUndefined();
    const table = decisionQuestionTableSignature({ team: baseQuestion, broken: "nope" });
    expect(table).toBeDefined();
    expect([...table!.keys()]).toEqual(["team"]);
  });

  test("compare reports added, missing and changed IDs, sorted", () => {
    const baseline = decisionQuestionTableSignature({
      alpha: baseQuestion,
      beta: baseQuestion,
      gamma: baseQuestion,
    })!;
    const other = decisionQuestionTableSignature({
      beta: { ...baseQuestion, instructions: "改了" },
      gamma: baseQuestion,
      delta: baseQuestion,
    })!;
    expect(compareDecisionQuestionTables(baseline, other)).toEqual(["alpha", "beta", "delta"]);
    expect(compareDecisionQuestionTables(baseline, baseline)).toEqual([]);
  });
});

describe("readDecisionQuestionSignature", () => {
  test("reads the first non-blank record's question table", async () => {
    const filePath = file("signature_ok.jsonl", ["", DECISION_RECORD, DECISION_RECORD]);
    const signature = await readDecisionQuestionSignature(filePath);
    const expected = decisionQuestionTableSignature(JSON.parse(DECISION_RECORD).questions);
    expect(signature).toEqual(expected);
  });

  test("returns undefined for malformed JSON, non-decision records and empty files", async () => {
    expect(
      await readDecisionQuestionSignature(file("signature_bad_json.jsonl", ["{oops"])),
    ).toBeUndefined();
    const chatmlPath = file("signature_chatml.jsonl", [
      '{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"hello"}]}',
    ]);
    expect(await readDecisionQuestionSignature(chatmlPath)).toBeUndefined();
    expect(
      await readDecisionQuestionSignature(file("signature_empty.jsonl", ["", ""])),
    ).toBeUndefined();
  });

  test("returns undefined for an unreadable file instead of throwing", async () => {
    expect(await readDecisionQuestionSignature(join(tmp, "does-not-exist.jsonl"))).toBeUndefined();
  });
});
