/**
 * Build standalone `bl` binaries with Bun --compile, then pack each as a
 * per-platform `.zip` via binary-zip.mjs (Release / OSS download asset).
 *
 * Used by lib/binary-release.mjs (and publish-stable / publish-channel orchestrators).
 * Debug:
 *   node tools/release/lib/binary-build.mjs --mode stable --host
 *
 * Manifests:
 *   --mode stable  → writes latest.json (rolling manifest of the implicit
 *                    "latest" channel; OSS prefix root only, not a GH asset)
 *   --mode channel → writes <channel>.json
 */
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { ROOT, readPackageJson, PACKAGES } from "./packages.mjs";
import { channelManifestFileName, normalizeModeChannel } from "./binary-options.mjs";
import { ensureZip, zipOne } from "./binary-zip.mjs";

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

/** Uncompressed binary basename inside the zip: `bl-<ver>-<os>-<arch>[.exe]`. */
export function binaryInnerName(version, { os, arch, exe }) {
  return `bl-${version}-${os}-${arch}${exe ? ".exe" : ""}`;
}

/** Release asset basename: `bl-<ver>-<os>-<arch>.zip`. */
export function binaryAssetName(version, { os, arch }) {
  return `bl-${version}-${os}-${arch}.zip`;
}

/** Full matrix zip basenames for a version (order matches BINARY_TARGETS). */
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

function compileOne({ bunTarget, os, arch, exe }, version, outdir, entry) {
  const innerName = binaryInnerName(version, { os, arch, exe });
  const innerPath = join(outdir, innerName);
  log(`compile ${bunTarget} → ${innerName}`);

  const result = spawnSync(
    "bun",
    [BINARY_COMPILE, "--entry", entry, "--outfile", innerPath, "--target", bunTarget],
    { cwd: ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "");
    throw new Error(`Bun compile failed for ${bunTarget}`);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  // Bun 1.2.19 writes windows-x64 .exe with mode 000 on Unix hosts (oven-sh/bun#21308).
  chmodSync(innerPath, 0o755);
  return { innerName, innerPath, os, arch, exe };
}

function writeChecksums(outdir, artifacts) {
  const lines = artifacts.map((item) => `${item.sha256}  ${item.fileName}`);
  writeFileSync(join(outdir, "SHA256SUMS"), `${lines.join("\n")}\n`);
}

/** Write the rolling channel manifest (`latest.json` / `<channel>.json`) with per-platform zip file + sha256. */
function writeChannelManifest(outdir, version, artifacts, channel) {
  const assets = Object.fromEntries(
    artifacts.map((item) => [
      `${item.os}-${item.arch}`,
      {
        file: item.fileName,
        sha256: item.sha256,
        inner: item.innerName,
      },
    ]),
  );
  const manifest = {
    name: "bailian-cli",
    channel,
    version,
    releasedAt: new Date().toISOString(),
    assets,
  };
  const name = channelManifestFileName(channel);
  writeJson(join(outdir, name), manifest);
  return name;
}

function cliVersion() {
  return readPackageJson(PACKAGES.find((pkg) => pkg.key === "cli")).version;
}

/** Run `--version` on the host platform's uncompressed binary, if present. */
function smokeTestHostBinary(compiled, outdir) {
  const hostOs = process.platform === "win32" ? "windows" : process.platform;
  const host = compiled.find((item) => item.os === hostOs && item.arch === process.arch);
  if (!host) return;
  const binary = join(outdir, host.innerName);
  log(`smoke test ${host.innerName} --version`);
  const result = spawnSync(binary, ["--version"], { encoding: "utf-8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "");
    throw new Error(`smoke test failed: ${host.innerName} --version`);
  }
}

/** Compile binaries into `outdir`, zip per platform, write checksums (+ channel manifest). */
export function buildBinaryArtifacts(rawOptions = {}) {
  const options = normalizeBuildOptions(rawOptions);
  const { outdir, mode, channel } = options;
  const bunVersion = ensureBun();
  ensureZip();
  const version = cliVersion();
  const targets = resolveTargets(options);

  mkdirSync(outdir, { recursive: true });
  log(`bun ${bunVersion}`);
  log(`bailian-cli ${version}`);
  log(`mode ${mode}${channel ? ` channel=${channel}` : ""}`);
  log(`outdir ${outdir}`);

  const compiled = targets.map((target) => compileOne(target, version, outdir, CLI_ENTRY));
  smokeTestHostBinary(compiled, outdir);
  const artifacts = compiled.map((item) =>
    zipOne(item, { outdir, zipFileName: binaryAssetName(version, item), log }),
  );
  writeChecksums(outdir, artifacts);

  const extras = ["SHA256SUMS"];
  extras.push(
    writeChannelManifest(outdir, version, artifacts, mode === "channel" ? channel : "latest"),
  );

  log(`\nBuilt ${artifacts.length} zip(s):`);
  for (const item of artifacts) {
    log(`  ${item.fileName}  ${item.sha256.slice(0, 12)}… (inner ${item.innerName})`);
  }
  log(`Also wrote ${extras.join(", ")}`);
  return {
    version,
    mode,
    channel,
    outdir,
    artifacts,
    manifests: extras.filter((name) => name.endsWith(".json")),
  };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    buildBinaryArtifacts(parseCliArgs(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
