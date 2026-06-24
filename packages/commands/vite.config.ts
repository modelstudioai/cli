import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    globalSetup: "./tests/e2e/core/global-setup.ts",
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  pack: {
    dts: {
      tsgo: true,
    },
    exports: {
      devExports: "@bailian-cli/source",
    },
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
