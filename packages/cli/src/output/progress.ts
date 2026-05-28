const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface Spinner {
  start(): void;
  update(text: string): void;
  stop(finalText?: string): void;
}

export function createSpinner(label: string): Spinner {
  const isTTY = process.stderr.isTTY;
  let frame = 0;
  let interval: ReturnType<typeof setInterval> | null = null;
  let currentLabel = label;

  return {
    start() {
      if (!isTTY) return;
      interval = setInterval(() => {
        process.stderr.write(`\r${SPINNER_FRAMES[frame % SPINNER_FRAMES.length]} ${currentLabel}`);
        frame++;
      }, 80);
    },
    update(text: string) {
      currentLabel = text;
    },
    stop(finalText?: string) {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      if (isTTY) {
        process.stderr.write("\r\x1b[K");
        if (finalText) {
          process.stderr.write(`${finalText}\n`);
        }
      }
    },
  };
}

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
