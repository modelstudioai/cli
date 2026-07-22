import { existsSync } from "node:fs";
import { mkdir, open, stat, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import {
  BailianError,
  ExitCode,
  type CommandPackManager,
  type CommandPackReport,
  type Identity,
} from "bailian-cli-core";
import { readCommandPackPackageJsonAt, readCommandPacksManifest } from "./package-json.ts";
import { getCommandPackRoot, getCommandPacksDir } from "./paths.ts";
import { loadCommandPacks } from "./load.ts";
import { loadAndValidateCommandPack } from "./validate.ts";
import type { CommandPackPolicy } from "./types.ts";

const SANDBOX_PACKAGE_JSON = {
  name: "bailian-cli-command-packs",
  private: true,
  dependencies: {},
};
const LOCK_STALE_MS = 10 * 60 * 1000;

const NPM_ENV_ALLOW_EXACT = new Set([
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
  "NODE_AUTH_TOKEN",
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
const NPM_CONFIG_ENV_ALLOW = new Set([
  "registry",
  "userconfig",
  "globalconfig",
  "cache",
  "proxy",
  "https_proxy",
  "noproxy",
  "strict_ssl",
  "ca",
  "cafile",
]);

function isAllowedNpmConfigEnv(key: string): boolean {
  const match = /^(?:npm_config_|NPM_CONFIG_)(.+)$/.exec(key);
  return !!match && NPM_CONFIG_ENV_ALLOW.has(match[1]!.toLowerCase());
}

function supportedPackageHint(identity: Identity, policy: CommandPackPolicy): string {
  const names = Object.keys(policy.supported);
  return names.length > 0
    ? `Allowed packages: ${names.join(", ")}`
    : `${identity.binName} does not currently support any Command Packs.`;
}

function buildNpmEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) continue;
    if (NPM_ENV_ALLOW_EXACT.has(key) || key.startsWith("LC_") || isAllowedNpmConfigEnv(key)) {
      env[key] = value;
    }
  }
  return env;
}

async function ensureSandboxAt(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, "package.json");
  if (!existsSync(path)) {
    await writeFile(path, `${JSON.stringify(SANDBOX_PACKAGE_JSON, null, 2)}\n`, { mode: 0o600 });
  }
}

async function runNpm(args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn("npm", args, {
      cwd,
      env: buildNpmEnv(),
      stdio: ["inherit", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => process.stderr.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(
        new BailianError(
          `npm ${args[0]} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}.`,
          ExitCode.GENERAL,
        ),
      );
    });
  });
}

async function acquireSandboxLock(identity: Identity): Promise<() => Promise<void>> {
  const sandboxDir = getCommandPacksDir(identity);
  await ensureSandboxAt(sandboxDir);
  const path = join(sandboxDir, ".lock");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, "wx", 0o600);
      await handle.writeFile(`${process.pid} ${Date.now()}\n`);
      await handle.close();
      return async () => {
        try {
          await unlink(path);
        } catch {
          /* already released */
        }
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
      try {
        const info = await stat(path);
        if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
          await unlink(path);
          continue;
        }
      } catch {
        continue;
      }
      throw new BailianError(
        "Another Command Pack install, link, or remove operation is already running.",
        ExitCode.GENERAL,
        "Wait for it to finish and try again.",
      );
    }
  }
  throw new BailianError("Could not acquire the Command Pack operation lock.", ExitCode.GENERAL);
}

async function withSandboxLock<T>(identity: Identity, run: () => Promise<T>): Promise<T> {
  const release = await acquireSandboxLock(identity);
  try {
    return await run();
  } finally {
    await release();
  }
}

export function parseCommandPackSpec(
  spec: string,
  identity: Identity,
  policy: CommandPackPolicy,
): { name: string; requested: string } {
  const trimmed = spec.trim();
  const match = /^(@[^/\s]+\/[^@/\s]+)(?:@([a-zA-Z0-9][a-zA-Z0-9._-]*))?$/.exec(trimmed);
  if (!match) {
    throw new BailianError(
      `Unsupported Command Pack package spec: "${spec}".`,
      ExitCode.USAGE,
      "Use an allowlisted scoped package name with an optional version or tag.",
    );
  }
  const name = match[1]!;
  if (!policy.supported[name]) {
    throw new BailianError(
      `Command Pack "${name}" is not allowlisted for ${identity.binName}.`,
      ExitCode.USAGE,
      supportedPackageHint(identity, policy),
    );
  }
  return { name, requested: trimmed };
}

async function validateAtRoot(
  name: string,
  root: string,
  identity: Identity,
  policy: CommandPackPolicy,
) {
  const definition = policy.supported[name]!;
  const pjson = await readCommandPackPackageJsonAt(root);
  const commands = await loadAndValidateCommandPack(name, pjson, definition, identity, root);
  return { pjson, commands };
}

