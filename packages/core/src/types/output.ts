import type { LocalizedText } from "./command.ts";

/** Custom text presentation never replaces the primary JSON data. */
export interface OutputResultOptions {
  text?: string;
}

export interface OutputDiagnostic {
  message: LocalizedText;
  code?: string;
  /** Structured diagnostic context; the runtime redacts credential keys. */
  details?: unknown;
}

export type OutputMessage = LocalizedText | OutputDiagnostic;

/** Per-invocation output surface. Throw terminal failures instead of printing them. */
export interface CommandOutput {
  result(data: unknown, options?: OutputResultOptions): void;
  progress(message: LocalizedText): void;
  info(message: LocalizedText): void;
  warning(warning: OutputMessage): void;
  debug(details: OutputMessage): void;
}
