import { defineConfig } from "vite-plus";

// 本包不用 `vp pack`：产物是 tsc 出的 node 半（dist/）+ tsdown 出的浏览器 bundle
// （dist/web/client.js，带 __ModuleLoader__ banner 与 lightningcss CSS Modules 内联），
// 由包内 `build` script 负责。这里只接管 lint / fmt / test。
export default defineConfig({
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
