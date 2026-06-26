import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    minify: true,
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
