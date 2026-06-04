import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  BailianError,
  ExitCode,
  getPluginsDir,
  getPluginsManifestPath,
  isBailianPluginPackage,
  type BailianCliPackageMeta,
} from "bailian-cli-core";
import { resetCommandCatalogCache } from "../load-commands.ts";
import { clearCommandsCache } from "./cache.ts";
import { discoverPlugins, readPackageJson } from "./discover.ts";
import {
  buildNpmEnv,
  diffAddedDepNames,
  parsePackageNameFromSpec,
  pickInstalledPackageName,
  readSandboxDeps,
  resolveSandboxPackageRoot,
  topLevelDepNamesFromNpmLs,
  type NpmLsNode,
} from "./npm-sandbox.ts";
import { assertPluginAllowed } from "./policy.ts";
import type { UserPluginsManifest } from "./types.ts";

const INIT_MANIFEST: UserPluginsManifest = {
  private: true,
  dependencies: {},
  bailianCli: { schema: 1, plugins: [] },
};

async function readManifest(): Promise<UserPluginsManifest> {
  const path = getPluginsManifestPath();
  if (!existsSync(path)) return structuredClone(INIT_MANIFEST);
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as UserPluginsManifest;
    return {
      ...INIT_MANIFEST,
      ...raw,
      bailianCli: {
        ...INIT_MANIFEST.bailianCli,
        ...raw.bailianCli,
        plugins: raw.bailianCli?.plugins ?? [],
      },
    };
  } catch {
    throw new BailianError(
      `Plugin manifest at ${path} is corrupted and could not be parsed.`,
      ExitCode.GENERAL,
      "Restore from backup or delete the file, then run bl plugin install again.",
    );
  }
}

async function writeManifest(manifest: UserPluginsManifest): Promise<void> {
  const path = getPluginsManifestPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(
    path,
    `${JSON.stringify({ name: "bailian-cli-plugins", ...manifest }, null, 2)}\n`,
    {
      mode: 0o600,
    },
  );
  resetCommandCatalogCache();
  void clearCommandsCache();
}

async function validatePluginPackageAsync(
  root: string,
): Promise<{ name: string; bailianCli: BailianCliPackageMeta }> {
  const pjson = await readPackageJson(root);
  if (!pjson?.name) {
    throw new BailianError(`Invalid plugin package at ${root}`, ExitCode.USAGE);
  }
  if (!isBailianPluginPackage(pjson.name, pjson.bailianCli)) {
    throw new BailianError(
      `Package "${pjson.name}" is not a valid bailian-cli plugin (name must be bailian-plugin-* or @scope/bailian-plugin-*, with bailianCli.plugin=true and bailianCli.commands).`,
      ExitCode.USAGE,
    );
  }
  if (!pjson.bailianCli?.commands) {
    throw new BailianError(
      `Plugin "${pjson.name}" is missing bailianCli.commands directory.`,
      ExitCode.USAGE,
    );
  }
  return { name: pjson.name, bailianCli: pjson.bailianCli };
}

function runNpm(args: string[], cwd: string): void {
  const registry = process.env.BAILIAN_NPM_REGISTRY;
  const npmArgs = registry ? ["--registry", registry, ...args] : args;
  const result = spawnSync("npm", npmArgs, {
    cwd,
    stdio: "inherit",
    env: buildNpmEnv(),
  });
  if (result.status !== 0) {
    throw new BailianError(
      `npm ${args[0]} failed (exit ${result.status ?? "unknown"})`,
      ExitCode.GENERAL,
    );
  }
}

function runNpmJson(args: string[], cwd: string): NpmLsNode {
  const registry = process.env.BAILIAN_NPM_REGISTRY;
  const npmArgs = registry ? ["--registry", registry, ...args] : args;
  const result = spawnSync("npm", npmArgs, {
    cwd,
    encoding: "utf8",
    env: buildNpmEnv(),
  });
  const stdout = result.stdout?.trim();
  if (!stdout) {
    throw new BailianError("npm ls returned empty output.", ExitCode.GENERAL);
  }
  try {
    return JSON.parse(stdout) as NpmLsNode;
  } catch {
    throw new BailianError("npm ls returned invalid JSON.", ExitCode.GENERAL);
  }
}

/** 读取沙箱顶级依赖名（优先 npm ls --depth=0，失败则读 package.json） */
async function listTopLevelSandboxDeps(pluginsDir: string): Promise<string[]> {
  try {
    const tree = runNpmJson(["ls", "--json", "--depth=0"], pluginsDir);
    return topLevelDepNamesFromNpmLs(tree);
  } catch {
    return readSandboxDeps(pluginsDir);
  }
}

