import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    globalSetup: "./packages/cli/tests/e2e/global-setup.ts",
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
    ],
  },
  run: {
    cache: true,
  },
});
