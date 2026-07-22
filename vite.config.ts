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
    "*.{js,mjs,cjs,ts,mts,cts,jsx,tsx,json,yaml,yml,md}": "vp check --fix",
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
        rules: { "no-restricted-properties": restrictCommandCapabilities("configStore") },
      },
      {
        files: ["packages/commands/src/commands/auth/**/*.ts"],
        rules: { "no-restricted-properties": restrictCommandCapabilities("authStore") },
      },
      {
        files: ["packages/commands/src/commands/plugin/**/*.ts"],
        rules: { "no-restricted-properties": restrictCommandCapabilities("commandPacks") },
      },
    ],
  },
  run: {
    cache: true,
  },
});
