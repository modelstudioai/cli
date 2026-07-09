import { formatOutput, type OutputFormat } from "bailian-cli-core";

/**
 * Emit the primary result of a command.
 *   stdout → result (text by default; JSON with --output json)
 *   stderr → human info (progress, logs, tips) — handled elsewhere
 */
export function emitResult(data: unknown, format: OutputFormat): void {
  process.stdout.write(formatOutput(data, format) + "\n");
}

/**
 * Emit a bare value (file path, plain text) to stdout.
 * Used in --quiet mode or when the result is a single scalar.
 */
export function emitBare(value: string): void {
  process.stdout.write(value + "\n");
}
