/**
 * Build standalone `bl` binaries with Bun --compile.
 *
 * Used by lib/binary-release.mjs (and publish-stable / publish-channel orchestrators).
 * Debug:
 *   node tools/release/lib/binary-build.mjs --mode stable --host
 *
 * Manifests:
 *   --mode stable  → writes latest.json only
 *   --mode channel → writes <channel>.json only (does not touch latest.json)
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { ROOT, readPackageJson, PACKAGES } from "./packages.mjs";
import { assertChannel } from "./validate.mjs";

const BINARY_COMPILE = fileURLToPath(new URL("./binary-compile.mjs", import.meta.url));
const CLI_ENTRY = join(ROOT, "packages/cli/src/main.ts");
const DEFAULT_OUTDIR = join(ROOT, "dist-bin");
const DEFAULT_CDN = "https://github.com/modelstudioai/cli/releases";
const USAGE =
  "Usage: node tools/release/lib/binary-build.mjs [--mode stable|channel] [--channel <name>] [--host] [--target <bun-target>] [--outdir <dir>]\n";

/** Bun compile targets → asset (os, arch, exe). */
export const BINARY_TARGETS = [
  { bunTarget: "bun-darwin-arm64", os: "darwin", arch: "arm64", exe: false },
  { bunTarget: "bun-darwin-x64", os: "darwin", arch: "x64", exe: false },
  { bunTarget: "bun-linux-x64", os: "linux", arch: "x64", exe: false },
  { bunTarget: "bun-windows-x64", os: "windows", arch: "x64", exe: true },
];

function log(message = "") {
  process.stdout.write(`${message}\n`);
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function cdnBase() {
  return (process.env.BAILIAN_CLI_CDN || DEFAULT_CDN).replace(/\/$/, "");
}

function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      outdir: { type: "string" },
      target: { type: "string" },
      host: { type: "boolean", default: false },
      mode: { type: "string", default: "stable" },
      channel: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });
  if (values.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  return normalizeBuildOptions({
    outdir: values.outdir ? resolve(values.outdir) : DEFAULT_OUTDIR,
    onlyTarget: values.target ?? null,
    hostOnly: values.host,
    mode: values.mode,
    channel: values.channel ?? null,
  });
}

function normalizeBuildOptions({
  outdir,
  onlyTarget = null,
  hostOnly = false,
  mode = "stable",
  channel = null,
}) {
  if (mode !== "stable" && mode !== "channel") {
    throw new Error(`--mode must be stable or channel, got: ${mode}`);
  }
  if (mode === "channel") {
    if (!channel) throw new Error("--mode channel requires --channel <name>");
    assertChannel(channel);
    if (channel === "stable") {
      throw new Error(`--channel cannot be "stable"; use --mode stable`);
    }
  }
  return {
    outdir: outdir ?? DEFAULT_OUTDIR,
    onlyTarget,
    hostOnly: Boolean(hostOnly),
    mode,
    channel: mode === "channel" ? channel : null,
  };
}

function hostBunTarget() {
  const os = process.platform === "win32" ? "windows" : process.platform;
  const match = BINARY_TARGETS.find((target) => target.os === os && target.arch === process.arch);
  if (!match) {
    throw new Error(`Unsupported host for --host build: ${process.platform}/${process.arch}`);
  }
  return match.bunTarget;
}

function resolveTargets({ hostOnly, onlyTarget }) {
  if (hostOnly) {
    const host = hostBunTarget();
    return BINARY_TARGETS.filter((target) => target.bunTarget === host);
  }
  if (!onlyTarget) return BINARY_TARGETS;

  const targets = BINARY_TARGETS.filter((target) => target.bunTarget === onlyTarget);
  if (targets.length === 0) {
    const known = BINARY_TARGETS.map((target) => target.bunTarget).join(", ");
    throw new Error(`Unknown --target ${onlyTarget}. Known: ${known}`);
  }
  return targets;
}

