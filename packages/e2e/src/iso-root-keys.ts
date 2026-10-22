/**
 * Lightweight keys for passing the isolation session root from globalSetup to workers.
 * setupFiles must only import this file — never isolation/core — so vi.mock is not broken.
 */

/** Env var that carries this run's isolation session root. */
export const ISO_ROOT_ENV = "BL_ISO_ROOT";

/** Vitest provide/inject key for the same path. */
export const ISO_ROOT_KEY = "isoRoot";
