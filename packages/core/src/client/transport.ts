import { fetch as undiciFetch, getGlobalDispatcher, setGlobalDispatcher } from "undici";

// Initialize native Web APIs before proxy setup: Node 26's lazy initialization
// can replace the shared dispatcher. Preserve the dispatcher already installed.
const dispatcherBeforeWebApis = process.versions.bun ? undefined : getGlobalDispatcher();
void globalThis.Request;
if (dispatcherBeforeWebApis && getGlobalDispatcher() !== dispatcherBeforeWebApis) {
  setGlobalDispatcher(dispatcherBeforeWebApis);
}

export const httpTransport = {
  async fetch(this: void, input: string | URL | Request, init?: RequestInit): Promise<Response> {
    if (process.versions.bun) {
      return globalThis.fetch(input, init);
    }
    return undiciFetch(
      input as Parameters<typeof undiciFetch>[0],
      init as Parameters<typeof undiciFetch>[1],
    ) as unknown as Promise<Response>;
  },
};
