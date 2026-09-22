import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    minify: true,
    dts: true,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
