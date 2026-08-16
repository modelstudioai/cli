/**
 * bailian-cli-dsh — Aliyun Model Studio capabilities as a DeepSeek Harness
 * profile bundle. The package's substance is `cordis.patch.yml`, declared by
 * the `dsh.bundle.patch` manifest field and resolved by the profile composer.
 *
 * This root module is the no-op node half loaded by the `bailian-client` row
 * (whose purpose is to make `client-modules` serve the browser bundle
 * `client.bundle.js`). Cordis requires every row to resolve to a plugin with
 * an `apply` method, so this exports a minimal one. The real Host logic lives
 * in `./tokenplan-usage` and `./memory`; the browser UI lives in
 * `client.bundle.js`.
 *
 * @module bailian-cli-dsh
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = "bailian-cli-dsh";

/** No-op: this row exists only to serve the client bundle. */
export function apply(): void {}
