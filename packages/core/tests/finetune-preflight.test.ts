import { describe, expect, test } from "vite-plus/test";
import { preflightBatchSizeGate, INSUFFICIENT_SAMPLES_CODE } from "../src/index.ts";

describe("preflightBatchSizeGate", () => {
  test("passes when recordCount exceeds batch_size", () => {
    const r = preflightBatchSizeGate({ recordCount: 9, batchSize: 8 });
    expect(r.ok).toBe(true);
    expect(r.issue).toBeUndefined();
    expect(r.hint).toBeUndefined();
  });

  test("passes at the boundary just above batch_size (9 > 8)", () => {
    expect(preflightBatchSizeGate({ recordCount: 9, batchSize: 8 }).ok).toBe(true);
    // A comfortably-large dataset is fine too.
    expect(preflightBatchSizeGate({ recordCount: 1000, batchSize: 16 }).ok).toBe(true);
  });

  test("fails when recordCount equals batch_size (must be *greater than*)", () => {
    const r = preflightBatchSizeGate({ recordCount: 8, batchSize: 8 });
    expect(r.ok).toBe(false);
    expect(r.issue).toBeDefined();
    expect(r.issue!.severity).toBe("error");
    expect(r.issue!.code).toBe(INSUFFICIENT_SAMPLES_CODE);
    expect(r.issue!.message).toMatch(/not greater than batch_size \(8\)/);
    expect(r.hint).toMatch(/add more data/);
  });

  test("fails when recordCount is below batch_size (the 3-sample / batch-8 case)", () => {
    const r = preflightBatchSizeGate({ recordCount: 3, batchSize: 8 });
    expect(r.ok).toBe(false);
    expect(r.issue!.message).toMatch(/3 sample\(s\)/);
    expect(r.issue!.message).toMatch(/batch_size \(8\)/);
    expect(r.hint).toMatch(/lower --batch-size/);
  });

  test("hint references the 0.9 train split so users leave margin", () => {
    const r = preflightBatchSizeGate({ recordCount: 5, batchSize: 8 });
    expect(r.hint).toMatch(/0\.9 train split/);
  });

  test("honors the effective (clamped) batch size, not a raw sub-minimum", () => {
    // The CLI clamps --batch-size 1 up to 8 before calling; 3 <= 8 still fails.
    const r = preflightBatchSizeGate({ recordCount: 3, batchSize: 8 });
    expect(r.ok).toBe(false);
    expect(r.issue!.message).toMatch(/batch_size \(8\)/);
  });
});
