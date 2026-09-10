import { describe, expect, test } from "vite-plus/test";
import {
  parseInstantVocabulary,
  parseVocabularyEntries,
  buildVocabularyRequest,
  SPEECH_BIASING_MODEL,
  UsageError,
} from "../src/index.ts";

describe("parseInstantVocabulary", () => {
  test("接受 word→weight 对象", () => {
    expect(parseInstantVocabulary('{"奋斗者":4,"鲸落":5}')).toEqual({
      奋斗者: 4,
      鲸落: 5,
    });
  });

  test("拒绝数组", () => {
    expect(() => parseInstantVocabulary('[{"text":"x","weight":4}]')).toThrow(UsageError);
    expect(() => parseInstantVocabulary('[{"text":"x","weight":4}]')).toThrow(/object/i);
  });

  test("拒绝字符串权重", () => {
    expect(() => parseInstantVocabulary('{"x":"4"}')).toThrow(UsageError);
    expect(() => parseInstantVocabulary('{"x":"4"}')).toThrow(/must be a number/);
  });

  test("拒绝非有限数字权重（null）", () => {
    expect(() => parseInstantVocabulary('{"x":null}')).toThrow(UsageError);
    expect(() => parseInstantVocabulary('{"x":null}')).toThrow(/must be a number/);
  });

  test("拒绝 NaN / Infinity 字面量（非法 JSON）", () => {
    expect(() => parseInstantVocabulary('{"x":NaN}')).toThrow(UsageError);
    expect(() => parseInstantVocabulary('{"x":Infinity}')).toThrow(UsageError);
  });

  test("拒绝顶层 null", () => {
    expect(() => parseInstantVocabulary("null")).toThrow(UsageError);
  });

  test("非法 JSON 抛 UsageError", () => {
    expect(() => parseInstantVocabulary("{bad json")).toThrow(UsageError);
    expect(() => parseInstantVocabulary("{bad json")).toThrow(/not valid JSON/);
  });
});

describe("parseVocabularyEntries", () => {
  test("对象形态转为条目数组", () => {
    expect(parseVocabularyEntries('{"奋斗者":4,"鲸落":5}')).toEqual([
      { text: "奋斗者", weight: 4 },
      { text: "鲸落", weight: 5 },
    ]);
  });

  test("对象形态叠加 --lang", () => {
    expect(parseVocabularyEntries('{"奋斗者":4}', "zh")).toEqual([
      { text: "奋斗者", weight: 4, lang: "zh" },
    ]);
  });

  test("数组形态透传 lang", () => {
    expect(
      parseVocabularyEntries('[{"text":"奋斗者","weight":4,"lang":"zh"}]'),
    ).toEqual([{ text: "奋斗者", weight: 4, lang: "zh" }]);
  });

  test("数组形态忽略第二参 lang", () => {
    expect(
      parseVocabularyEntries('[{"text":"奋斗者","weight":4}]', "zh"),
    ).toEqual([{ text: "奋斗者", weight: 4 }]);
    expect(
      parseVocabularyEntries('[{"text":"奋斗者","weight":4,"lang":"en"}]', "zh"),
    ).toEqual([{ text: "奋斗者", weight: 4, lang: "en" }]);
  });

  test("数组缺 text 或 weight 拒绝", () => {
    expect(() => parseVocabularyEntries('[{"weight":4}]')).toThrow(UsageError);
    expect(() => parseVocabularyEntries('[{"text":"x"}]')).toThrow(UsageError);
  });

  test("非 object 数组元素拒绝", () => {
    expect(() => parseVocabularyEntries('["x"]')).toThrow(UsageError);
    expect(() => parseVocabularyEntries("[null]")).toThrow(UsageError);
  });

  test("空对象 / 空数组拒绝", () => {
    expect(() => parseVocabularyEntries("{}")).toThrow(UsageError);
    expect(() => parseVocabularyEntries("{}")).toThrow(/at least one/);
    expect(() => parseVocabularyEntries("[]")).toThrow(UsageError);
    expect(() => parseVocabularyEntries("[]")).toThrow(/at least one/);
  });
});

describe("buildVocabularyRequest", () => {
  test("固定 model 为 speech-biasing", () => {
    const body = buildVocabularyRequest("create_vocabulary", {
      target_model: "fun-asr",
      prefix: "demo",
      vocabulary: [{ text: "奋斗者", weight: 4 }],
    });
    expect(body.model).toBe(SPEECH_BIASING_MODEL);
    expect(body.model).toBe("speech-biasing");
    expect(body.input.action).toBe("create_vocabulary");
  });
});
