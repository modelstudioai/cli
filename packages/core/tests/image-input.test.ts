import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { Client } from "../src/client/client.ts";
import { imageFileToDataUri, redactDataUri } from "../src/files/upload.ts";
import type { Settings } from "../src/config/schema.ts";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

function makeImage(extension = ".png", content = Buffer.from([1, 2, 3, 4])): string {
  const tempDir = mkdtempSync(join(tmpdir(), "bailian-image-input-"));
  tempDirs.push(tempDir);
  const filePath = join(tempDir, `input${extension}`);
  writeFileSync(filePath, content);
  return filePath;
}

function makeSettings(configName?: string): Settings {
  return {
    configName,
    output: "json",
    outputExplicit: false,
    timeout: 30,
    verbose: false,
    quiet: true,
    dryRun: false,
    telemetry: false,
  };
}

function makeClient(baseUrl: string, configName?: string): Client {
  return new Client({
    identity: {
      binName: "bl",
      version: "test",
      npmPackage: "bailian-cli",
      clientName: "bailian-cli-test",
    },
    settings: makeSettings(configName),
    baseUrl,
  });
}

describe("Token Plan image input compatibility", () => {
  test("encodes supported local images and redacts previews", () => {
    const imagePath = makeImage(".png");
    const dataUri = imageFileToDataUri(imagePath);

    expect(dataUri).toBe("data:image/png;base64,AQIDBA==");
    expect(redactDataUri(dataUri)).toBe("data:image/png;base64,<omitted>");
  });

  test("rejects files whose image MIME type cannot be inferred", () => {
    const imagePath = makeImage(".unknown");
    expect(() => imageFileToDataUri(imagePath)).toThrow(/Unsupported image format/);
  });

  test("uses ordinary upload behavior for a non-Token-Plan endpoint regardless of Profile name", () => {
    const imagePath = makeImage(".webp");
    const client = makeClient("https://proxy.example.com/bailian", "token-plan");

    expect(() => client.resolveImageInput(imagePath, "happyhorse-1.1-i2v")).toThrow(
      /model-domain API key/,
    );
  });

  test("uses Data URI for an official Token Plan endpoint under any profile name", async () => {
    const imagePath = makeImage(".jpg");
    const client = makeClient("https://token-plan.ap-southeast-1.maas.aliyuncs.com", "custom-plan");

    await expect(client.resolveImageInput(imagePath, "wan2.7-image")).resolves.toMatch(
      /^data:image\/jpeg;base64,/,
    );
  });

  test("ordinary endpoints retain the existing upload path", () => {
    const imagePath = makeImage(".png");
    const client = makeClient("https://dashscope.aliyuncs.com", "default");

    expect(() => client.resolveImageInput(imagePath, "wan2.7-image")).toThrow(
      /model-domain API key/,
    );
  });
});
