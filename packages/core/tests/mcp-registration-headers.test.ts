import { describe, expect, test } from "vite-plus/test";
import { Client } from "../src/client/client.ts";

describe("Client.bailianMcpRegistrationHeaders", () => {
  test("returns API authorization and CLI channel attribution headers", () => {
    const client = new Client({
      identity: {
        binName: "bl",
        version: "1.18.2",
        npmPackage: "bailian-cli",
        clientName: "bailian-cli-test",
      },
      settings: {
        output: "json",
        outputExplicit: false,
        timeout: 30,
        watermark: true,
        verbose: false,
        quiet: true,
        dryRun: false,
        telemetry: false,
      },
      baseUrl: "https://dashscope.aliyuncs.com",
      apiCred: {
        token: "sk-test",
        baseUrl: "https://dashscope.aliyuncs.com",
        source: "flag",
      },
    });

    expect(client.bailianMcpRegistrationHeaders()).toEqual({
      Authorization: "Bearer sk-test",
      "x-dashscope-openapisource": "BailianCLI",
      "x-dashscope-source-config":
        '{"channel":"bailian-cli","tags":{"t1":"public","t2":"bl","t3":"1.18.2"}}',
    });
  });

  test("requires a model-domain credential", () => {
    const client = new Client({
      identity: {
        binName: "bl",
        version: "test",
        npmPackage: "bailian-cli",
        clientName: "bailian-cli-test",
      },
      settings: {
        output: "json",
        outputExplicit: false,
        timeout: 30,
        watermark: true,
        verbose: false,
        quiet: true,
        dryRun: false,
        telemetry: false,
      },
      baseUrl: "https://dashscope.aliyuncs.com",
    });

    expect(() => client.bailianMcpRegistrationHeaders()).toThrow(/model-domain API key/);
  });
});
