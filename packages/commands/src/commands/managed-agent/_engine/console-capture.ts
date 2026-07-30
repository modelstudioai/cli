/**
 * Redirect `console.log` / `console.info` to stderr while `fn` runs.
 *
 * The OpenAgentPack SDK's provider adapters emit progress/debug logging via
 * `console.log` (e.g. `[skill-upload]`), which would corrupt bl's stdout data
 * channel in `--output json` mode. Wrapping SDK calls that may log keeps stdout
 * a clean data channel. Restores the originals on completion.
 */
export async function withStdoutProtected<T>(fn: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalInfo = console.info;
  const toStderr = (...args: unknown[]): void => {
    process.stderr.write(`${args.map((arg) => String(arg)).join(" ")}\n`);
  };
  console.log = toStderr;
  console.info = toStderr;
  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.info = originalInfo;
  }
}
