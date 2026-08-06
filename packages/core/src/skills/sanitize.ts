/**
 * Sanitize a skill name into a safe directory name (semantics aligned with vercel-labs/skills sanitizeName):
 * skill names come from the remote index (untrusted input) and are interpolated into file paths, so they
 * must be disinfected first — path separators/drive letters/whitespace/Windows-illegal chars are collapsed
 * to hyphens, `..` is destroyed, leading/trailing `.-` are stripped.
 *
 * `bl skill` uses this as an "equivalence check": if the sanitized name differs from the original,
 * installation is rejected outright (the publisher already has an isomorphic allowlist; this is client-side defense-in-depth).
 */
export function sanitizeSkillName(name: string): string {
  const sanitized = name
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/\.\.+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return sanitized || "unnamed-skill";
}

/** Whether the skill name is already a safe directory name (unchanged after sanitization) */
export function isSafeSkillName(name: string): boolean {
  return name.length > 0 && sanitizeSkillName(name) === name;
}
