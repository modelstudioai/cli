import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

const KNOWN_API_BASE_SUFFIXES = ["/compatible-mode/v1", "/apps/anthropic"] as const;

/**
 * Normalize a model-service base URL while preserving custom gateway prefixes.
 * CLI endpoints append their own API paths, so known SDK/API base suffixes must
 * not remain in the stored or resolved base URL.
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

  parsed.search = "";
  parsed.hash = "";

  let pathname = parsed.pathname.replace(/\/+$/, "");
  const knownSuffix = KNOWN_API_BASE_SUFFIXES.find(
    (suffix) => pathname === suffix || pathname.endsWith(suffix),
  );
  if (knownSuffix) {
    pathname = pathname.slice(0, -knownSuffix.length).replace(/\/+$/, "");
  }
  parsed.pathname = pathname || "/";

  return parsed.toString().replace(/\/$/, "");
}

function invalidModelBaseUrl(input: string): BailianError {
  return new BailianError(
    `Invalid model base URL "${input}".`,
    ExitCode.USAGE,
    "Use an absolute http(s) URL.",
  );
}
