import { NPM_REGISTRY } from "bailian-cli-runtime";
import { E2E_HARNESS_IDENTITY } from "./identity.ts";

/** The unpublished harness package is always a local 404; business requests retain real fetch. */
export async function withHarnessUpdateFixture<Result>(
  run: () => Promise<Result>,
): Promise<Result> {
  const originalFetch = globalThis.fetch;
  const updateUrl = `${NPM_REGISTRY}/${E2E_HARNESS_IDENTITY.npmPackage}/latest`;
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === updateUrl) return Promise.resolve(new Response(null, { status: 404 }));
    return originalFetch(input, init);
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}
