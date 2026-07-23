/**
 * Single-target `Bun.build({ compile })` helper. Must be run with Bun:
 *   bun tools/release/lib/binary-compile.mjs --entry <path> --outfile <path> --target <bun-target>
 *
 * Called by binary-build.mjs (Node orchestration stays on Node).
 */
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

const result = await Bun.build({
  entrypoints: [entry],
  // Bundler defaults to "browser"; CLI needs Node/Bun builtins.
  target: "bun",
  define: {
    "process.env.BAILIAN_COMPILED": JSON.stringify("1"),
  },
  compile: {
    target,
    outfile,
  },
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}
