import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    globalSetup: "../commands/tests/e2e/core/global-setup.ts",
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  pack: {
    entry: {
      bailian: "src/main.ts",
    },
    hash: false,
    minify: true,
    platform: "node",
    banner: "#!/usr/bin/env node\n",
    outputOptions: {
      codeSplitting: false,
    },
    dts: {
      tsgo: true,
    },
    exports: true,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
