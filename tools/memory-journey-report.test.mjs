import { test } from "vite-plus/test";
import assert from "node:assert/strict";
import { summarizeSuite, missingCloudEnvironment } from "./memory-journey-report.mjs";

test("default-library acceptance does not require an explicit library", () => {
  assert.deepEqual(
    missingCloudEnvironment({ DASHSCOPE_API_KEY: "test", BAILIAN_WORKSPACE_ID: "test" }),
    [],
  );
});
test("missing credentials are reported by name, never value", () => {
  assert.deepEqual(missingCloudEnvironment({ DASHSCOPE_API_KEY: "secret" }), [
    "BAILIAN_WORKSPACE_ID",
  ]);
});
test("skipped or absent mandatory journeys cannot pass acceptance", () => {
  const result = summarizeSuite(
    {
      testResults: [
        {
          assertionResults: [
            { title: "J1 saves", status: "passed" },
            { title: "J2 recalls", status: "pending" },
          ],
        },
      ],
    },
    ["J1", "J2", "J3"],
  );
  assert.deepEqual(
    result.map(({ id, status }) => ({ id, status })),
    [
      { id: "J1", status: "PASS" },
      { id: "J2", status: "BLOCKED" },
      { id: "J3", status: "BLOCKED" },
    ],
  );
});
test("one failed check fails the entire journey", () => {
  const result = summarizeSuite(
    {
      testResults: [
        {
          assertionResults: [
            { title: "J4 deletes", status: "passed" },
            { title: "J4 restores", status: "failed" },
          ],
        },
      ],
    },
    ["J4"],
  );
  assert.equal(result[0].status, "FAIL");
});
