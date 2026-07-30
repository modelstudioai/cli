import { BailianError, ExitCode } from "bailian-cli-core";

/**
 * Decoder for the obfuscated API key ("o1_…") produced by the Model Studio web
 * console. Ported verbatim from the frontend `encodeTokenPlanKey` counterpart:
 * token = "o1_" + salt(6) + feistel-obfuscated payload + crc32 checksum(6),
 * all over a 65-character alphabet. Pure logic, no dependencies; the CLI only
 * ever needs the decode direction.
 */

const TOKEN_PREFIX = "o1_";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.";
const ALPHABET_SIZE = ALPHABET.length;
const ALPHABET_INDEX = new Map(ALPHABET.split("").map((character, index) => [character, index]));
const KEY_PATTERN = /^[A-Za-z0-9._-]+$/;
const SALT_LENGTH = 6;
const CHECKSUM_LENGTH = 6;
const FEISTEL_ROUNDS = 8;

function invalidCredential(): BailianError {
  return new BailianError(
    "Invalid obfuscated API key.",
    ExitCode.USAGE,
    '--key expects the obfuscated key copied from the web console (starts with "o1_").',
  );
}

function toDigits(value: string): number[] {
  const digits: number[] = [];
  for (const character of value) {
    const digit = ALPHABET_INDEX.get(character);
    if (digit === undefined) throw invalidCredential();
    digits.push(digit);
  }
  return digits;
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

function deobfuscatePayload(payload: string, salt: string): string {
  const digits = toDigits(payload);
  const midpoint = Math.floor(digits.length / 2);
  let left = digits.slice(0, midpoint);
  let right = digits.slice(midpoint);

  for (let round = FEISTEL_ROUNDS - 1; round >= 0; round -= 1) {
    const previousRight = left;
    const mask = createRoundMask(previousRight, salt, round, right.length);
    const previousLeft = right.map(
      (digit, index) => (digit - mask[index] + ALPHABET_SIZE) % ALPHABET_SIZE,
    );
    left = previousLeft;
    right = previousRight;
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
  if (remaining !== 0) throw invalidCredential();
  return encoded.join("");
}

function validateSalt(salt: string): void {
  if (salt.length !== SALT_LENGTH || !KEY_PATTERN.test(salt)) {
    throw invalidCredential();
  }
}

/** Decode an "o1_…" obfuscated token back into the plain API key. */
export function decodeTokenPlanKey(token: string): string {
  const minimumLength = TOKEN_PREFIX.length + SALT_LENGTH + CHECKSUM_LENGTH + 1;
  if (token.length < minimumLength || !token.startsWith(TOKEN_PREFIX)) {
    throw invalidCredential();
  }

  const body = token.slice(TOKEN_PREFIX.length);
  if (!KEY_PATTERN.test(body)) throw invalidCredential();

  const salt = body.slice(0, SALT_LENGTH);
  const payload = body.slice(SALT_LENGTH, -CHECKSUM_LENGTH);
  const checksum = body.slice(-CHECKSUM_LENGTH);
  validateSalt(salt);
  if (!payload) throw invalidCredential();

  const apiKey = deobfuscatePayload(payload, salt);
  if (!KEY_PATTERN.test(apiKey)) throw invalidCredential();

  const expectedChecksum = encodeBase65Number(crc32(apiKey), CHECKSUM_LENGTH);
  if (checksum !== expectedChecksum) throw invalidCredential();
  return apiKey;
}
