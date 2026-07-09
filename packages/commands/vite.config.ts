import { defineConfig } from "vite-plus";

export default defineConfig({
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
