import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    globalSetup: "./packages/commands/tests/e2e/core/global-setup.ts",
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  staged: {
    "*.{js,mjs,cjs,ts,mts,cts,jsx,tsx,json,yaml,yml,md}": "vp check --fix",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  run: {
    cache: true,
  },
});
