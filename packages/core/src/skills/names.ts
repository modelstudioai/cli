import { UsageError } from "../errors/base.ts";

/**
 * Parse --name: `all` or a comma-separated list of skill names (deduplicated, trimmed).
 * `all` cannot be mixed with specific names.
 */
export function parseSkillNames(raw: string | undefined, defaultAll: boolean): string[] | "all" {
  const value = (raw ?? (defaultAll ? "all" : "")).trim();
  if (!value) {
    throw new UsageError("--name cannot be empty", "Use --name all or --name skill-a,skill-b");
  }
  const parts = [
    ...new Set(
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
  if (parts.includes("all")) {
    if (parts.length > 1) {
      throw new UsageError(
        "--name all cannot be mixed with specific skill names",
        "Use either all or a comma-separated list of names",
      );
    }
    return "all";
  }
  return parts;
}
