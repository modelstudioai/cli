/**
 * Build the browser client bundle in the DSH ModuleLoader closure format.
 *
 * The DSH web shell only loads client plugins that call
 * `window.__ModuleLoader__.load({ id, factory })`, resolving externals (react)
 * through the injected `require`. vite-plus emits plain ESM (wrong format), so
 * the client is built separately with esbuild: CJS + browser platform + react
 * external, wrapped in the ModuleLoader banner/footer.
 *
 * Run after `vp pack` (see package.json "build").
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const pkgDir = dirname(dirname(fileURLToPath(import.meta.url)));
const esbuild = join(pkgDir, "node_modules", ".bin", "esbuild");

const banner =
  'window.__ModuleLoader__.load({ id: "bailian-cli-dsh", factory: (require) => { ' +
  "var module = { exports: {} }; var exports = module.exports;";
const footer = "return module.exports; } });";

const result = spawnSync(
  esbuild,
  [
    "src/client.ts",
    "--bundle",
    "--format=cjs",
    "--platform=browser",
    "--external:react",
    `--banner:js=${banner}`,
    `--footer:js=${footer}`,
    "--outfile=client.bundle.js",
  ],
  { cwd: pkgDir, stdio: "inherit" },
);

if (result.status !== 0) {
  // Throw rather than process.exit: an uncaught top-level error still yields a
  // non-zero exit (so `pnpm build` fails), and it carries esbuild's own status.
  throw new Error(`build-client: esbuild failed with status ${result.status ?? "unknown"}`);
}
console.log("build-client: client.bundle.js (ModuleLoader format) written");
