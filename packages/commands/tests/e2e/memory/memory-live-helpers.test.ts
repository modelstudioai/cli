import { expect, test } from "vite-plus/test";
import { assertMemoryServiceRejection } from "./live-helpers.ts";

test("live negative assertion accepts a service not-found response", () => {
  expect(() =>
    assertMemoryServiceRejection({
      exitCode: 1,
      stderr: JSON.stringify({
        error: {
          http_status: 404,
          request_id: "request1",
          api_code: "NotFound",
          message: "node not found",
        },
      }),
    }),
  ).not.toThrow();
});

test.each([
  { exitCode: 2, error: { message: "Missing --workspace-id" } },
  { exitCode: 1, error: { message: "fetch failed" } },
  { exitCode: 1, error: { http_status: 401, request_id: "request1", message: "Invalid API key" } },
  { exitCode: 1, error: { http_status: 429, request_id: "request1", message: "Rate limit" } },
  { exitCode: 1, error: { http_status: 500, request_id: "request1", message: "Internal error" } },
  { exitCode: 1, error: { http_status: 404, message: "node not found" } },
])("live negative assertion rejects unrelated failures: $error.message", ({ exitCode, error }) => {
  expect(() =>
    assertMemoryServiceRejection({ exitCode, stderr: JSON.stringify({ error }) }),
  ).toThrow();
});
