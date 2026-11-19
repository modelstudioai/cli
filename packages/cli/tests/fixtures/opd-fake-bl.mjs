#!/usr/bin/env node
// Fake bl entry for the bailian-opd runBl contract test. Emits the same output
// shapes as the real CLI: pretty-printed JSON documents, single-line JSON with
// stderr warnings, and plain text followed by a JSON line.
const args = process.argv.slice(2);
if (args.includes("pretty")) {
  process.stdout.write(
    `${JSON.stringify({ output: { job_id: "job-1", status: "PENDING" } }, null, 2)}\n`,
  );
} else if (args.includes("warn")) {
  process.stderr.write(
    `${JSON.stringify({ warning: { code: "OPD_PAIR_NOT_PUBLISHED", message: "pair not published" } })}\n`,
  );
  process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
} else if (args.includes("mixed")) {
  process.stdout.write(`Uploading file...\n${JSON.stringify({ file_id: "file-1" })}\n`);
} else if (args.includes("error")) {
  process.stderr.write(`${JSON.stringify({ error: { code: 1, message: "boom" } }, null, 2)}\n`);
  process.exit(1);
} else {
  process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
}
