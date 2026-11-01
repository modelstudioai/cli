import { sdkOutput, withSdkInvocation, writeSdkDiagnostic, type HostContext } from "./transport.ts";

type ConsoleMethod = "log" | "info" | "debug" | "warn" | "error";
const methods: readonly ConsoleMethod[] = ["log", "info", "debug", "warn", "error"];
const routers = new Map<ConsoleMethod, (...arguments_: unknown[]) => void>();

/** The SDK has no logger seam and logs complete file responses. Keep only safe summaries. */
function installSdkConsoleRouting(): void {
  for (const method of methods) {
    if (console[method] === routers.get(method)) continue;
    const previous = console[method];
    const route = (...arguments_: unknown[]): void => {
      const output = sdkOutput();
      if (!output) {
        previous.apply(console, arguments_);
        return;
      }
      const first = arguments_[0];
      const component =
        typeof first === "string"
          ? (/^\[(agent-skill|skill-upload|agents)\]/u.exec(first)?.[1] ?? "sdk")
          : "sdk";
      writeSdkDiagnostic(() => {
        const diagnostic = {
          code: "AGENT_SDK_DIAGNOSTIC",
          message: { "en-US": "Managed Agent SDK diagnostic", "zh-CN": "托管 Agent SDK 诊断" },
          details: { component, method, argument_count: arguments_.length },
        };
        if (method === "warn" || method === "error") output.warning(diagnostic);
        else output.debug(diagnostic);
      });
    };
    routers.set(method, route);
    console[method] = route;
  }
}

/** Context routing also covers SDK callbacks scheduled before this promise completes. */
export function withStdoutProtected<Result>(
  host: HostContext,
  run: () => Promise<Result>,
): Promise<Result> {
  installSdkConsoleRouting();
  return withSdkInvocation(host, run);
}
