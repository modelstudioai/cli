#!/usr/bin/env node
/**
 * Convenience wrapper: publish bailian-memo-dsh via the shared dsh-plugin publisher.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const shared = join(here, "publish-dsh-plugin.mjs");
const passthrough = process.argv.slice(2);
const result = spawnSync(
  process.execPath,
  [shared, "--package", "bailian-memo-dsh", ...passthrough],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