function ensureBun() {
  const result = spawnSync("bun", ["--version"], { encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error("bun not found on PATH. Install from https://bun.sh");
  }
  return result.stdout.trim();
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assetFileName(version, os, arch, exe) {
  return `bl-${version}-${os}-${arch}${exe ? ".exe" : ""}`;
}

function compileOne({ bunTarget, os, arch, exe }, version, outdir, entry) {
  const fileName = assetFileName(version, os, arch, exe);
  const outfile = join(outdir, fileName);
  log(`compile ${bunTarget} → ${fileName}`);

  // Bun.build() lives in binary-compile.mjs (must run under Bun); this file stays Node.
  const result = spawnSync(
    "bun",
    [BINARY_COMPILE, "--entry", entry, "--outfile", outfile, "--target", bunTarget],
    { cwd: ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "");
    throw new Error(`Bun compile failed for ${bunTarget}`);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return { fileName, outfile, os, arch, sha256: sha256File(outfile) };
}

function writeChecksums(outdir, artifacts) {
  const lines = artifacts.map((item) => `${item.sha256}  ${item.fileName}`);
  writeFileSync(join(outdir, "SHA256SUMS"), `${lines.join("\n")}\n`);
}

function writeChannelManifest(outdir, version, artifacts, mode, channel) {
  const base = cdnBase();
  const assets = Object.fromEntries(
    artifacts.map((item) => [
      `${item.os}-${item.arch}`,
      {
        file: item.fileName,
        sha256: item.sha256,
        url: `${base}/download/v${version}/${item.fileName}`,
      },
    ]),
  );
  const manifest = {
    name: "bailian-cli",
    channel: mode === "stable" ? "latest" : channel,
    version,
    releasedAt: new Date().toISOString(),
    assets,
  };
  const names = mode === "stable" ? ["latest.json"] : [`${channel}.json`];
  for (const name of names) writeJson(join(outdir, name), manifest);
  return names;
}

function cliVersion() {
  return readPackageJson(PACKAGES.find((pkg) => pkg.key === "cli")).version;
}

/** Run `--version` on the artifact matching the host platform, if any was built. */
function smokeTestHostBinary(artifacts, outdir) {
  const hostOs = process.platform === "win32" ? "windows" : process.platform;
  const host = artifacts.find((item) => item.os === hostOs && item.arch === process.arch);
  if (!host) return;
  const binary = join(outdir, host.fileName);
  log(`smoke test ${host.fileName} --version`);
  const result = spawnSync(binary, ["--version"], { encoding: "utf-8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "");
    throw new Error(`smoke test failed: ${host.fileName} --version`);
  }
}

/** Compile binaries into `outdir` and write checksums + channel manifest. */
export function buildBinaryArtifacts(rawOptions = {}) {
  const options = normalizeBuildOptions(rawOptions);
  const { outdir, mode, channel } = options;
  const bunVersion = ensureBun();
  const version = cliVersion();
  const targets = resolveTargets(options);

  mkdirSync(outdir, { recursive: true });
  log(`bun ${bunVersion}`);
  log(`bailian-cli ${version}`);
  log(`mode ${mode}${channel ? ` channel=${channel}` : ""}`);
  log(`outdir ${outdir}`);

  const artifacts = targets.map((target) => compileOne(target, version, outdir, CLI_ENTRY));
  writeChecksums(outdir, artifacts);
  const manifests = writeChannelManifest(outdir, version, artifacts, mode, channel);
  smokeTestHostBinary(artifacts, outdir);

  log(`\nBuilt ${artifacts.length} binary(ies):`);
  for (const item of artifacts) {
    log(`  ${item.fileName}  ${item.sha256.slice(0, 12)}…`);
  }
  log(`Also wrote SHA256SUMS, ${manifests.join(", ")}`);
  return { version, mode, channel, outdir, artifacts, manifests };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    buildBinaryArtifacts(parseCliArgs(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
