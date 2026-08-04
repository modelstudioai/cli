import { execFile } from "node:child_process";
import http from "node:http";

/**
 * Bind an http server to a loopback-only TCP port and resolve the chosen port.
 * `port = 0` (default) lets the OS pick a free port. Always binds 127.0.0.1 so
 * the server is never reachable off the local machine.
 */
export function listenLocalServer(server: http.Server, port = 0): Promise<number> {
  return new Promise((resolve, reject) => {
    const onErr = (e: Error) => reject(e);
    server.once("error", onErr);
    server.listen({ port, host: "127.0.0.1", exclusive: true }, () => {
      server.off("error", onErr);
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Expected TCP socket address"));
        return;
      }
      resolve(addr.port);
    });
  });
}

/**
 * Open a local file, directory, or URL with the OS default handler
 * (best-effort, cross-platform). Arguments are passed to `execFile` as an array
 * so the target is never interpreted by a shell.
 */
export function openPath(target: string): Promise<void> {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", target] : [target];

  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/** Open a URL in the user's default browser (best-effort, cross-platform). */
export function openInBrowser(url: string): Promise<void> {
  return openPath(url);
}
