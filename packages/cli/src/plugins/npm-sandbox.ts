import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Node in `npm ls --json` output. */
export interface NpmLsNode {
  dependencies?: Record<string, NpmLsNode>;
}

/** Extract top-level dependency names from `npm ls --depth=0` output. */
export function topLevelDepNamesFromNpmLs(tree: NpmLsNode): string[] {
  if (!tree.dependencies) return [];
  return Object.keys(tree.dependencies);
}

/** Return top-level dependency names added between before and after install. */
export function diffAddedDepNames(before: string[], after: string[]): string[] {
  const prev = new Set(before);
  return after.filter((name) => !prev.has(name));
}

/** Resolve the package root under the sandbox `node_modules` directory. */
export function resolveSandboxPackageRoot(pluginsDir: string, packageName: string): string {
  if (packageName.startsWith("@")) {
    const slash = packageName.indexOf("/");
    const scope = packageName.slice(0, slash);
    const base = packageName.slice(slash + 1);
    return join(pluginsDir, "node_modules", scope, base);
  }
  return join(pluginsDir, "node_modules", packageName);
}

/**
 * Parse an npm package name from an install spec.
 * Returns undefined for git URLs, tarballs, and other non-registry specs.
 */
export function parsePackageNameFromSpec(spec: string): string | undefined {
  const s = spec.trim();
  if (!s) return undefined;
  if (/^(git\+|https?:|file:|github:)/i.test(s)) return undefined;
  if (/\.tgz$/i.test(s) || /\.tar\.gz$/i.test(s)) return undefined;

  const scoped = /^(@[^/]+\/[^@/]+)/.exec(s);
  if (scoped) return scoped[1];

  const plain = /^([^@/]+)/.exec(s);
  return plain?.[1];
}

/**
 * Pick the target package name for this install from the top-level dependency diff and spec.
 */
export function pickInstalledPackageName(
  packageSpec: string,
  added: string[],
  afterAll: string[],
): string | undefined {
  if (added.length === 1) return added[0];

  const fromSpec = parsePackageNameFromSpec(packageSpec);
  if (fromSpec) {
    if (added.includes(fromSpec)) return fromSpec;
    if (added.length === 0 && afterAll.includes(fromSpec)) return fromSpec;
  }

  return undefined;
}

/**
 * Exact-match env var allowlist passed to npm child processes.
 * Keeps only what npm needs to run; strips business credentials (e.g. DASHSCOPE_API_KEY)
 * so plugin install scripts cannot read sensitive values if --ignore-scripts is bypassed.
 */
const NPM_ENV_ALLOW_EXACT = new Set<string>([
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "TEMP",
  "TMP",
  "LANG",
  "TERM",
  "NODE",
  "NODE_PATH",
  "NODE_OPTIONS",
  "FORCE_COLOR",
  "NO_COLOR",
  "NPM_TOKEN",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "SystemRoot",
  "ComSpec",
  "APPDATA",
  "PATHEXT",
]);

/** Prefix-match env var allowlist for npm config and locale variables. */
const NPM_ENV_ALLOW_PREFIX = ["npm_config_", "NPM_CONFIG_", "LC_"] as const;

/** Build a minimal env for npm child processes (allowlist only). */
export function buildNpmEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) continue;
    if (NPM_ENV_ALLOW_EXACT.has(key) || NPM_ENV_ALLOW_PREFIX.some((p) => key.startsWith(p))) {
      out[key] = value;
    }
  }
  return out;
}

/** Read top-level dependency names from the sandbox package.json. */
export async function readSandboxDeps(pluginsDir: string): Promise<string[]> {
  const path = join(pluginsDir, "package.json");
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    return Object.keys(raw.dependencies ?? {});
  } catch {
    return [];
  }
}
