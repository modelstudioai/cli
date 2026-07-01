import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: {
      kscli: "src/main.ts",
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
