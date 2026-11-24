/**
 * 确定性伪随机数与洗牌。
 *
 * 数据准备（画像规划、train/development 切分）需要可复现的随机顺序：同一 seed
 * 在 CLI 内产出一致结果。这里用 mulberry32 + Fisher–Yates，刻意不依赖运行时随机源。
 *
 * 注意：PRNG 与示例脚本的 Python `random.Random` 不同，洗牌顺序不逐位一致；
 * 同 seed 仅在 CLI 内确定，不承诺与脚本跨工具复现同一 split。
 */

/** mulberry32：以 32 位整数为状态的小型确定性 PRNG，返回 [0, 1) 浮点。 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** 用给定随机源做 Fisher–Yates 洗牌，返回新数组，不修改入参。 */
export function shuffleWithRandom<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    const temporary = result[index];
    result[index] = result[swapIndex];
    result[swapIndex] = temporary;
  }
  return result;
}

/** 以 seed 构造确定性随机源并洗牌。 */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  return shuffleWithRandom(items, mulberry32(seed));
}
