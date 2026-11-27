import { describe, expect, test } from "vite-plus/test";
import { buildOssMountDataset, isOssMountToken, parseOssMountUri } from "../src/index.ts";

describe("fine-tune OSS mount entry", () => {
  test("isOssMountToken only matches the oss scheme", () => {
    expect(isOssMountToken("oss://bucket/key.jsonl")).toBe(true);
    expect(isOssMountToken("OSS://bucket/key.jsonl")).toBe(true);
    expect(isOssMountToken("file-aaa")).toBe(false);
    expect(isOssMountToken("./train.jsonl")).toBe(false);
    expect(isOssMountToken("https://bucket/key.jsonl")).toBe(false);
  });

  test("parseOssMountUri splits the bucket from the object key at the first slash", () => {
    expect(parseOssMountUri("oss://my-bucket/datasets/train/data.jsonl")).toEqual({
      valid: true,
      location: { bucket: "my-bucket", filePath: "datasets/train/data.jsonl" },
    });
    // The key is passed through untouched: decoding and existence are the service's call.
    expect(parseOssMountUri("oss://my-bucket/a%20b/c.jsonl")).toEqual({
      valid: true,
      location: { bucket: "my-bucket", filePath: "a%20b/c.jsonl" },
    });
    expect(parseOssMountUri("oss://my-bucket/data.jsonl")).toEqual({
      valid: true,
      location: { bucket: "my-bucket", filePath: "data.jsonl" },
    });
  });

  test.each([
    ["no bucket", "oss:///data.jsonl", /missing the bucket/],
    ["neither bucket nor key", "oss://", /missing the bucket/],
    ["no object key", "oss://my-bucket", /missing the object key/],
    ["empty object key", "oss://my-bucket/", /missing the object key/],
    ["zip cannot be mounted", "oss://my-bucket/train.zip", /zip file/],
    ["zip is case-insensitive", "oss://my-bucket/train.ZIP", /zip file/],
  ])("parseOssMountUri rejects %s in both languages", (_case, token, english) => {
    const parsed = parseOssMountUri(token);
    expect(parsed.valid).toBe(false);
    if (parsed.valid) throw new Error("expected an invalid entry");
    expect(parsed.reason["en-US"]).toMatch(english);
    expect(parsed.reason["zh-CN"]).not.toEqual(parsed.reason["en-US"]);
  });

  test("buildOssMountDataset maps the location onto mount_storage without a slot", () => {
    expect(
      buildOssMountDataset(
        { bucket: "my-bucket", filePath: "datasets/train/data.jsonl" },
        "ap-southeast-1",
      ),
    ).toEqual({
      data_source_type: "oss_mount",
      mount_storage: {
        region: "ap-southeast-1",
        bucket: "my-bucket",
        file_path: "datasets/train/data.jsonl",
      },
    });
  });
});
