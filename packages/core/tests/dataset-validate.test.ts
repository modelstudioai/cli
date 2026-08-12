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

  test("DPO messages ending with assistant → DPO_LAST_MSG_NOT_USER error", async () => {
    const p = file("dpo_last_asst.jsonl", [
      '{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"yo"}],"chosen":{"role":"assistant","content":"good"},"rejected":{"role":"assistant","content":"bad"}}',
    ]);
    const r = await validateDataset(p, { fullValidate: true, schema: "dpo" });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toContain("DPO_LAST_MSG_NOT_USER");
  });

  test("DPO with image content item → DPO_UNSUPPORTED_ELEMENT error", async () => {
    const p = file("dpo_image.jsonl", [
      '{"messages":[{"role":"user","content":[{"text":"look"},{"image":"a.jpg"}]}],"chosen":{"role":"assistant","content":[{"text":"good"}]},"rejected":{"role":"assistant","content":[{"text":"bad"}]}}',
    ]);
    const r = await validateDataset(p, { fullValidate: true, schema: "dpo" });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toContain("DPO_UNSUPPORTED_ELEMENT");
  });

  test("DPO with tools / tool_calls → DPO_UNSUPPORTED_ELEMENT error", async () => {
    const p = file("dpo_tools.jsonl", [
      '{"tools":[{"type":"function","function":{"name":"f","parameters":{}}}],"messages":[{"role":"user","content":"hi"}],"chosen":{"role":"assistant","content":"good"},"rejected":{"role":"assistant","content":"bad"}}',
    ]);
    const r = await validateDataset(p, { fullValidate: true, schema: "dpo" });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toContain("DPO_UNSUPPORTED_ELEMENT");
  });

  test("DPO chosen carrying an image item → DPO_UNSUPPORTED_ELEMENT error", async () => {
    const p = file("dpo_chosen_image.jsonl", [
      '{"messages":[{"role":"user","content":"hi"}],"chosen":{"role":"assistant","content":[{"text":"good"},{"image":"x.png"}]},"rejected":{"role":"assistant","content":"bad"}}',
    ]);
    const r = await validateDataset(p, { fullValidate: true, schema: "dpo" });
    expect(r.valid).toBe(false);
    const err = r.errors.find((e) => e.code === "DPO_UNSUPPORTED_ELEMENT");
    expect(err?.path).toContain("chosen");
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
    const p = file("cpt_auto.jsonl", [CPT_OK]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(true);
    expect(codes(r).errors).not.toContain("MISSING_MESSAGES");
  });

  test("SFT record with a stray text field still routes to ChatML", async () => {
    const p = file("mixed.jsonl", [
      '{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"yo"}],"text":"noise"}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(true);
    expect(codes(r).errors).toEqual([]);
  });
});

describe("validateDataset — content array format", () => {
  test("content as [{text}] array passes validation", async () => {
    const p = file("content_arr.jsonl", [
      '{"messages":[{"role":"system","content":[{"text":"sys"}]},{"role":"user","content":[{"text":"hi"}]},{"role":"assistant","content":[{"text":"hello"}]}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(true);
    expect(codes(r).errors).toEqual([]);
  });

  test("content as plain string still passes (legacy format)", async () => {
    const p = file("content_str.jsonl", [SFT_OK]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(true);
  });

  test("content array with image item passes (VL multimodal)", async () => {
    const p = file("content_img.jsonl", [
      '{"messages":[{"role":"user","content":[{"text":"describe"},{"image":"img1.jpg"}]},{"role":"assistant","content":[{"text":"a cat"}]}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(true);
  });

  test("content array with video string item passes", async () => {
    const p = file("content_vid.jsonl", [
      '{"messages":[{"role":"user","content":[{"text":"describe"},{"video":"vid1.mp4"}]},{"role":"assistant","content":[{"text":"a car"}]}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(true);
  });

  test("content array with video frame list passes", async () => {
    const p = file("content_frames.jsonl", [
      '{"messages":[{"role":"user","content":[{"text":"describe"},{"video":["0.jpg","1.jpg","2.jpg"]}]},{"role":"assistant","content":[{"text":"frames"}]}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(true);
  });

  test("content array with invalid item (no text/image/video) → error", async () => {
    const p = file("content_bad_item.jsonl", [
      '{"messages":[{"role":"user","content":[{"foo":"bar"}]},{"role":"assistant","content":"ok"}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toContain("CONTENT_ITEM_NO_KNOWN_FIELD");
  });

  test("content as number → INVALID_CONTENT error", async () => {
    const p = file("content_num.jsonl", [
      '{"messages":[{"role":"user","content":42},{"role":"assistant","content":"ok"}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toContain("INVALID_CONTENT");
  });

  test("empty content array → EMPTY_CONTENT_ARRAY error", async () => {
    const p = file("content_empty_arr.jsonl", [
      '{"messages":[{"role":"user","content":[]},{"role":"assistant","content":"ok"}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toContain("EMPTY_CONTENT_ARRAY");
  });

  test("DPO with content array format passes", async () => {
    const p = file("dpo_arr.jsonl", [
      '{"messages":[{"role":"user","content":[{"text":"hi"}]}],"chosen":{"role":"assistant","content":[{"text":"good"}]},"rejected":{"role":"assistant","content":[{"text":"bad"}]}}',
    ]);
    const r = await validateDataset(p, { fullValidate: true, schema: "dpo" });
    expect(r.valid).toBe(true);
  });
});

describe("validateDataset — tool calling (function calling)", () => {
  const TOOL_OK = JSON.stringify({
    tools: [
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "get weather",
          parameters: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
          },
        },
      },
    ],
    messages: [
      { role: "user", content: [{ text: "weather in Beijing" }] },
      {
        role: "assistant",
        content: [{ text: "let me check" }],
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "get_weather", arguments: '{"city":"Beijing"}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: [{ text: '{"weather":"sunny"}' }] },
      { role: "assistant", content: [{ text: "It is sunny." }] },
    ],
  });

  test("valid tool calling record passes", async () => {
    const p = file("tool_ok.jsonl", [TOOL_OK]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(true);
    expect(codes(r).errors).toEqual([]);
  });

  test("tool role is accepted (no INVALID_ROLE)", async () => {
    const p = file("tool_role.jsonl", [TOOL_OK]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(codes(r).errors).not.toContain("INVALID_ROLE");
  });

  test("tool message without tool_call_id → TOOL_MISSING_CALL_ID", async () => {
    const p = file("tool_no_id.jsonl", [
      '{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"","tool_calls":[{"id":"c1","type":"function","function":{"name":"f","arguments":"{}"}}]},{"role":"tool","content":"result"},{"role":"assistant","content":"done"}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toContain("TOOL_MISSING_CALL_ID");
  });

  test("tool_call_id unmatched → TOOL_CALL_ID_UNMATCHED error", async () => {
    const p = file("tool_unmatched.jsonl", [
      '{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"","tool_calls":[{"id":"c1","type":"function","function":{"name":"f","arguments":"{}"}}]},{"role":"tool","tool_call_id":"WRONG_ID","content":"result"},{"role":"assistant","content":"done"}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toContain("TOOL_CALL_ID_UNMATCHED");
    // The orphaned call side is advisory
    expect(codes(r).warnings).toContain("TOOL_CALL_NO_RESPONSE");
  });

  test("tool_calls without a tool response → TOOL_CALL_NO_RESPONSE warning", async () => {
    const p = file("tool_no_resp.jsonl", [
      '{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"","tool_calls":[{"id":"c1","type":"function","function":{"name":"f","arguments":"{}"}}]},{"role":"assistant","content":"done"}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(codes(r).warnings).toContain("TOOL_CALL_NO_RESPONSE");
  });

  test("tool_calls with missing function name → TOOL_CALL_FN_NO_NAME", async () => {
    const p = file("tool_no_fn_name.jsonl", [
      '{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"","tool_calls":[{"id":"c1","type":"function","function":{"arguments":"{}"}}]},{"role":"tool","tool_call_id":"c1","content":"r"},{"role":"assistant","content":"ok"}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toContain("TOOL_CALL_FN_NO_NAME");
  });

  test("assistant with tool_calls but no content is valid", async () => {
    const p = file("tool_no_content.jsonl", [
      '{"messages":[{"role":"user","content":"hi"},{"role":"assistant","tool_calls":[{"id":"c1","type":"function","function":{"name":"f","arguments":"{}"}}]},{"role":"tool","tool_call_id":"c1","content":"r"},{"role":"assistant","content":"ok"}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(true);
    expect(codes(r).errors).not.toContain("MISSING_CONTENT");
  });
});

describe("validateDataset — thinking tags", () => {
  test("think tag in last assistant is valid", async () => {
    const p = file("think_ok.jsonl", [
      '{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"<think>\\nreasoning\\n</think>\\n\\nanswer"}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(true);
    expect(codes(r).warnings).not.toContain("THINK_TAG_NOT_LAST");
  });

  test("think tag in non-last assistant → THINK_TAG_NOT_LAST warning", async () => {
    const p = file("think_mid.jsonl", [
      '{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"<think>\\nearly\\n</think>\\n\\nmid"},{"role":"user","content":"more"},{"role":"assistant","content":"final"}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(true);
    expect(codes(r).warnings).toContain("THINK_TAG_NOT_LAST");
  });

  test("think tag in content array format detected", async () => {
    const p = file("think_arr.jsonl", [
      '{"messages":[{"role":"user","content":[{"text":"hi"}]},{"role":"assistant","content":[{"text":"<think>\\nreason\\n</think>\\n\\nans"}]},{"role":"user","content":[{"text":"more"}]},{"role":"assistant","content":[{"text":"final"}]}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(true);
    expect(codes(r).warnings).toContain("THINK_TAG_NOT_LAST");
  });

  test("official tool+thinking combo: think in non-last assistant WITH tool_calls is exempt", async () => {
    // Mirrors the platform spec's 工具与思考组合 example: the assistant that
    // issues tool_calls carries the <think> block, the final assistant answers.
    const p = file("think_tool_combo.jsonl", [
      JSON.stringify({
        tools: [
          {
            type: "function",
            function: { name: "get_weather", description: "d", parameters: { type: "object" } },
          },
        ],
        messages: [
          { role: "user", content: [{ text: "weather in Beijing?" }] },
          {
            role: "assistant",
            content: [{ text: "<think>\nneed the weather tool\n</think>\n" }],
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "get_weather", arguments: '{"city":"Beijing"}' },
              },
            ],
          },
          { role: "tool", tool_call_id: "call_1", content: [{ text: '{"weather":"sunny"}' }] },
          { role: "assistant", content: [{ text: "It is sunny in Beijing." }] },
        ],
      }),
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(true);
    expect(codes(r).warnings).not.toContain("THINK_TAG_NOT_LAST");
  });
});

describe("validateDataset — OpenAI migration guards", () => {
  test("message-level name field → UNSUPPORTED_FIELD_NAME error", async () => {
    const p = file("openai_name.jsonl", [
      '{"messages":[{"role":"user","content":"hi","name":"alice"},{"role":"assistant","content":"hello"}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toContain("UNSUPPORTED_FIELD_NAME");
  });

  test("message-level weight field → UNSUPPORTED_FIELD_WEIGHT error", async () => {
    const p = file("openai_weight.jsonl", [
      '{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"hello","weight":0.5}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toContain("UNSUPPORTED_FIELD_WEIGHT");
  });

  test("record-level weight field → UNSUPPORTED_FIELD_WEIGHT error", async () => {
    const p = file("record_weight.jsonl", [
      '{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"hello"}],"weight":1}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toContain("UNSUPPORTED_FIELD_WEIGHT");
  });
});

describe("validateDataset — loss_weight", () => {
  test("valid loss_weight (0.5) passes", async () => {
    const p = file("lw_ok.jsonl", [
      '{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"hello"}],"loss_weight":0.5}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(true);
    expect(codes(r).errors).not.toContain("INVALID_LOSS_WEIGHT");
  });

  test("loss_weight out of range (1.5) → INVALID_LOSS_WEIGHT", async () => {
    const p = file("lw_bad.jsonl", [
      '{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"hello"}],"loss_weight":1.5}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toContain("INVALID_LOSS_WEIGHT");
  });

  test("loss_weight negative → INVALID_LOSS_WEIGHT", async () => {
    const p = file("lw_neg.jsonl", [
      '{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"hello"}],"loss_weight":-0.1}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toContain("INVALID_LOSS_WEIGHT");
  });

  test("loss_weight non-number → INVALID_LOSS_WEIGHT", async () => {
    const p = file("lw_str.jsonl", [
      '{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"hello"}],"loss_weight":"high"}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toContain("INVALID_LOSS_WEIGHT");
  });

  test("loss_weight boundary values 0 and 1 pass", async () => {
    const p = file("lw_boundary.jsonl", [
      '{"messages":[{"role":"user","content":"a"},{"role":"assistant","content":"b"}],"loss_weight":0}',
      '{"messages":[{"role":"user","content":"c"},{"role":"assistant","content":"d"}],"loss_weight":1}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(true);
  });

  test("message-level loss_weight on the LAST assistant passes without warning", async () => {
    const p = file("lw_msg_last.jsonl", [
      '{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"hello","loss_weight":0.8}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(true);
    expect(codes(r).warnings).not.toContain("LOSS_WEIGHT_PLACEMENT");
  });

  test("message-level loss_weight on a non-last assistant → LOSS_WEIGHT_PLACEMENT warning", async () => {
    const p = file("lw_msg_mid.jsonl", [
      '{"messages":[{"role":"user","content":"a"},{"role":"assistant","content":"b","loss_weight":0.8},{"role":"user","content":"c"},{"role":"assistant","content":"d"}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(codes(r).warnings).toContain("LOSS_WEIGHT_PLACEMENT");
  });

  test("message-level loss_weight out of range → INVALID_LOSS_WEIGHT", async () => {
    const p = file("lw_msg_range.jsonl", [
      '{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"hello","loss_weight":2}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toContain("INVALID_LOSS_WEIGHT");
  });
});

describe("validateDataset — video content params", () => {
  test("path-mode video with in-range fps and clip times passes", async () => {
    const p = file("video_path_ok.jsonl", [
      '{"messages":[{"role":"user","content":[{"text":"desc"},{"video":"v.mp4","fps":3.0,"video_start":0.0,"video_end":3.0}]},{"role":"assistant","content":[{"text":"ok"}]}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(true);
    expect(codes(r).warnings).not.toContain("VIDEO_PARAM_MODE_MISMATCH");
  });

  test("fps out of [0.1, 10] → INVALID_VIDEO_FPS error", async () => {
    const p = file("video_fps_bad.jsonl", [
      '{"messages":[{"role":"user","content":[{"text":"desc"},{"video":"v.mp4","fps":30}]},{"role":"assistant","content":[{"text":"ok"}]}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(false);
    expect(codes(r).errors).toContain("INVALID_VIDEO_FPS");
  });

  test("sample_fps on path-mode video → VIDEO_PARAM_MODE_MISMATCH warning", async () => {
    const p = file("video_mode_mix.jsonl", [
      '{"messages":[{"role":"user","content":[{"text":"desc"},{"video":"v.mp4","sample_fps":2.0}]},{"role":"assistant","content":[{"text":"ok"}]}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(codes(r).warnings).toContain("VIDEO_PARAM_MODE_MISMATCH");
  });

  test("frame-list video with sample_fps passes; fps there is flagged", async () => {
    const p = file("video_frames.jsonl", [
      '{"messages":[{"role":"user","content":[{"text":"desc"},{"video":["0.jpg","1.jpg"],"sample_fps":5.0}]},{"role":"assistant","content":[{"text":"ok"}]}]}',
      '{"messages":[{"role":"user","content":[{"text":"desc"},{"video":["0.jpg"],"fps":2.0}]},{"role":"assistant","content":[{"text":"ok"}]}]}',
    ]);
    const r = await validateDataset(p, { fullValidate: true });
    expect(r.valid).toBe(true);
    expect(codes(r).warnings).toContain("VIDEO_PARAM_MODE_MISMATCH");
  });
});

describe("validateZipFilenames — macOS metadata entries", () => {
  test("__MACOSX / .DS_Store / ._resource-fork entries are ignored", async () => {
    const { validateZipFilenames } = await import("../src/dataset/validate/zip.ts");
    const issues = validateZipFilenames([
      "data.jsonl",
      "image_1.jpg",
      "__MACOSX/._image_1.jpg",
      "__MACOSX/",
      ".DS_Store",
      "train/._clip.wav",
    ]);
    expect(issues).toEqual([]);
  });

  test("real charset violations are still reported", async () => {
    const { validateZipFilenames } = await import("../src/dataset/validate/zip.ts");
    const issues = validateZipFilenames(["data.jsonl", "图片1.jpg"]);
    expect(issues.map((issue) => issue.code)).toContain("INVALID_FILENAME_CHARSET");
  });
});

describe("parseDatasetSchemaFlag", () => {
  test("undefined / empty → undefined (auto)", () => {
    expect(parseDatasetSchemaFlag(undefined)).toBeUndefined();
    expect(parseDatasetSchemaFlag("")).toBeUndefined();
    expect(parseDatasetSchemaFlag("  ")).toBeUndefined();
  });

  test("chatml / dpo / cpt / tts / image / video pass through", () => {
    expect(parseDatasetSchemaFlag("chatml")).toBe("chatml");
    expect(parseDatasetSchemaFlag("dpo")).toBe("dpo");
    expect(parseDatasetSchemaFlag("cpt")).toBe("cpt");
    expect(parseDatasetSchemaFlag("tts")).toBe("tts");
    expect(parseDatasetSchemaFlag("image")).toBe("image");
    expect(parseDatasetSchemaFlag("video")).toBe("video");
    expect(parseDatasetSchemaFlag("  dpo ")).toBe("dpo");
  });

  test("unrecognized throws", () => {
    expect(() => parseDatasetSchemaFlag("sft")).toThrow(/Unsupported --schema/);
  });
});
