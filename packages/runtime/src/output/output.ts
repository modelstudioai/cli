import { formatOutput, type OutputFormat } from "bailian-cli-core";

/**
 * Emit the primary result of a command.
 *
 * Design principle:
 *   stdout  → structured data only (JSON when piped, text when TTY)
 *   stderr  → human info (progress, logs, tips) — handled elsewhere
 *
 * This ensures `bl cmd ... | jq .` always receives clean JSON,
 * while interactive users see human-readable text.
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
