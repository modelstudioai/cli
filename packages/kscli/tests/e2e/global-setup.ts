import { loadRootEnv } from "./helpers.ts";

/**
 * Vitest globalSetup: load monorepo root `.env` into `process.env` before tests run.
 */
export default function vitestGlobalSetup(): () => void {
  loadRootEnv();
  return () => {};
}
