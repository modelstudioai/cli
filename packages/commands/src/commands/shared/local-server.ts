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

export interface OpenInvocation {
  command: string;
  args: string[];
  /** Windows only: keep the quotes we added for `cmd.exe`. */
  windowsVerbatimArguments?: boolean;
}

/**
 * Quote a value for `cmd.exe`. `%` is doubled because cmd expands variables even
 * inside quotes; embedded `"` becomes `""`.
 */
function quoteForCmd(value: string): string {
  return `"${value.replaceAll("%", "%%").replaceAll('"', '""')}"`;
}

/**
 * Command that opens `target` with the OS default handler.
 *
 * On Windows, `start` is a `cmd.exe` builtin. An empty argv slot is not enough:
 * cmd re-parses the command line and treats an unquoted `&` as a separator, so
 * `...&needapikey=true` never reaches the browser. `start` also consumes the
 * first quoted argument as a window title. `/d` skips AutoRun, `/v:off` disables
 * delayed expansion, and `/s /c` strips one outer quote pair, leaving:
 * `start "" "<target>"`.
 */
export function buildOpenInvocation(target: string, platform = process.platform): OpenInvocation {
  if (platform === "win32") {
    const inner = `start "" ${quoteForCmd(target)}`;
    return {
      command: "cmd",
      args: ["/d", "/v:off", "/s", "/c", `"${inner}"`],
      windowsVerbatimArguments: true,
    };
  }
  if (platform === "darwin") {
    return { command: "open", args: [target] };
  }
  return { command: "xdg-open", args: [target] };
}

/**
 * Open a local file, directory, or URL with the OS default handler
 * (best-effort, cross-platform).
 */
export function openPath(target: string): Promise<void> {
  const invocation = buildOpenInvocation(target);
  return new Promise((resolve, reject) => {
    execFile(
      invocation.command,
      invocation.args,
      {
        windowsHide: true,
        windowsVerbatimArguments: invocation.windowsVerbatimArguments,
      },
      (err) => {
        if (err) reject(err);
        else resolve();
      },
    );
  });
}

/** Open a URL in the user's default browser (best-effort, cross-platform). */
export function openInBrowser(url: string): Promise<void> {
  return openPath(url);
}
