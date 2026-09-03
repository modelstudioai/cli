import { defineConfig } from "vite-plus";

const commandCapabilityRestrictions = [
  {
    property: "configStore",
    message: "configStore is only available to commands/config/**.",
  },
  {
    property: "authStore",
    message: "authStore is only available to commands/auth/**.",
  },
  {
    property: "commandPacks",
    message: "commandPacks is only available to commands/plugin/**.",
  },
  {
    property: "exportApiCredential",
    message:
      "exportApiCredential is only available to commands/managed-agent/_engine/** (embedded-SDK credential delegation).",
  },
] as const;

type CommandCapabilityRestriction = (typeof commandCapabilityRestrictions)[number];
type CommandCapability = CommandCapabilityRestriction["property"];

function restrictCommandCapabilities(
  allowed?: CommandCapability,
): ["error", ...CommandCapabilityRestriction[]] {
  return ["error", ...commandCapabilityRestrictions.filter(({ property }) => property !== allowed)];
}

export default defineConfig({
  test: {
    globalSetup: "./packages/e2e/src/global-setup.ts",
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  staged: {
    // 用函数形式返回命令：不把匹配到的文件名插值进 argv，改为跑一次全量检查。
    // 逐文件传参会让 `vp check` 的 node 进程 argv 携带仓库内的文件名,
    // 命中终端安全软件按 argv 子串匹配的进程管控规则时整个进程被 SIGKILL,
    // 导致 pre-commit 无法完成。全量检查覆盖面更广,也不依赖文件名。
    "*.{js,mjs,cjs,ts,mts,cts,jsx,tsx,json,yaml,yml,md}": () => "vp check --fix",
  },
  lint: {
    options: { typeAware: true, typeCheck: true },
    // 命令只许抛错；进程退出统一收口到 runtime 的 handleError。
    rules: { "unicorn/no-process-exit": "error" },
    overrides: [
      {
        // runtime 是统一出口层；tools/ 与测试是独立脚本入口，可直接退出。
        files: ["packages/runtime/src/**", "tools/**", "**/tests/**"],
        rules: { "unicorn/no-process-exit": "off" },
      },
      {
        // finetune watch 的退出码是公开探针契约（0 成功/1 失败/2 超时/3 运行中/130 中断），
        // 非错误语义，不走 handleError。
        files: ["packages/commands/src/commands/finetune/watch.ts"],
        rules: { "unicorn/no-process-exit": "off" },
      },
      {
        // 普通业务命令只依赖 settings/flags/client；持久化和管理能力按命令族开放。
        files: ["packages/commands/src/commands/**/*.ts"],
        rules: { "no-restricted-properties": restrictCommandCapabilities() },
      },
      {
        files: ["packages/commands/src/commands/config/**/*.ts"],
        rules: {
          "no-restricted-properties": restrictCommandCapabilities("configStore"),
        },
      },
      {
        files: ["packages/commands/src/commands/auth/**/*.ts"],
        rules: {
          "no-restricted-properties": restrictCommandCapabilities("authStore"),
        },
      },
      {
        files: ["packages/commands/src/commands/plugin/**/*.ts"],
        rules: {
          "no-restricted-properties": restrictCommandCapabilities("commandPacks"),
        },
      },
      {
        files: ["packages/commands/src/commands/managed-agent/_engine/**/*.ts"],
        rules: {
          "no-restricted-properties": restrictCommandCapabilities("exportApiCredential"),
        },
      },
      {
        // dsh 插件（下游宿主适配层）的 `_` 前缀是“有意不用”的声明：被忽略的 catch
        // 绑定用 `_原因` 命名解释为何可以忽略，测试 mock 的 `_path` 类参数则是为了
        // 钉住被 mock 函数的签名（删了就不再约束调用形状）。
        files: ["packages/bailian-kb-dsh/**/*.{ts,tsx}"],
        rules: {
          "no-unused-vars": ["error", { caughtErrorsIgnorePattern: "^_", argsIgnorePattern: "^_" }],
        },
      },
      {
        // web 半会被 tsdown 打成浏览器 bundle,由 host 的 frozen module table 解析 require:
        // node 内置模块和本仓 CLI 包在那里根本不存在,import 到就是运行时必崩。
        // @deepseek-ai/* 的 platform module 白名单仍由 tsdown 的 dsh-client-bundle-purity
        // 插件在构建期把关（名单即 CLIENT_EXTERNALS,见 tsdown.config.ts）。
        files: ["packages/bailian-kb-dsh/src/web/**/*.{ts,tsx}"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              paths: ["bailian-cli-core", "bailian-cli-runtime", "bailian-cli-commands"],
              patterns: ["node:*"],
            },
          ],
        },
      },
    ],
  },
  run: {
    cache: true,
  },
});
