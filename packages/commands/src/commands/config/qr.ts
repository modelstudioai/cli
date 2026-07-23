/**
 * Minimal, dependency-free QR Code encoder used by the config UI to show a
 * scannable code for the current session URL.
 *
 * Scope is deliberately narrow: byte mode, error-correction level L, versions
 * 1–5 (21x21 … 37x37). Restricting to level L keeps every supported version a
 * single Reed–Solomon block, so no codeword interleaving is required. Version 5
 * (level L) holds up to 108 data bytes, comfortably more than a
 * `http://127.0.0.1:<port>/?token=<hex>` URL.
 *
 * The output is an SVG string with a 4-module quiet zone and a `viewBox` only
 * (no fixed width/height), so the caller sizes it via CSS.
 */

// --- GF(256) arithmetic (primitive polynomial 0x11D) ---

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gmul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** Reed–Solomon generator polynomial for `degree` EC codewords (alpha exponents). */
export function rsGeneratorExp(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next: number[] = Array.from({ length: poly.length + 1 }, () => 0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gmul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly.map((v) => LOG[v]);
}

/** Compute `ecLen` Reed–Solomon error-correction codewords for `data`. */
export function rsEncode(data: number[], ecLen: number): number[] {
  const gen = rsGeneratorExp(ecLen);
  const res = new Uint8Array(data.length + ecLen);
  res.set(data, 0);
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) {
      const lead = LOG[coef];
      for (let j = 0; j < gen.length; j++) res[i + j] ^= EXP[(gen[j] + lead) % 255];
    }
  }
  return Array.from(res.slice(data.length));
}

// --- Capacity table: [data codewords, EC codewords] per version at level L ---

const CAP_L: Array<[number, number]> = [
  [19, 7], // V1 (21x21)
  [34, 10], // V2 (25x25)
  [55, 15], // V3 (29x29)
  [80, 20], // V4 (33x33)
  [108, 26], // V5 (37x37)
];

const EC_BITS_L = 0b01; // format-info error-correction level bits for L

function pickVersion(byteLen: number): number {
  const bits = 4 + 8 + byteLen * 8; // mode + 8-bit count (V1–9) + payload
  for (let v = 0; v < CAP_L.length; v++) {
    if (CAP_L[v][0] * 8 >= bits) return v + 1;
  }
  throw new Error("qr: data too large for supported versions (max 108 bytes)");
}

// --- Bit/codeword assembly ---

function toCodewords(bytes: Uint8Array, version: number): number[] {
  const [dataCw] = CAP_L[version - 1];
  const bits: number[] = [];
  const put = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  put(0b0100, 4); // byte mode
  put(bytes.length, 8); // character count (versions 1–9)
  for (const b of bytes) put(b, 8);

  const capBits = dataCw * 8;
  put(0, Math.min(4, capBits - bits.length)); // terminator
  while (bits.length % 8 !== 0) bits.push(0); // pad to byte

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    data.push(v);
  }
  const pads = [0xec, 0x11];
  for (let p = 0; data.length < dataCw; p++) data.push(pads[p % 2]);

  return data.concat(rsEncode(data, CAP_L[version - 1][1]));
}

// --- Matrix construction ---

interface Grid {
  size: number;
  mod: Uint8Array; // 0/1
  fn: Uint8Array; // 1 = function/reserved module (skip during data placement)
}

function newGrid(size: number): Grid {
  return { size, mod: new Uint8Array(size * size), fn: new Uint8Array(size * size) };
}

function setFn(g: Grid, r: number, c: number, dark: number): void {
  g.mod[r * g.size + c] = dark;
  g.fn[r * g.size + c] = 1;
}

function drawFinder(g: Grid, r: number, c: number): void {
  for (let dr = -1; dr <= 7; dr++) {
    for (let dc = -1; dc <= 7; dc++) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || rr >= g.size || cc < 0 || cc >= g.size) continue;
      const inRing = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
      const isDark =
        inRing &&
        (dr === 0 ||
          dr === 6 ||
          dc === 0 ||
          dc === 6 ||
          (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
      setFn(g, rr, cc, isDark ? 1 : 0);
    }
  }
}

function drawAlignment(g: Grid, cr: number, cc: number): void {
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const ring = Math.max(Math.abs(dr), Math.abs(dc));
      setFn(g, cr + dr, cc + dc, ring === 1 ? 0 : 1);
    }
  }
}

function drawFunctionPatterns(g: Grid, version: number): void {
  const size = g.size;
  // Timing patterns.
  for (let i = 0; i < size; i++) {
    setFn(g, 6, i, i % 2 === 0 ? 1 : 0);
    setFn(g, i, 6, i % 2 === 0 ? 1 : 0);
  }
  // Finder patterns + separators (drawn as the -1 border above).
  drawFinder(g, 0, 0);
  drawFinder(g, 0, size - 7);
  drawFinder(g, size - 7, 0);
  // Alignment pattern (single, centered) for versions 2–5.
  if (version >= 2) {
    const pos = size - 7; // e.g. 18 (V2), 22 (V3), 26 (V4), 30 (V5)
    drawAlignment(g, pos, pos);
  }
  // Reserve format-info areas (values written later).
  for (let i = 0; i < 9; i++) {
    if (!(i === 6)) g.fn[8 * size + i] = 1;
    if (!(i === 6)) g.fn[i * size + 8] = 1;
  }
  g.fn[8 * size + 6] = 1;
  g.fn[6 * size + 8] = 1;
  for (let i = 0; i < 8; i++) g.fn[(size - 1 - i) * size + 8] = 1;
  for (let i = 0; i < 8; i++) g.fn[8 * size + (size - 1 - i)] = 1;
  // Dark module.
  setFn(g, size - 8, 8, 1);
}

