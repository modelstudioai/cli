export interface ProgressBar {
  update(current: number): void;
  finish(): void;
}

export function createProgressBar(total: number, label = ""): ProgressBar {
  const isTTY = process.stderr.isTTY;
  const width = 30;

  return {
    update(current: number) {
      if (!isTTY) return;
      const pct = Math.min(1, current / total);
      const filled = Math.round(width * pct);
      const empty = width - filled;
      const bar = "█".repeat(filled) + "░".repeat(empty);
      const pctStr = `${Math.round(pct * 100)}%`;
      process.stderr.write(`\r${label} ${bar} ${pctStr}`);
    },
    finish() {
      if (isTTY) {
        process.stderr.write("\n");
      }
    },
  };
}
