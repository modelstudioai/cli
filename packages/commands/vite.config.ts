import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    globalSetup: "../e2e/src/global-setup.ts",
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  pack: {
    minify: true,
    dts: {
      tsgo: true,
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
