import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** npm ls --json 输出的节点 */
export interface NpmLsNode {
  dependencies?: Record<string, NpmLsNode>;
}

/** 从 npm ls --depth=0 结果提取顶级依赖名 */
export function topLevelDepNamesFromNpmLs(tree: NpmLsNode): string[] {
  if (!tree.dependencies) return [];
  return Object.keys(tree.dependencies);
}

/** 对比安装前后新增的顶级依赖名 */
export function diffAddedDepNames(before: string[], after: string[]): string[] {
  const prev = new Set(before);
  return after.filter((name) => !prev.has(name));
}

/** 解析沙箱 node_modules 中包的根目录 */
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
 * 从 install spec 解析 npm 包名（git URL / tarball 无法推断时返回 undefined）
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
 * 根据安装前后顶级依赖 diff 与 spec，选出本次安装的目标包名
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

/** 读取沙箱 package.json 中的顶级 dependencies 名 */
export async function readSandboxPjsonDepNames(pluginsDir: string): Promise<string[]> {
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
