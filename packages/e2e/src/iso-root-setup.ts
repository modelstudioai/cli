/**
 * Vitest setupFiles: copy provided isolation parent into BL_ISO_ROOT.
 * Depends only on iso-root-keys (not isolation/core).
 */
import { inject } from "vite-plus/test";
import { ISO_ROOT_ENV, ISO_ROOT_KEY } from "./iso-root-keys.ts";

try {
  // Cast: ProvidedContext augmentation is unreliable under this package's typecheck.
  const sessionRoot = (inject as (key: string) => unknown)(ISO_ROOT_KEY);
  if (typeof sessionRoot === "string" && sessionRoot.length > 0) {
    process.env[ISO_ROOT_ENV] = sessionRoot;
  }
} catch {
  // No provide: leave BL_ISO_ROOT unset; getIsolationSessionRoot falls back to os.tmpdir().
}
