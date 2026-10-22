import { expect, test } from "vite-plus/test";
import { memoryEndpoint, memoryListPath } from "../src/client/endpoints.ts";
import { ExitCode } from "../src/errors/codes.ts";

test.each([
  "example.invalid/",
  "host@evil.invalid/",
  "host?query",
  "host#fragment",
  "host\\path",
  "host:443/",
  "",
  " host",
  "host%2fpath",
  "host.other",
])("rejects workspace URL syntax %j before credentials can be routed", (workspace) => {
  expect(() => memoryEndpoint(workspace, memoryListPath())).toThrow(
    expect.objectContaining({ exitCode: ExitCode.USAGE }),
  );
});
test.each(["ws_test", "llm-abc123", "123456", "WorkspaceABC"])(
  "retains valid workspace %s on service host",
  (workspace) => {
    expect(new URL(memoryEndpoint(workspace, memoryListPath())).hostname).toBe(
      `${workspace.toLowerCase()}.cn-beijing.maas.aliyuncs.com`,
    );
  },
);
