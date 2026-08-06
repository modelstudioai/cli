/**
 * Single-target Bun compile helper. Must be run with Bun on PATH:
 *   bun tools/release/lib/binary-compile.mjs --entry <path> --outfile <path> --target <bun-target>
 *
 * Uses `bun build --compile` (CLI). The Bun.build({ compile }) API on ≤1.2.19
 * can exit 0 without writing outfile; CI pins 1.2.19 so we stay on the CLI.
 *
 * Called by binary-build.mjs (Node orchestration stays on Node).
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  let entry = null;
  let outfile = null;
  let target = null;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--entry") entry = argv[++index];
    else if (arg === "--outfile") outfile = argv[++index];
    else if (arg === "--target") target = argv[++index];
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: bun tools/release/lib/binary-compile.mjs --entry <path> --outfile <path> --target <bun-target>\n",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!entry || !outfile || !target) {
    throw new Error("Required: --entry, --outfile, --target");
  }
  return { entry, outfile, target };
}

const { entry, outfile, target } = parseArgs(process.argv.slice(2));

const result = spawnSync(
  "bun",
  [
    "build",
    entry,
    "--compile",
    "--outfile",
    outfile,
    "--target",
    target,
    "--define",
    'process.env.BAILIAN_COMPILED="1"',
  ],
  { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!existsSync(outfile)) {
  console.error(`bun build --compile exited 0 but outfile missing: ${outfile}`);
  process.exit(1);
}
