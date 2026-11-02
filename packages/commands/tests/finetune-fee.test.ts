import { httpTransport, type Settings } from "bailian-cli-core";
import { expect, test } from "vite-plus/test";
import { computeActualFee } from "../src/commands/finetune/fee.ts";

const SETTINGS: Settings = {
  output: "json",
  outputExplicit: true,
  timeout: 30,
  watermark: true,
  verbose: false,
  quiet: true,
  dryRun: false,
  telemetry: false,
};

test("computeActualFee forwards verbose settings to the gateway", async () => {
  const originalFetch = httpTransport.fetch;
  const originalWrite = process.stderr.write.bind(process.stderr);
  let stderr = "";
  const responseBody = {
    data: {
      success: true,
      DataV2: {
        data: {
          data: {
            list: [
              {
                items: [
                  {
                    model: "qwen3-8b",
                    prices: [{ type: "ft", price: 2, priceUnit: "每百万tokens" }],
                  },
                ],
              },
            ],
          },
        },
      },
    },
  };

  httpTransport.fetch = async () =>
    new Response(JSON.stringify(responseBody), {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "application/json" },
    });
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;

  try {
    const fee = await computeActualFee({ ...SETTINGS, verbose: true }, "qwen3-8b", 1_000_000);
    expect(fee).toEqual({ cost: 2, unitPrice: 2, priceUnit: "每百万tokens" });
  } finally {
    httpTransport.fetch = originalFetch;
    process.stderr.write = originalWrite;
  }

  const lines = stderr.trim().split("\n");
  expect(lines).toHaveLength(2);
  for (const line of lines) {
    expect(JSON.parse(line)).toHaveProperty("debug");
  }
  expect(JSON.parse(lines[0]!).debug).toMatchObject({ type: "request", method: "POST" });
  expect(JSON.parse(lines[1]!).debug).toMatchObject({ type: "response", status: 200 });
  expect(JSON.parse(lines[0]!).debug).not.toHaveProperty("payload");
});

test("computeActualFee hides gateway diagnostics when verbose is disabled", async () => {
  const originalFetch = httpTransport.fetch;
  const originalWrite = process.stderr.write.bind(process.stderr);
  let stderr = "";

  httpTransport.fetch = async () =>
    new Response(JSON.stringify({ data: { success: true, DataV2: { data: { data: {} } } } }), {
      status: 200,
      statusText: "OK",
    });
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;

  try {
    await computeActualFee(SETTINGS, "qwen3-8b", 1_000_000);
  } finally {
    httpTransport.fetch = originalFetch;
    process.stderr.write = originalWrite;
  }

  expect(stderr).toBe("");
});
