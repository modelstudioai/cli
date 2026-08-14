import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    // One entry per `exports` subpath: each dsh plugin row imports its own
    // module specifier, so they cannot share a bundle.
    entry: [
      "src/index.ts",
      "src/tool-vision/index.ts",
      "src/tool-image/index.ts",
      "src/web-search-rag/index.ts",
      "src/memory/index.ts",
      "src/subagent-managed-agent/index.ts",
    ],
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
