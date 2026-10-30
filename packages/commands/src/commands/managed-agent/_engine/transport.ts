import { AsyncLocalStorage } from "node:async_hooks";
import * as sdk from "@openagentpack/sdk";
import {
  createInstrumentedFetch,
  httpTransport,
  type CommandOutput,
  type FetchImplementation,
  type Identity,
  type Settings,
} from "bailian-cli-core";

/** Invocation-owned SDK diagnostics and transport; never retain the first CLI host. */
export interface HostContext {
  identity: Identity;
  settings: Settings;
  output: CommandOutput;
}

interface SdkInvocation {
  output: CommandOutput;
  fetch: FetchImplementation;
}
const invocations = new AsyncLocalStorage<SdkInvocation>();

export function sdkOutput(): CommandOutput | undefined {
  return invocations.getStore()?.output;
}

/** Third-party diagnostics must never turn a successful SDK operation into a failure. */
export function writeSdkDiagnostic(write: () => void): void {
  try {
    write();
  } catch {
    /* The business operation owns success and failure. */
  }
}

const routedFetch: FetchImplementation = (input, init) =>
  (invocations.getStore()?.fetch ?? httpTransport.fetch)(input, init);

export function installSdkTransport(): void {
  sdk.setDefaultFetch(routedFetch);
}

export function withSdkInvocation<Result>(
  host: HostContext,
  run: () => Promise<Result>,
): Promise<Result> {
  installSdkTransport();
  const output = host.output;
  const fetch = createInstrumentedFetch({
    identity: host.identity,
    settings: host.settings,
    debug: (message) => writeSdkDiagnostic(() => output.debug(message)),
  });
  return invocations.run({ output, fetch }, run);
}
