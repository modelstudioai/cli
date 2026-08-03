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

/**
 * Surface a server request id for text-mode output. Written to stderr (the
 * diagnostic channel) so it never corrupts the primary stdout result, mirroring
 * the request_id line the verbose HTTP logger prints. No-op when the id is
 * absent (e.g. dry-run) or in --quiet mode (which owes callers a bare scalar).
 * JSON output surfaces request_id inside the payload instead of calling this.
 */
export function emitRequestId(requestId: string | undefined, quiet: boolean): void {
  if (!requestId || quiet) return;
  process.stderr.write(`request_id: ${requestId}\n`);
}
