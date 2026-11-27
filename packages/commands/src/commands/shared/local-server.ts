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
 * Quote a value for `cmd /c`. An embedded `"` is written as `""`, which cmd
 * reads as one literal quote.
 *
 * Do not double `%`. `%%` → `%` is a batch-file rule and does not apply when
 * Node starts `cmd /c` directly. Doubling would make `start` open a different
 * target (`%20` would stay `%20` with two percent signs).
 */
function quoteForCmd(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
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

export interface OpenPathOptions {
  /**
   * Kill the opener after this many milliseconds. Left unset, the promise waits as
   * long as the OS handler takes — the historical behaviour, and deliberately still
   * the default: callers like `config ui` map a rejected opener onto an HTTP 400 or a
   * "could not open" warning, so a blanket cap would turn "slow but already opened"
   * into a false failure. Callers that must hand the terminal back pass `timeoutMs`.
   */
  timeoutMs?: number;
}

/**
 * True when {@link openPath} killed the opener at its own cap, as opposed to the OS
 * handler failing. Any caller that sets `timeoutMs` must branch on this, so an
 * unconfirmed open is reported as "not confirmed" rather than "could not open".
 */
export function isOpenPathTimeout(error: unknown): boolean {
  return error instanceof Error && (error as { killed?: boolean }).killed === true;
}

/**
 * Open a local file, directory, or URL with the OS default handler
 * (best-effort, cross-platform).
 *
 * When `timeoutMs` is set the child is killed at the cap. Killing is what releases
 * Node's event loop: `child.unref()` alone does not, because `execFile` keeps ref'd
 * stdout/stderr pipe handles, so an unref'd opener still delays the prompt.
 */
export function openPath(target: string, options: OpenPathOptions = {}): Promise<void> {
  const invocation = buildOpenInvocation(target);
  return new Promise((resolve, reject) => {
    execFile(
      invocation.command,
      invocation.args,
      {
        windowsHide: true,
        windowsVerbatimArguments: invocation.windowsVerbatimArguments,
        ...(options.timeoutMs === undefined
          ? {}
          : { timeout: options.timeoutMs, killSignal: "SIGTERM" }),
      },
      (err) => {
        if (err) reject(err);
        else resolve();
      },
    );
  });
}

/** Open a URL in the user's default browser (best-effort, cross-platform). */
export function openInBrowser(url: string, options?: OpenPathOptions): Promise<void> {
  return openPath(url, options);
}