function placeData(g: Grid, codewords: number[]): void {
  const size = g.size;
  const stream: number[] = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) stream.push((cw >> i) & 1);
  let idx = 0;
  let upward = true;
  for (let col = size - 1; col >= 1; col -= 2) {
    if (col === 6) col = 5; // skip the vertical timing column
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (const off of [0, 1]) {
        const cc = col - off;
        if (g.fn[row * size + cc]) continue;
        g.mod[row * size + cc] = idx < stream.length ? stream[idx++] : 0;
      }
    }
    upward = !upward;
  }
}

const MASKS: Array<(r: number, c: number) => boolean> = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(g: Grid, mask: number): void {
  const cond = MASKS[mask];
  for (let r = 0; r < g.size; r++) {
    for (let c = 0; c < g.size; c++) {
      if (!g.fn[r * g.size + c] && cond(r, c)) g.mod[r * g.size + c] ^= 1;
    }
  }
}

function penalty(g: Grid): number {
  const size = g.size;
  const at = (r: number, c: number) => g.mod[r * size + c];
  let score = 0;
  // Rule 1: runs of >=5 same-color modules in rows and columns.
  for (let r = 0; r < size; r++) {
    let runC = 1;
    let runR = 1;
    for (let c = 1; c < size; c++) {
      if (at(r, c) === at(r, c - 1)) runC++;
      else {
        if (runC >= 5) score += runC - 2;
        runC = 1;
      }
      if (at(c, r) === at(c - 1, r)) runR++;
      else {
        if (runR >= 5) score += runR - 2;
        runR = 1;
      }
    }
    if (runC >= 5) score += runC - 2;
    if (runR >= 5) score += runR - 2;
  }
  // Rule 2: 2x2 blocks of the same color.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = at(r, c);
      if (v === at(r, c + 1) && v === at(r + 1, c) && v === at(r + 1, c + 1)) score += 3;
    }
  }
  // Rule 3: finder-like 1:1:3:1:1 patterns.
  const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const match = (get: (k: number) => number, start: number, pat: number[]) => {
    for (let k = 0; k < pat.length; k++) if (get(start + k) !== pat[k]) return false;
    return true;
  };
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size - 11; c++) {
      if (match((k) => at(r, k), c, pat1) || match((k) => at(r, k), c, pat2)) score += 40;
      if (match((k) => at(k, r), c, pat1) || match((k) => at(k, r), c, pat2)) score += 40;
    }
  }
  // Rule 4: proportion of dark modules.
  let dark = 0;
  for (let i = 0; i < size * size; i++) dark += g.mod[i];
  const percent = (dark * 100) / (size * size);
  const k = Math.floor(Math.abs(percent - 50) / 5);
  score += k * 10;
  return score;
}

function formatBits(mask: number): number {
  const data = (EC_BITS_L << 3) | mask; // 5 bits
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
  return ((data << 10) | rem) ^ 0x5412;
}

function drawFormat(g: Grid, mask: number): void {
  const size = g.size;
  const fmt = formatBits(mask);
  const bit = (i: number) => (fmt >> i) & 1;
  // First copy: around the top-left finder. Bits 0–5 run down column 8
  // (rows 0–5); bits 9–14 run left along row 8 (cols 5–0).
  for (let i = 0; i <= 5; i++) g.mod[i * size + 8] = bit(i);
  g.mod[7 * size + 8] = bit(6);
  g.mod[8 * size + 8] = bit(7);
  g.mod[8 * size + 7] = bit(8);
  for (let i = 9; i < 15; i++) g.mod[8 * size + (14 - i)] = bit(i);
  // Second copy: split across top-right and bottom-left.
  for (let i = 0; i < 8; i++) g.mod[(size - 1 - i) * size + 8] = bit(i);
  for (let i = 8; i < 15; i++) g.mod[8 * size + (size - 15 + i)] = bit(i);
  g.mod[(size - 8) * size + 8] = 1; // dark module stays set
}

/** Build the final QR module matrix (true = dark) for `text`. */
export function qrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const version = pickVersion(bytes.length);
  const codewords = toCodewords(bytes, version);
  const g = newGrid(17 + 4 * version);
  drawFunctionPatterns(g, version);
  placeData(g, codewords);

  let best = 0;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(g, m);
    drawFormat(g, m);
    const s = penalty(g);
    if (s < bestScore) {
      bestScore = s;
      best = m;
    }
    applyMask(g, m); // undo (XOR is its own inverse)
  }
  applyMask(g, best);
  drawFormat(g, best);

  const out: boolean[][] = [];
  for (let r = 0; r < g.size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < g.size; c++) row.push(g.mod[r * g.size + c] === 1);
    out.push(row);
  }
  return out;
}

/** Render `text` as an SVG QR code string (4-module quiet zone, viewBox only). */
export function qrSvg(text: string): string {
  const m = qrMatrix(text);
  const size = m.length;
  const quiet = 4;
  const dim = size + quiet * 2;
  let rects = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (m[r][c]) rects += `<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1"/>`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="QR code">` +
    `<rect width="${dim}" height="${dim}" fill="#ffffff"/>` +
    `<g fill="#000000">${rects}</g></svg>`
  );
}
