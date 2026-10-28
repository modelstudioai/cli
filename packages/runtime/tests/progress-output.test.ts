import { afterEach, expect, test, vi } from "vite-plus/test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Client, Settings } from "bailian-cli-core";
import { createOutputReporter } from "../src/output/reporter.ts";
import { poll } from "../src/utils/polling.ts";
import { downloadFile } from "../src/utils/download.ts";

afterEach(() => vi.restoreAllMocks());

test("failed polling emits only structured debug before throwing", async () => {
  let stderr = "";
  const settings = { output: "json", quiet: true, verbose: true } as Settings;
  const output = createOutputReporter({
    settings,
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      },
    },
  }).output;
  const client = {
    requestJson: async () => ({ status: "FAILED", api_key: "fake-secret" }),
  } as unknown as Client;
  await expect(
    poll(client, {
      url: "/task",
      intervalSec: 0,
      timeoutSec: 1,
      isComplete: () => false,
      isFailed: () => true,
      output,
    }),
  ).rejects.toThrow("Task failed");
  const records = stderr
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(records).toEqual([
    { debug: { message: "Task response", details: { status: "FAILED", api_key: "[REDACTED]" } } },
  ]);
});

test.each(
  (["text", "json"] as const).flatMap((format) =>
    [false, true].flatMap((quiet) => [false, true].map((tty) => ({ format, quiet, tty }))),
  ),
)(
  "download progress keeps terminal behavior: $format quiet=$quiet tty=$tty",
  async ({ format, quiet, tty }) => {
    const directory = mkdtempSync(join(tmpdir(), "bl-download-output-"));
    let stderr = "";
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
    const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
    Object.defineProperty(process.stderr, "isTTY", { value: tty, configurable: true });
    try {
      const chunks = [new TextEncoder().encode("pay"), new TextEncoder().encode("load")];
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              for (const chunk of chunks) controller.enqueue(chunk);
              controller.close();
            },
          }),
          { headers: { "content-length": "7" } },
        ),
      );
      const destination = join(directory, "file.bin");
      expect(
        await downloadFile("https://example.invalid/file", destination, {
          quiet: quiet || format === "json",
        }),
      ).toEqual({ size: 7 });
      expect(readFileSync(destination, "utf-8")).toBe("payload");
      if (tty && format === "text" && !quiet) {
        expect(stderr).toContain("\r");
        expect(stderr).toContain("100%");
        expect(stderr.match(/\n/g)).toHaveLength(1);
      } else {
        expect(stderr).toBe("");
      }
    } finally {
      if (ttyDescriptor) Object.defineProperty(process.stderr, "isTTY", ttyDescriptor);
      else Reflect.deleteProperty(process.stderr, "isTTY");
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
