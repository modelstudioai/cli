import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    globalSetup: "./src/global-setup.ts",
    setupFiles: ["./src/iso-root-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
