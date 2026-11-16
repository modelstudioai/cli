import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../config/paths.ts";

/** On-disk first-install record. Writers live in the install scripts and postinstall. */
export const INSTALL_RECORD_FILE = "install.json";

const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const FIRST_VERSION = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/;

export interface InstallAttribution {
  installChannel: "npm" | "binary";
  /** Present when the file recorded a first install time. Absent for a machine already in use. */
  firstInstalledAt?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUtcTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" && UTC_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value))
  );
}

/**
 * Read a valid install record. Missing, unreadable, and unrecognized files
 * return undefined. This never creates or rewrites the file.
 */
export function readInstallAttribution(): InstallAttribution | undefined {
  let raw: string;
  try {
    raw = readFileSync(join(getConfigDir(), INSTALL_RECORD_FILE), "utf8");
  } catch {
    return undefined;
  }

  try {
    return installAttributionFromUnknown(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

export function installAttributionFromUnknown(value: unknown): InstallAttribution | undefined {
  if (!isRecord(value)) return undefined;
  if (value.version !== 1) return undefined;

  const channel = value.install_channel;
  if (channel !== "npm" && channel !== "binary") return undefined;

  if (!isUtcTimestamp(value.observed_at)) return undefined;

  const attribution: InstallAttribution = {
    installChannel: channel,
  };
  if (!("first_installed_at" in value)) return attribution;

  if (!isUtcTimestamp(value.first_installed_at)) return undefined;
  if (typeof value.first_version !== "string" || !FIRST_VERSION.test(value.first_version)) {
    return undefined;
  }
  attribution.firstInstalledAt = value.first_installed_at;
  return attribution;
}
