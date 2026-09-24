/**
 * Ad-hoc re-sign Bun-compiled darwin Mach-O binaries.
 *
 * `bun build --compile` leaves a linker signature (`Identifier=a.out`,
 * `adhoc,linker-signed`) whose page hashes do not match the final file.
 * macOS 27 SIGKILLs that binary at launch (exit 137). Re-signing after
 * compile covers the bytes that actually ship.
 *
 * darwin hosts use `codesign`, then `codesign --verify --strict`.
 * Linux/Windows release runners use `rcodesign sign`, then check each
 * CodeDirectory page hash in-process. `rcodesign verify` is not a gate:
 * 0.29.0 rejects ad-hoc signatures Apple accepts (`CMS error`).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

export const RCODESIGN_VERSION = "0.29.0";

function defaultLog(message = "") {
  process.stdout.write(`${message}\n`);
}

/** Command used to replace the linker signature. `platform` is the build host, not the target. */
export function adhocSignPlan(platform = process.platform) {
  if (platform === "darwin") {
    return {
      command: "codesign",
      args: ["--force", "--sign", "-", "--identifier", "bl"],
    };
  }
  return {
    command: "rcodesign",
    args: ["sign"],
  };
}

const LC_CODE_SIGNATURE = 0x1d;
const CSMAGIC_EMBEDDED_SIGNATURE = 0xfade0cc0;
const CSMAGIC_CODEDIRECTORY = 0xfade0c02;
const CSSLOT_CODEDIRECTORY = 0;
const CDHASH_SHA256 = 2;

/**
 * Recompute CodeDirectory page hashes the way Apple does for ad-hoc Mach-O:
 * each 4KiB page is SHA-256 of the bytes that exist, with no zero padding.
 * Bun's linker signature matches the padded last page and fails this check.
 *
 * @param {string} binaryPath
 */
export function verifyAdhocPageHashes(binaryPath) {
  const data = readFileSync(binaryPath);
  const magic = data.readUInt32LE(0);
  const littleEndian = magic === 0xfeedfacf;
  if (!littleEndian && magic !== 0xcffaedfe) {
    throw new Error(`${binaryPath} is not a thin 64-bit Mach-O`);
  }
  const read32 = littleEndian
    ? (offset) => data.readUInt32LE(offset)
    : (offset) => data.readUInt32BE(offset);
  const commandCount = read32(16);
  let commandOffset = 32;
  let signatureOffset = 0;
  for (let commandIndex = 0; commandIndex < commandCount; commandIndex++) {
    const command = read32(commandOffset);
    const commandSize = read32(commandOffset + 4);
    if (command === LC_CODE_SIGNATURE) signatureOffset = read32(commandOffset + 8);
    commandOffset += commandSize;
  }
  if (!signatureOffset) throw new Error(`${binaryPath} has no LC_CODE_SIGNATURE`);
  const readBlob32 = (offset) => data.readUInt32BE(signatureOffset + offset);
  if (readBlob32(0) !== CSMAGIC_EMBEDDED_SIGNATURE) {
    throw new Error(`${binaryPath} code signature superblob is invalid`);
  }
  const blobCount = readBlob32(8);
  let directoryOffset = 0;
  for (let blobIndex = 0; blobIndex < blobCount; blobIndex++) {
    const blobType = readBlob32(12 + blobIndex * 8);
    const blobOffset = readBlob32(12 + blobIndex * 8 + 4);
    if (blobType === CSSLOT_CODEDIRECTORY) directoryOffset = blobOffset;
  }
  if (!directoryOffset) throw new Error(`${binaryPath} has no CodeDirectory`);
  const directory = signatureOffset + directoryOffset;
  if (data.readUInt32BE(directory) !== CSMAGIC_CODEDIRECTORY) {
    throw new Error(`${binaryPath} CodeDirectory magic is invalid`);
  }
  const version = data.readUInt32BE(directory + 8);
  const hashOffset = data.readUInt32BE(directory + 16);
  const codeSlotCount = data.readUInt32BE(directory + 28);
  let codeLimit = data.readUInt32BE(directory + 32);
  const hashSize = data[directory + 36];
  const hashType = data[directory + 37];
  const pageShift = data[directory + 39];
  if (version >= 0x20300) {
    const codeLimit64 = data.readBigUInt64BE(directory + 48);
    if (codeLimit64 > 0n) codeLimit = Number(codeLimit64);
  }
  if (hashType !== CDHASH_SHA256 || hashSize !== 32) {
    throw new Error(`${binaryPath} code signature is not SHA-256`);
  }
  if (codeLimit > data.length) {
    throw new Error(`${binaryPath} codeLimit ${codeLimit} exceeds file length ${data.length}`);
  }
  const pageSize = pageShift === 0 ? codeLimit : 1 << pageShift;
  for (let slot = 0; slot < codeSlotCount; slot++) {
    const start = slot * pageSize;
    const end = Math.min(start + pageSize, codeLimit);
    const recorded = data.subarray(
      directory + hashOffset + slot * hashSize,
      directory + hashOffset + (slot + 1) * hashSize,
    );
    const actual = createHash("sha256").update(data.subarray(start, end)).digest();
    if (!recorded.equals(actual)) {
      throw new Error(
        `${binaryPath} code signature page ${slot} does not match the file (stale ad-hoc signature)`,
      );
    }
  }
}

/**
 * Replace the Mach-O ad-hoc signature in place.
 * Then recompute page hashes so a stale linker signature fails the build on Linux.
 * On darwin, also run `codesign --verify --strict`.
 *
 * @param {string} binaryPath
 * @param {{ log?: (message?: string) => void, platform?: NodeJS.Platform }} [options]
 */
export function signDarwinAdhoc(
  binaryPath,
  { log = defaultLog, platform = process.platform } = {},
) {
  const plan = adhocSignPlan(platform);
  log(`adhoc sign via ${plan.command}`);
  const result = spawnSync(plan.command, [...plan.args, binaryPath], { encoding: "utf-8" });
  if (result.error?.code === "ENOENT") {
    const installHint =
      platform === "darwin"
        ? "codesign ships with the Xcode command line tools."
        : `Install rcodesign ${RCODESIGN_VERSION} (apple-codesign) and retry.`;
    throw new Error(
      `${plan.command} not found on PATH. Darwin binaries need an ad-hoc signature before packaging. ${installHint}`,
    );
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`ad-hoc sign failed for ${binaryPath}`);
  }
  verifyAdhocPageHashes(binaryPath);
  if (platform !== "darwin") return;

  const verify = spawnSync("codesign", ["--verify", "--strict", binaryPath], { encoding: "utf-8" });
  if (verify.stdout) process.stdout.write(verify.stdout);
  if (verify.stderr) process.stderr.write(verify.stderr);
  if (verify.status !== 0) {
    const detail = (verify.stderr || verify.stdout || "").trim();
    throw new Error(
      `codesign --verify --strict failed for ${binaryPath}${detail ? `: ${detail}` : ""}`,
    );
  }
}
