// Test-only child-process transport seam. The command still builds its real
// workspace URL; only the final request is sent to the local fixture server.
import { httpTransport } from "bailian-cli-core";

const origin = new URL(process.env.BAILIAN_MEMORY_TEST_ORIGIN);
if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1") {
  throw new Error("Memory fixture requires a loopback HTTP origin");
}
const originalFetch = httpTransport.fetch;
httpTransport.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (
    url.hostname !== "ws-test.cn-beijing.maas.aliyuncs.com" ||
    !url.pathname.startsWith("/api/v2/apps/memory/")
  ) {
    throw new Error("Unexpected non-memory request in memory fixture");
  }
  return originalFetch(new URL(url.pathname + url.search, origin), init);
};
