/**
 * bailian-cli 插件包 package.json 中的 bailianCli 字段。
 */
export interface BailianCliPackageMeta {
  /** 声明该 npm 包为 bailian-cli 插件 */
  plugin?: boolean;
  /** 命令文件目录，相对插件包根目录 */
  commands?: string;
  /** 不需 API key 鉴权准备的命令路径（空格分隔，如 "test"） */
  noAuthSetup?: string[];
}

/** 插件包可选导出的元数据（非必须；宿主以扫描 commands 目录为准） */
export interface BailianPlugin {
  name: string;
  version?: string;
  /** 不需鉴权准备的命令路径 */
  noAuthSetup?: string[];
}

/** 将 commands 目录下的相对文件路径转为 bl 命令路径（空格分隔） */
export function fileToCommandPath(relativeFile: string): string {
  const withoutExt = relativeFile.replace(/\.(js|mjs|ts|tsx)$/, "");
  const parts = withoutExt.split(/[/\\]/).filter(Boolean);
  if (parts.at(-1) === "index") parts.pop();
  return parts.join(" ");
}

/** 将 bl 命令路径转为 commands 目录下的相对路径（不含扩展名） */
export function commandPathToFileBase(commandPath: string): string {
  return commandPath.trim().split(/\s+/).join("/");
}

const BUILTIN_PACKAGE_NAMES = new Set(["bailian-cli", "bailian-cli-core"]);

/** 判断 npm 包名是否符合 bailian-cli 插件命名：bailian-plugin-* 或 @scope/bailian-plugin-* */
export function isPluginPackageName(name: string): boolean {
  if (BUILTIN_PACKAGE_NAMES.has(name)) return false;
  if (name.startsWith("bailian-plugin-")) return true;
  const scoped = /^@[^/]+\/(.+)$/.exec(name);
  if (scoped) return scoped[1]!.startsWith("bailian-plugin-");
  return false;
}

/** 读取 package.json 后判断是否为 bailian-cli 插件（命名 + bailianCli.plugin=true） */
export function isBailianPluginPackage(
  name: string,
  bailianCli: BailianCliPackageMeta | undefined,
): boolean {
  if (BUILTIN_PACKAGE_NAMES.has(name)) return false;
  if (!isPluginPackageName(name)) return false;
  return bailianCli?.plugin === true;
}
