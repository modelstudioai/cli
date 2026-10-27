import { createInterface } from "node:readline/promises";
import { throwIfCancelled } from "../llm/errors.ts";

export interface AskOptions {
  signal?: AbortSignal;
  question: string;
  options: string[];
  defaultIfSkip: string;
}

export interface Interaction {
  ask(opts: AskOptions): Promise<string>;
}

/**
 * TTY interaction: numbered choice prompt via readline.
 * The user can pick a number, press Enter for the default, or type a
 * free-text description of their need (fed verbatim into the engine input).
 */
export function createReadlineInteraction(): Interaction {
  return {
    async ask({ question, options, defaultIfSkip, signal }) {
      throwIfCancelled(signal);
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      try {
        process.stderr.write(`\n${question}\n`);
        options.forEach((opt, idx) => {
          const isDefault = opt === defaultIfSkip;
          process.stderr.write(`  ${idx + 1}. ${opt}${isDefault ? " (default)" : ""}\n`);
        });
        process.stderr.write(`  输入序号选择，回车使用默认，或直接输入文字描述你的需求\n`);
        for (;;) {
          const answer = (await rl.question("Select: ", { signal })).trim();
          throwIfCancelled(signal);
          if (!answer) return defaultIfSkip;
          if (/^\d+$/.test(answer)) {
            const idx = Number.parseInt(answer, 10) - 1;
            if (idx >= 0 && idx < options.length) return options[idx];
            process.stderr.write(`  请输入 1-${options.length} 之间的序号，或直接输入文字描述\n`);
            continue;
          }
          return answer; // free-text description
        }
      } finally {
        rl.close();
      }
    },
  };
}

/** Non-TTY degradation: always answer with the default, note it on stderr. */
export function createNonInteractive(): Interaction {
  return {
    async ask({ question, defaultIfSkip, signal }) {
      throwIfCancelled(signal);
      process.stderr.write(
        `[recommend] non-interactive, "${question}" → default: ${defaultIfSkip}\n`,
      );
      return defaultIfSkip;
    },
  };
}
