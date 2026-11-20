/**
 * Network failure diagnostics: extract errno from the fetch cause chain and recognize sandbox network-denial signatures.
 *
 * When an agent host sandbox (e.g. Codex's default workspace-write) disables outbound network, connect fails immediately
 * with EPERM/EACCES/ENETUNREACH/EHOSTUNREACH — this is not a regional network issue and mirrors cannot fix it;
 * the hint must guide toward enabling network or using an egress proxy, never mislead the user into switching sources.
 */

import { connect as netConnect } from "node:net";

/** Typical errno of sandbox-blocked outbound network (connect fails immediately, not a timeout/reset). */
const SANDBOX_DENIAL_CODES = new Set(["EPERM", "EACCES", "ENETUNREACH", "EHOSTUNREACH"]);

/** Take the first string errno along the cause chain (undici wraps connect errors inside TypeError.cause). */
export function networkCauseCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current != null; depth += 1) {
    const code = (current as NodeJS.ErrnoException).code;
    if (typeof code === "string" && code.length > 0) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Whether the code is a sandbox network-denial signature (EPERM/EACCES/ENETUNREACH/EHOSTUNREACH). */
export function isSandboxNetworkDenialCode(code: string | undefined): boolean {
  return code !== undefined && SANDBOX_DENIAL_CODES.has(code);
}

/** Core-layer sandbox-block guidance (abstract actions; no product command names or URLs). */
export const SANDBOX_NETWORK_HINT =
  "The execution environment (for example an AI agent sandbox) may be blocking outbound network. Enable network access for this process in the agent settings, or run the command in a regular terminal. If an egress proxy is required, set HTTPS_PROXY.";

/** TCP reachability probe: undefined on success, errno on failure (used by the doctor host network preflight). */
export function probeTcpHost(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const socket = netConnect({ host, port });
    const finish = (code?: string) => {
      socket.destroy();
      resolve(code);
    };
    socket.setTimeout(timeoutMs, () => finish("ETIMEDOUT"));
    socket.once("connect", () => finish(undefined));
    socket.once("error", (error: NodeJS.ErrnoException) => finish(error.code ?? "UNKNOWN"));
  });
}
