import { describe, expect, test } from "vite-plus/test";
import { decodeTokenPlanKey } from "../src/commands/config/agent/decode-key.ts";

/**
 * decode-key 单元测试:在测试内移植前端 encodeTokenPlanKey 参考实现
 * (bailian-tokenplan encode-token-plan-key.ts),做 encode → decode round-trip,
 * 保证 CLI 解码与前端编码逐位互逆。
 */

const TOKEN_PREFIX = "o1_";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.";
const ALPHABET_SIZE = ALPHABET.length;
const ALPHABET_INDEX = new Map(ALPHABET.split("").map((character, index) => [character, index]));
const CHECKSUM_LENGTH = 6;
const FEISTEL_ROUNDS = 8;

function toDigits(value: string): number[] {
  return value.split("").map((character) => {
    const digit = ALPHABET_INDEX.get(character);
    if (digit === undefined) throw new Error("bad char");
    return digit;
  });
}

function fromDigits(digits: number[]): string {
  return digits.map((digit) => ALPHABET[digit]).join("");
}

function mixState(state: number, value: number): number {
  return Math.imul((state ^ value) >>> 0, 0x01000193) >>> 0;
}

function nextState(state: number): number {
  let next = state >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
}

function createRoundMask(right: number[], salt: string, round: number, length: number): number[] {
  let state = (0x811c9dc5 ^ Math.imul(round + 1, 0x9e3779b1)) >>> 0;
  state = mixState(state, right.length);
  state = mixState(state, length);
  for (const character of salt) {
    state = mixState(state, (ALPHABET_INDEX.get(character) ?? -1) + 1);
  }
  for (const digit of right) {
    state = mixState(state, digit + 1);
  }
  state ^= state >>> 16;
  state = Math.imul(state, 0x85ebca6b) >>> 0;
  state ^= state >>> 13;
  state = Math.imul(state, 0xc2b2ae35) >>> 0;
  state ^= state >>> 16;
  state = state >>> 0 || 0x6d2b79f5;

  const mask: number[] = [];
  for (let index = 0; index < length; index += 1) {
    state = (state + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
    state = nextState(state);
    mask.push(state % ALPHABET_SIZE);
  }
  return mask;
}

function obfuscatePayload(apiKey: string, salt: string): string {
  const digits = toDigits(apiKey);
  const midpoint = Math.floor(digits.length / 2);
  let left = digits.slice(0, midpoint);
  let right = digits.slice(midpoint);

  for (let round = 0; round < FEISTEL_ROUNDS; round += 1) {
    const mask = createRoundMask(right, salt, round, left.length);
    const nextRight = left.map((digit, index) => (digit + mask[index]) % ALPHABET_SIZE);
    left = right;
    right = nextRight;
  }
  return fromDigits([...left, ...right]);
}

function crc32(value: string): number {
  let checksum = 0xffffffff;
  for (let index = 0; index < value.length; index += 1) {
    checksum ^= value.charCodeAt(index);
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(checksum & 1);
      checksum = (checksum >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function encodeBase65Number(value: number, length: number): string {
  let remaining = value >>> 0;
  const encoded = Array<string>(length).fill(ALPHABET[0]);
  for (let index = length - 1; index >= 0; index -= 1) {
    encoded[index] = ALPHABET[remaining % ALPHABET_SIZE];
    remaining = Math.floor(remaining / ALPHABET_SIZE);
  }
  return encoded.join("");
}

/** 前端 encodeTokenPlanKey 的测试内移植(固定 salt)。 */
function encodeTokenPlanKey(apiKey: string, salt: string): string {
  const payload = obfuscatePayload(apiKey, salt);
  const checksum = encodeBase65Number(crc32(apiKey), CHECKSUM_LENGTH);
  return TOKEN_PREFIX + salt + payload + checksum;
}

describe("config agent decode-key", () => {
  test("encode → decode round-trip 还原原始 apiKey", () => {
    const samples = [
      "sk-1234567890abcdef",
      "sk-sp-H.PML.Ns85.MEUCIFHbYk4yBBWLGegORHfWZGB5DdSEs6ms3AwyMsuTOk0CAiEAlOwrUO6dz6IYPUlJ4gK7u6kjStkythgxWaVP5B28ly0",
      "a",
      "A-b_c.9",
    ];
    const salts = ["AbC123", "zzzzzz", "0.-_Zq", "AAAAAA"];
    for (const apiKey of samples) {
      for (const salt of salts) {
        expect(decodeTokenPlanKey(encodeTokenPlanKey(apiKey, salt))).toBe(apiKey);
      }
    }
  });

  test("固定 salt 的确定性:相同输入产出相同 token 且可解码", () => {
    const tokenA = encodeTokenPlanKey("sk-fixed-key", "S4ltS4");
    const tokenB = encodeTokenPlanKey("sk-fixed-key", "S4ltS4");
    expect(tokenA).toBe(tokenB);
    expect(decodeTokenPlanKey(tokenA)).toBe("sk-fixed-key");
  });

  test("篡改 checksum 抛错", () => {
    const token = encodeTokenPlanKey("sk-checksum-test", "AbC123");
    const flippedTail = token.slice(-1) === "A" ? "B" : "A";
    const tampered = token.slice(0, -1) + flippedTail;
    expect(() => decodeTokenPlanKey(tampered)).toThrow(/Invalid obfuscated API key/);
  });

  test("篡改 salt 抛错(payload 解出与 checksum 不符)", () => {
    const token = encodeTokenPlanKey("sk-salt-test", "AbC123");
    const body = token.slice(TOKEN_PREFIX.length);
    const flippedSaltHead = body[0] === "A" ? "B" : "A";
    const tampered = TOKEN_PREFIX + flippedSaltHead + body.slice(1);
    expect(() => decodeTokenPlanKey(tampered)).toThrow(/Invalid obfuscated API key/);
  });

  test("非法前缀 / 非法字符 / 过短 token 抛错", () => {
    expect(() => decodeTokenPlanKey("x1_AbC123payloadAAAAAA")).toThrow(
      /Invalid obfuscated API key/,
    );
    expect(() => decodeTokenPlanKey("o1_AbC123pay!oadAAAAAA")).toThrow(
      /Invalid obfuscated API key/,
    );
    expect(() => decodeTokenPlanKey("o1_short")).toThrow(/Invalid obfuscated API key/);
    expect(() => decodeTokenPlanKey("")).toThrow(/Invalid obfuscated API key/);
  });
});