/** 在多个新增顶级依赖中找出唯一合法的 bailian-cli 插件 */
async function resolvePluginFromAddedDeps(
  pluginsDir: string,
  added: string[],
  packageSpec: string,
): Promise<string> {
  const valid: string[] = [];
  for (const name of added) {
    const root = resolveSandboxPackageRoot(pluginsDir, name);
    if (!existsSync(root)) continue;
    try {
      await validatePluginPackageAsync(root);
      valid.push(name);
    } catch {
      /* 非插件顶级依赖 */
    }
  }

  if (valid.length === 1) return valid[0]!;

  if (valid.length > 1) {
    throw new BailianError(
      `Installed "${packageSpec}" added multiple bailian-cli plugins (${valid.join(", ")}). Install one plugin at a time.`,
      ExitCode.GENERAL,
    );
  }

  if (added.length > 1) {
    throw new BailianError(
      `Installed "${packageSpec}" added multiple top-level packages (${added.join(", ")}), but none is a valid bailian-cli plugin.`,
      ExitCode.GENERAL,
    );
  }

  throw new BailianError(
    `Installed "${packageSpec}" but no valid bailian-cli plugin was found among new top-level dependencies.`,
    ExitCode.GENERAL,
  );
}

/** 列出已发现插件与加载错误 */
export async function listPlugins(): Promise<{
  plugins: Awaited<ReturnType<typeof discoverPlugins>>;
  errors: import("./types.ts").PluginLoadError[];
}> {
  const { loadCommandCatalog } = await import("../load-commands.ts");
  const catalog = await loadCommandCatalog();
  return { plugins: catalog.plugins, errors: catalog.pluginErrors };
}

/** 链接本地插件目录 */
export async function linkPlugin(pluginPath: string): Promise<void> {
  const root = resolve(pluginPath);
  const { name } = await validatePluginPackageAsync(root);
  assertPluginAllowed(name);
  const manifest = await readManifest();
  const plugins = manifest.bailianCli!.plugins!.filter(
    (p) => !(p.type === "link" && p.name === name),
  );
  plugins.push({ name, type: "link", root });
  manifest.bailianCli!.plugins = plugins;
  await writeManifest(manifest);
}

/** 安装 npm 插件到用户沙箱 */
export async function installPlugin(packageSpec: string): Promise<string> {
  // 安装前先按 spec 解析包名做准入校验,避免对不被允许的包执行任何 npm 操作
  const specName = parsePackageNameFromSpec(packageSpec);
  if (!specName) {
    throw new BailianError(
      `无法从 "${packageSpec}" 识别 npm 包名(不支持 git / tarball / 本地路径安装)。目前仅支持安装官方白名单插件(@ali 作用域),暂不支持用户自定义插件。`,
      ExitCode.USAGE,
    );
  }
  assertPluginAllowed(specName);

  const pluginsDir = getPluginsDir();
  await mkdir(pluginsDir, { recursive: true, mode: 0o700 });

  if (!existsSync(getPluginsManifestPath())) {
    await writeManifest(structuredClone(INIT_MANIFEST));
  }

  const beforeDeps = await listTopLevelSandboxDeps(pluginsDir);
  runNpm(
    ["install", packageSpec, "--save-exact", "--ignore-scripts", "--no-fund", "--no-audit"],
    pluginsDir,
  );

  const afterDeps = await listTopLevelSandboxDeps(pluginsDir);
  const added = diffAddedDepNames(beforeDeps, afterDeps);

  let packageName = pickInstalledPackageName(packageSpec, added, afterDeps);

  if (!packageName) {
    if (added.length > 0) {
      packageName = await resolvePluginFromAddedDeps(pluginsDir, added, packageSpec);
    } else {
      throw new BailianError(
        `Installed "${packageSpec}" but no new top-level dependency was detected.`,
        ExitCode.GENERAL,
      );
    }
  }

  const root = resolveSandboxPackageRoot(pluginsDir, packageName);
  const { name } = await validatePluginPackageAsync(root);
  assertPluginAllowed(name);

  const manifest = await readManifest();
  const plugins = manifest.bailianCli!.plugins!.filter((p) => p.name !== name);
  plugins.push({ name, type: "user" });
  manifest.bailianCli!.plugins = plugins;
  await writeManifest(manifest);
  return name;
}

/** remove plugin from user sandbox */
export async function removePlugin(name: string): Promise<void> {
  const manifest = await readManifest();
  const record = manifest.bailianCli!.plugins!.find((p) => p.name === name);
  if (!record) {
    throw new BailianError(`Plugin "${name}" is not installed.`, ExitCode.USAGE);
  }

  if (record.type === "user") {
    const pluginsDir = getPluginsDir();
    try {
      runNpm(["uninstall", name, "--ignore-scripts", "--no-fund", "--no-audit"], pluginsDir);
    } catch {
      /* package may have been manually deleted */
    }
  }

  manifest.bailianCli!.plugins = manifest.bailianCli!.plugins!.filter((p) => p.name !== name);
  await writeManifest(manifest);
}
