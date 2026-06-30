import { afterAll, describe, expect, test } from "vite-plus/test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { validateDataset, parseDatasetSchemaFlag } from "../src/index.ts";

const tmp = join(tmpdir(), `bl-dpo-test-${process.pid}`);
mkdirSync(tmp, { recursive: true });

function file(name: string, lines: string[]): string {
  const p = join(tmp, name);
  writeFileSync(p, lines.join("\n"));
  return p;
}

const DPO_OK =
  '{"messages":[{"role":"user","content":"hi"}],"chosen":{"role":"assistant","content":"good"},"rejected":{"role":"assistant","content":"bad"}}';
const SFT_OK =
  '{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"hello"}]}';

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function codes(r: { errors: { code: string }[]; warnings: { code: string }[] }) {
  return {
    errors: r.errors.map((e) => e.code),
    warnings: r.warnings.map((w) => w.code),
  };
}

describe("validateDataset — DPO schema", () => {
  test("valid DPO record passes under auto-detect and --schema dpo", async () => {
    const p = file("ok.jsonl", [DPO_OK]);
    const auto = await validateDataset(p, { fullValidate: true });
    expect(auto.valid).toBe(true);
    const dpo = await validateDataset(p, { fullValidate: true, schema: "dpo" });
    expect(dpo.valid).toBe(true);
  });

  test("missing rejected → MISSING_REJECTED (auto-detect, since chosen present)", async () => {
    const p = file("miss_rej.jsonl", [
      '{"messages":[{"role":"user","content":"hi"}],"chosen":{"role":"assistant","content":"good"}}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toContain("MISSING_REJECTED");
    expect(codes(r).errors).not.toContain("MISSING_CHOSEN");
  });

  test("missing chosen → MISSING_CHOSEN (auto-detect, since rejected present)", async () => {
    const p = file("miss_chosen.jsonl", [
      '{"messages":[{"role":"user","content":"hi"}],"rejected":{"role":"assistant","content":"bad"}}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toContain("MISSING_CHOSEN");
  });

  test('schema "dpo" requires both chosen and rejected on every record', async () => {
    // A record with neither chosen nor rejected is SFT-shaped; under --schema dpo
    // it must be flagged as missing both preferences.
    const p = file("sft_under_dpo.jsonl", [SFT_OK]);
    const r = await validateDataset(p, { fullValidate: true, schema: "dpo" });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toEqual(expect.arrayContaining(["MISSING_CHOSEN", "MISSING_REJECTED"]));
  });

  test('schema "chatml" ignores chosen/rejected (no DPO errors)', async () => {
    const p = file("miss_rej_chatml.jsonl", [
      '{"messages":[{"role":"user","content":"hi"}],"chosen":{"role":"assistant","content":"good"}}',
    ]);
    const r = await validateDataset(p, { fullValidate: true, schema: "chatml" });
    expect(r.valid).toBe(true);
    expect(codes(r).errors.filter((c) => c.startsWith("MISSING_"))).toEqual([]);
  });

  test("SFT-only file under auto-detect is unaffected (no DPO checks)", async () => {
    const p = file("sft.jsonl", [SFT_OK]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(true);
    expect(codes(r).errors).toEqual([]);
  });

  test("chosen not a message object → MESSAGE_NOT_OBJECT at path chosen", async () => {
    const p = file("bad_chosen.jsonl", [
      '{"messages":[{"role":"user","content":"hi"}],"chosen":"nope","rejected":{"role":"assistant","content":"bad"}}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(false);
    const err = r.errors.find((e) => e.code === "MESSAGE_NOT_OBJECT");
    expect(err).toBeDefined();
    expect(err!.path).toBe("chosen");
  });

  test("chosen role=user → PREFERENCE_ROLE_NOT_ASSISTANT warning", async () => {
    const p = file("role_warn.jsonl", [
      '{"messages":[{"role":"user","content":"hi"}],"chosen":{"role":"user","content":"good"},"rejected":{"role":"assistant","content":"bad"}}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(true);
    expect(codes(r).warnings).toContain("PREFERENCE_ROLE_NOT_ASSISTANT");
  });

  test("multi-turn prompt in messages still validates with DPO preferences", async () => {
    const p = file("multiturn.jsonl", [
      '{"messages":[{"role":"user","content":"a"},{"role":"assistant","content":"b"},{"role":"user","content":"c"}],"chosen":{"role":"assistant","content":"good"},"rejected":{"role":"assistant","content":"bad"}}',
    ]);
    const r = await validateDataset(p, { fullValidate: true, schema: "dpo" });
    expect(r.valid).toBe(true);
  });
});

describe("validateDataset — CPT schema", () => {
  const CPT_OK = '{"text":"The quick brown fox jumps over the lazy dog."}';

  test("valid CPT record passes under auto-detect and --schema cpt", async () => {
    const p = file("cpt_ok.jsonl", [CPT_OK]);
    const auto = await validateDataset(p, { fullValidate: true });
    expect(auto.valid).toBe(true);
    const cpt = await validateDataset(p, { fullValidate: true, schema: "cpt" });
    expect(cpt.valid).toBe(true);
  });

  test("missing text → MISSING_TEXT under --schema cpt", async () => {
    const p = file("cpt_no_text.jsonl", ['{"title":"doc"}']);
    const r = await validateDataset(p, { fullValidate: true, schema: "cpt" });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toContain("MISSING_TEXT");
  });

  test("non-string text → INVALID_TEXT", async () => {
    const p = file("cpt_bad_text.jsonl", ['{"text":42}']);
    const r = await validateDataset(p, { fullValidate: true, schema: "cpt" });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toContain("INVALID_TEXT");
  });

  test("empty / whitespace-only text → EMPTY_TEXT", async () => {
    const p = file("cpt_empty.jsonl", ['{"text":"   "}']);
    const r = await validateDataset(p, { fullValidate: true, schema: "cpt" });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toContain("EMPTY_TEXT");
  });

  test("auto-detect routes a {text} record to CPT, not ChatML", async () => {
    // A CPT record has no `messages`; under auto-detect it must NOT produce a
    // ChatML MISSING_MESSAGES error — it should be validated as CPT and pass.
    const p = file("cpt_auto.jsonl", [CPT_OK]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(true);
    expect(codes(r).errors).not.toContain("MISSING_MESSAGES");
  });

  test("SFT record with a stray text field still routes to ChatML", async () => {
    // {messages, text} is ambiguous; CPT detect requires text AND no messages,
    // so this falls through to ChatML and validates as SFT (text ignored).
    const p = file("mixed.jsonl", [
      '{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"yo"}],"text":"noise"}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(true);
    expect(codes(r).errors).toEqual([]);
  });
});

describe("parseDatasetSchemaFlag", () => {
  test("undefined / empty → undefined (auto)", () => {
    expect(parseDatasetSchemaFlag(undefined)).toBeUndefined();
    expect(parseDatasetSchemaFlag("")).toBeUndefined();
    expect(parseDatasetSchemaFlag("  ")).toBeUndefined();
  });

  test("chatml / dpo / cpt pass through", () => {
    expect(parseDatasetSchemaFlag("chatml")).toBe("chatml");
    expect(parseDatasetSchemaFlag("dpo")).toBe("dpo");
    expect(parseDatasetSchemaFlag("cpt")).toBe("cpt");
    expect(parseDatasetSchemaFlag("  dpo ")).toBe("dpo");
  });

  test("unrecognized throws", () => {
    expect(() => parseDatasetSchemaFlag("sft")).toThrow(/Unsupported --schema/);
  });
});