function dependencyInstallSpec(name: string, spec: string): string {
  return spec.startsWith("file:") ? spec : `${name}@${spec}`;
}

async function restoreCommandPack(
  name: string,
  previousSpec: string | undefined,
  sandboxDir: string,
): Promise<void> {
  if (previousSpec) {
    await runNpm(
      [
        "install",
        dependencyInstallSpec(name, previousSpec),
        "--save-exact",
        "--ignore-scripts",
        "--no-fund",
        "--no-audit",
      ],
      sandboxDir,
    );
    return;
  }
  await runNpm(["uninstall", name, "--ignore-scripts", "--no-fund", "--no-audit"], sandboxDir);
}

export async function installCommandPack(
  spec: string,
  identity: Identity,
  policy: CommandPackPolicy,
): Promise<{ name: string; version?: string; commands: string[] }> {
  const { name, requested } = parseCommandPackSpec(spec, identity, policy);
  return withSandboxLock(identity, async () => {
    const sandboxDir = getCommandPacksDir(identity);
    const manifest = await readCommandPacksManifest(identity);
    const previousSpec = manifest.dependencies?.[name];

    try {
      await runNpm(
        ["install", requested, "--save-exact", "--ignore-scripts", "--no-fund", "--no-audit"],
        sandboxDir,
      );
      const installed = await validateAtRoot(
        name,
        getCommandPackRoot(identity, name),
        identity,
        policy,
      );
      if (!installed.pjson.version) {
        throw new BailianError(`Command Pack "${name}" has no package version.`, ExitCode.USAGE);
      }
      return {
        name,
        version: installed.pjson.version,
        commands: Object.keys(installed.commands).sort(),
      };
    } catch (error) {
      try {
        await restoreCommandPack(name, previousSpec, sandboxDir);
      } catch {
        /* preserve the install or validation error */
      }
      throw error;
    }
  });
}

export async function linkCommandPack(
  path: string,
  identity: Identity,
  policy: CommandPackPolicy,
): Promise<{ name: string; version?: string; commands: string[] }> {
  const root = resolve(path);
  if (!existsSync(join(root, "package.json"))) {
    throw new BailianError(`Command Pack path does not exist: ${root}`, ExitCode.USAGE);
  }
  const pjson = await readCommandPackPackageJsonAt(root);
  const name = pjson.name;
  if (!name || !policy.supported[name]) {
    throw new BailianError(
      `Local package "${name ?? "(unnamed)"}" is not an allowlisted Command Pack for ${identity.binName}.`,
      ExitCode.USAGE,
      supportedPackageHint(identity, policy),
    );
  }
  const checked = await validateAtRoot(name, root, identity, policy);
  return withSandboxLock(identity, async () => {
    await runNpm(
      ["install", `file:${root}`, "--save-exact", "--ignore-scripts", "--no-fund", "--no-audit"],
      getCommandPacksDir(identity),
    );
    const installed = await validateAtRoot(
      name,
      getCommandPackRoot(identity, name),
      identity,
      policy,
    );
    return {
      name,
      version: installed.pjson.version ?? checked.pjson.version,
      commands: Object.keys(installed.commands).sort(),
    };
  });
}

export async function removeCommandPack(
  name: string,
  identity: Identity,
  policy: CommandPackPolicy,
): Promise<void> {
  if (!policy.supported[name]) {
    throw new BailianError(
      `Command Pack "${name}" is not allowlisted for ${identity.binName}.`,
      ExitCode.USAGE,
      supportedPackageHint(identity, policy),
    );
  }
  const manifest = await readCommandPacksManifest(identity);
  if (!(name in (manifest.dependencies ?? {}))) {
    throw new BailianError(`Command Pack "${name}" is not installed.`, ExitCode.USAGE);
  }
  await withSandboxLock(identity, () =>
    runNpm(
      ["uninstall", name, "--ignore-scripts", "--no-fund", "--no-audit"],
      getCommandPacksDir(identity),
    ),
  );
}

export async function listCommandPacks(
  identity: Identity,
  policy: CommandPackPolicy,
): Promise<CommandPackReport[]> {
  return (await loadCommandPacks({}, identity, policy)).reports;
}

export function createCommandPackManager(
  identity: Identity,
  policy: CommandPackPolicy,
): CommandPackManager {
  return {
    install: (spec) => installCommandPack(spec, identity, policy),
    link: (path) => linkCommandPack(path, identity, policy),
    list: () => listCommandPacks(identity, policy),
    remove: (name) => removeCommandPack(name, identity, policy),
  };
}
