import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    minify: true,
    dts: {
      generator: "tsgo",
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
