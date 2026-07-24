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
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { ROOT, readPackageJson, PACKAGES } from "./packages.mjs";
import { manifestFileName, normalizeModeChannel } from "./binary-options.mjs";

const BINARY_COMPILE = fileURLToPath(new URL("./binary-compile.mjs", import.meta.url));
const CLI_ENTRY = join(ROOT, "packages/cli/src/main.ts");
const DEFAULT_OUTDIR = join(ROOT, "dist-bin");
const USAGE =
  "Usage: node tools/release/lib/binary-build.mjs [--mode stable|channel] [--channel <name>] [--host] [--target <bun-target>] [--outdir <dir>]\n";

/** Bun compile targets → asset (os, arch, exe). */
export const BINARY_TARGETS = [
  { bunTarget: "bun-darwin-arm64", os: "darwin", arch: "arm64", exe: false },
  { bunTarget: "bun-darwin-x64", os: "darwin", arch: "x64", exe: false },
  { bunTarget: "bun-linux-x64", os: "linux", arch: "x64", exe: false },
  { bunTarget: "bun-windows-x64", os: "windows", arch: "x64", exe: true },
];

/** Asset basename for a matrix row: `bl-<ver>-<os>-<arch>[.exe]`. */
export function binaryAssetName(version, { os, arch, exe }) {
  return `bl-${version}-${os}-${arch}${exe ? ".exe" : ""}`;
}

/** Full matrix basenames for a version (order matches BINARY_TARGETS). */
export function matrixAssetNames(version) {
  return BINARY_TARGETS.map((target) => binaryAssetName(version, target));
}

function log(message = "") {
  process.stdout.write(`${message}\n`);
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
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
  const modeChannel = normalizeModeChannel(mode, channel);
  return {
    outdir: outdir ?? DEFAULT_OUTDIR,
    onlyTarget,
    hostOnly: Boolean(hostOnly),
    ...modeChannel,
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

function compileOne({ bunTarget, os, arch, exe }, version, outdir, entry) {
  const fileName = binaryAssetName(version, { os, arch, exe });
  const outfile = join(outdir, fileName);
  log(`compile ${bunTarget} → ${fileName}`);

  // binary-compile.mjs shells out to `bun build --compile` (CLI); this file stays Node.
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
  // Bun 1.2.19 writes windows-x64 .exe with mode 000 on Unix hosts (oven-sh/bun#21308).
  // chmod so sha256 / gh upload can open the file; harmless for other targets.
  chmodSync(outfile, 0o755);
  return { fileName, outfile, os, arch, sha256: sha256File(outfile) };
}

function writeChecksums(outdir, artifacts) {
  const lines = artifacts.map((item) => `${item.sha256}  ${item.fileName}`);
  writeFileSync(join(outdir, "SHA256SUMS"), `${lines.join("\n")}\n`);
}

/**
 * Write latest.json (stable) or <channel>.json (channel).
 * Asset entries carry file + sha256 only — no baked download URL.
 * Consumers (bl update / install scripts) resolve via BAILIAN_CLI_CDN +
 * `{base}/releases/{version}/{file}` (see packages/core releaseAssetUrl).
 */
function writeManifest(outdir, version, artifacts, mode, channel) {
  const assets = Object.fromEntries(
    artifacts.map((item) => [
      `${item.os}-${item.arch}`,
      {
        file: item.fileName,
        sha256: item.sha256,
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
  const name = manifestFileName(mode, channel);
  writeJson(join(outdir, name), manifest);
  return [name];
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

/** Compile binaries into `outdir` and write checksums + manifest. */
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
  const manifests = writeManifest(outdir, version, artifacts, mode, channel);
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
