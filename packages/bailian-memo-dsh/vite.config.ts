import { defineConfig } from "vite-plus";

// 本包不用 `vp pack`：产物是 tsc 出的 node 半（dist/）+ tsdown 出的浏览器 bundle。
export default defineConfig({
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
