/**
 * Browser bundle for the plugin's client half, mirroring the host's tsdown
 * client preset (packages/client/tsdown.client.ts — spelled out here because
 * an out-of-tree package cannot import it): a closure-factory artifact that
 * calls window.__ModuleLoader__.load({id, factory}) and resolves externals
 * through the injected require. CSS Modules are compiled by lightningcss
 * inside the bundle: importing `x.module.css` yields the hashed class map and
 * auto-injects a <style data-plugin> tag at factory execution.
 */
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve as resolvePath } from "node:path";
import { defineConfig } from "tsdown";
import { transform } from "lightningcss";

/** Plugin id stamped into the __ModuleLoader__.load handoff and style tags. */
const PLUGIN_ID = "bailian-kb-dsh";

/** The module specifiers the shell shares into the frozen module table. */
const PLATFORM_MODULES = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "@deepseek-ai/cordis",
  "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-client-web-react",
  "@deepseek-ai/dsh-client-ui-primitives",
  "@deepseek-ai/dsh-client-ui-attachment",
  "@deepseek-ai/dsh-client-schema-form",
];

/**
 * Documented host exemption (not a platform module): the snapshot-store
 * engine lives in runtime pending its rehoming; at runtime the lazy CJS table
 * answers the require natively.
 */
const RUNTIME_STORE_EXEMPTION = "@deepseek-ai/dsh-client-runtime/client";

/** Externals resolved from the loader module table. */
const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES, RUNTIME_STORE_EXEMPTION];

/** Virtual-id wrapper keeping module CSS away from tsdown's own css pipeline. */
const CSS_VIRTUAL_PREFIX = "\0dsh-css:";
const CSS_VIRTUAL_SUFFIX = ".mjs";

export default defineConfig({
  name: `${PLUGIN_ID}/client`,
  entry: { client: "src/web/index.ts" },
  // Browser bundle lands in its own dist/web subdir: the tsc node half owns
  // dist/ directly, and a shared outDir would clobber dist/client.js (the KbClient
  // module) with this artifact. The entryFileNames pin keeps it exactly
  // dist/web/client.js; the host serves it at /plugins/<id>/client.js via
  // exports["./client"]. clean must stay off — a default clean would wipe the
  // tsc-emitted node half.
  outDir: "dist/web",
  format: "cjs",
  platform: "browser",
  dts: false,
  sourcemap: true,
  clean: false,
  external: [...CLIENT_EXTERNALS],
  // tsdown auto-externalizes package dependencies; anything NOT in the loader
  // module table must inline instead. A require() the table cannot answer is a
  // guaranteed runtime throw, so the rule is the table list itself.
  noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
    "import.meta.env.MODE": JSON.stringify(process.env.NODE_ENV ?? "production"),
    "import.meta.env": JSON.stringify({ MODE: process.env.NODE_ENV ?? "production" }),
  },
  plugins: [
    {
      // Bundle purity gate (build-time mirror of the module-edge rules):
      // platform seed entries stay external; every other @deepseek-ai value
      // import is a build error — a cross-plugin value import either inlines a
      // duplicate runtime instance or requires a specifier the frozen module
      // table cannot answer. Cross-plugin collaboration goes through cordis
      // services instead (type-only imports are erased and never reach this gate).
      name: "dsh-client-bundle-purity",
      resolveId(source: string) {
        if (!source.startsWith("@deepseek-ai/")) return null;
        if (CLIENT_EXTERNALS.includes(source)) return null; // platform module: external wins
        throw new Error(
          `client bundle purity: "${source}" is not a platform module (CLIENT_EXTERNALS) — ` +
            "cross-plugin value imports are forbidden; collaborate through cordis services " +
            "(type-only imports are erased and never reach this gate)",
        );
      },
    },
    {
      name: "dsh-css-modules-inline",
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith(".module.css")) return null;
        const abs = importer !== undefined ? resolvePath(dirname(importer), source) : source;
        return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX;
      },
      async load(virtualId: string) {
        if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null;
        const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length);
        // The virtual id otherwise hides the physical stylesheet from the watch graph.
        this.addWatchFile(fileId);
        const source = await readFile(fileId);
        const { code, exports: cssExports } = transform({
          filename: fileId,
          code: source,
          cssModules: { pattern: "[hash]_[local]" },
          minify: true,
        });
        const classMap: Record<string, string> = {};
        for (const [local, exp] of Object.entries(cssExports ?? {})) classMap[local] = exp.name;
        // One <style data-plugin> per module file; idempotent under re-evaluation.
        return [
          `const css = ${JSON.stringify(code.toString())};`,
          `const tagId = ${JSON.stringify(`${PLUGIN_ID}/${basename(fileId)}`)};`,
          "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
          "  const tag = document.createElement('style');",
          `  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
          "  tag.dataset.pluginCss = tagId;",
          "  tag.textContent = css;",
          "  document.head.appendChild(tag);",
          "}",
          `export default ${JSON.stringify(classMap)};`,
        ].join("\n");
      },
    },
  ],
  outputOptions: {
    entryFileNames: "client.js",
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: "return module.exports; } });",
    intro: "var module = { exports: {} }; var exports = module.exports;",
  },
});
