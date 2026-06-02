import type { BailianCliPackageMeta } from "bailian-cli-core";

/** 插件来源类型 */
export type PluginSourceType = "discovered" | "user" | "link";

/** 已发现的插件包描述 */
export interface DiscoveredPlugin {
  name: string;
  root: string;
  version?: string;
  source: PluginSourceType;
  bailianCli: BailianCliPackageMeta;
}

/** 用户插件清单中的条目 */
export interface UserPluginRecord {
  name: string;
  type: "user" | "link";
  root?: string;
  tag?: string;
}

/** ~/.bailian/plugins/package.json 结构 */
export interface UserPluginsManifest {
  private?: boolean;
  dependencies?: Record<string, string>;
  bailianCli?: {
    schema?: number;
    plugins?: UserPluginRecord[];
  };
}

/** 插件加载过程中的非致命错误 */
export interface PluginLoadError {
  plugin: string;
  message: string;
}

/** 扫描到的插件命令绑定 */
export interface ScannedPluginCommand {
  commandPath: string;
  modulePath: string;
  plugin: DiscoveredPlugin;
}

/** loadCommandCatalog 返回值 */
export interface CommandCatalog {
  commands: Record<string, import("bailian-cli-core").Command>;
  noAuthSetup: string[][];
  plugins: DiscoveredPlugin[];
  pluginErrors: PluginLoadError[];
}
