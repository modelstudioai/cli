import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

/**
 * Normalize a model-service base URL to its origin.
 * CLI endpoints append their own API paths, so user-provided paths, query
 * parameters, and fragments must not remain in the stored or resolved base URL.
 */
export function normalizeModelBaseUrl(input: string): string {
  const trimmed = input.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw invalidModelBaseUrl(input);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw invalidModelBaseUrl(input);
  }

  return parsed.origin;
}

function invalidModelBaseUrl(input: string): BailianError {
  return new BailianError(
    `Invalid model base URL "${input}".`,
    ExitCode.USAGE,
    "Use an absolute http(s) URL.",
  );
}
