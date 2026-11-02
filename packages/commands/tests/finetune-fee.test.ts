import { httpTransport, type HttpDeps, type Settings } from "bailian-cli-core";
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

test("computeActualFee forwards diagnostics to the gateway", async () => {
  const originalFetch = httpTransport.fetch;
  const diagnostics: unknown[] = [];
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

  try {
    const fee = await computeActualFee(SETTINGS, "qwen3-8b", 1_000_000, {
      debug: (diagnostic) => diagnostics.push(diagnostic),
    } satisfies Pick<HttpDeps, "debug">);
    expect(fee).toEqual({ cost: 2, unitPrice: 2, priceUnit: "每百万tokens" });
  } finally {
    httpTransport.fetch = originalFetch;
  }

  expect(diagnostics).toHaveLength(2);
  expect(diagnostics).toMatchObject([
    {
      details: {
        method: "POST",
        api: "zeldaHttp.dashscopeModel./zelda/api/v1/modelCenter/listFoundationModels",
      },
    },
    { details: { status: 200 } },
  ]);
  expect(JSON.stringify(diagnostics)).not.toContain("responseBody");
});

test("computeActualFee omits gateway diagnostics when none are injected", async () => {
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
