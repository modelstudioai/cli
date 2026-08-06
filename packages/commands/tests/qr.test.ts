import { expect, test } from "vite-plus/test";
import { rsGeneratorExp, rsEncode, qrMatrix, qrSvg } from "../src/commands/config/qr.ts";

test("rsGeneratorExp 匹配已知 QR 生成多项式(alpha 指数)", () => {
  // Well-documented QR generator polynomials — a strong correctness anchor for
  // the GF(256) arithmetic and polynomial construction.
  expect(rsGeneratorExp(7)).toEqual([0, 87, 229, 146, 149, 238, 102, 21]);
  expect(rsGeneratorExp(10)).toEqual([0, 251, 67, 46, 61, 118, 70, 64, 94, 32, 45]);
  expect(rsGeneratorExp(15)).toEqual([
    0, 8, 183, 61, 91, 202, 37, 51, 58, 58, 237, 140, 124, 5, 99, 105,
  ]);
});

test("rsEncode 产出请求数量的纠错码字", () => {
  const ec = rsEncode([0x40, 0xd2, 0x75, 0x47, 0x76, 0x17, 0x32, 0x06, 0x27, 0x26], 10);
  expect(ec).toHaveLength(10);
  expect(ec.every((b) => b >= 0 && b <= 255)).toBe(true);
});

test("qrMatrix 尺寸随版本增长且含三个定位图案", () => {
  const m = qrMatrix("http://127.0.0.1:8787/?token=" + "a".repeat(32));
  // ~61 byte URL -> version 4 (33x33).
  expect(m.length).toBe(33);
  expect(m[0]).toHaveLength(33);
  const size = m.length;
  // Finder pattern centers are dark (3x3 core) at the three corners.
  expect(m[3][3]).toBe(true);
  expect(m[3][size - 4]).toBe(true);
  expect(m[size - 4][3]).toBe(true);
  // Timing pattern alternates on row/col 6.
  expect(m[6][8]).toBe(true);
  expect(m[6][9]).toBe(false);
});

test("qrMatrix 短文本用最小版本(V1=21x21)", () => {
  expect(qrMatrix("hi").length).toBe(21);
});

test("qrSvg 返回带 viewBox 的 SVG 且含模块矩形", () => {
  const svg = qrSvg("http://127.0.0.1:8787/");
  expect(svg.startsWith("<svg")).toBe(true);
  expect(svg).toContain("viewBox=");
  expect(svg).toContain("<rect");
});

test("qrMatrix 超长数据抛出清晰错误", () => {
  expect(() => qrMatrix("x".repeat(200))).toThrow(/too large/);
});

// --- End-to-end: decode the produced matrix with the STANDARD reading order
// and confirm it round-trips back to the original text. This is the real proof
// that the code is scannable (format-info placement + mask + data placement),
// which cannot be checked by structure alone. The format info is read from the
// FIRST copy (top-left) using the canonical mapping, independent of the encoder.
const MASK_FNS: Array<(r: number, c: number) => boolean> = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function qrDecode(m: boolean[][]): { text: string; mask: number; ecLevel: number } {
  const size = m.length;
  const version = (size - 17) / 4;
  const bAt = (r: number, c: number) => (m[r][c] ? 1 : 0);

  // Read the 15-bit format info from the first copy (canonical cell mapping).
  const cells: Array<[number, number]> = [
    [0, 8],
    [1, 8],
    [2, 8],
    [3, 8],
    [4, 8],
    [5, 8], // bits 0–5
    [7, 8], // bit 6
    [8, 8], // bit 7
    [8, 7], // bit 8
    [8, 5],
    [8, 4],
    [8, 3],
    [8, 2],
    [8, 1],
    [8, 0], // bits 9–14
  ];
  let fmt = 0;
  for (let i = 0; i < 15; i++) fmt |= bAt(cells[i][0], cells[i][1]) << i;
  fmt ^= 0x5412;
  const mask = (fmt >> 10) & 7;
  const ecLevel = (fmt >> 13) & 3;
  const cond = MASK_FNS[mask];

  // Independent function/reserved-module map.
  const isFn = (r: number, c: number): boolean => {
    if (r <= 7 && c <= 7) return true; // top-left finder + separator
    if (r <= 7 && c >= size - 8) return true; // top-right finder
    if (r >= size - 8 && c <= 7) return true; // bottom-left finder
    if (r === 6 || c === 6) return true; // timing
    if (r === 8 && (c <= 8 || c >= size - 8)) return true; // format (horizontal)
    if (c === 8 && (r <= 8 || r >= size - 8)) return true; // format (vertical) + dark
    if (version >= 2) {
      const ac = size - 7;
      if (Math.abs(r - ac) <= 2 && Math.abs(c - ac) <= 2) return true; // alignment
    }
    return false;
  };

  // Read data modules in the standard right-to-left zigzag, un-masking as we go.
  const bits: number[] = [];
  let upward = true;
  for (let col = size - 1; col >= 1; col -= 2) {
    if (col === 6) col = 5;
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (const off of [0, 1]) {
        const cc = col - off;
        if (isFn(row, cc)) continue;
        let b = bAt(row, cc);
        if (cond(row, cc)) b ^= 1;
        bits.push(b);
      }
    }
    upward = !upward;
  }

  let p = 0;
  const read = (n: number) => {
    let v = 0;
    for (let k = 0; k < n; k++) v = (v << 1) | (bits[p++] ?? 0);
    return v;
  };
  const mode = read(4);
  if (mode !== 0b0100) throw new Error("decode: not byte mode, got " + mode);
  const len = read(8);
  const out: number[] = [];
  for (let i = 0; i < len; i++) out.push(read(8));
  return { text: new TextDecoder().decode(new Uint8Array(out)), mask, ecLevel };
}

test("qrMatrix → 标准解码能无损还原原文(失败则说明无法扫描)", () => {
  const samples = [
    "hi",
    "http://127.0.0.1:8787/",
    "http://127.0.0.1:8787/?token=" + "a".repeat(32),
    "http://127.0.0.1:65535/?token=0123456789abcdef0123456789abcdef",
  ];
  for (const text of samples) {
    const decoded = qrDecode(qrMatrix(text));
    expect(decoded.text).toBe(text);
    expect(decoded.ecLevel).toBe(0b01); // error-correction level L
    expect(decoded.mask).toBeGreaterThanOrEqual(0);
    expect(decoded.mask).toBeLessThanOrEqual(7);
  }
});
