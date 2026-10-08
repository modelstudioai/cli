import { describe, expect, it } from "vite-plus/test";
import { memoProjectionDefinition } from "../src/projection.ts";

describe("memo session projection", () => {
  it("accepts its initial sentinel state", () => {
    const initial = memoProjectionDefinition.init();
    expect(memoProjectionDefinition.stateSchema.parse(initial)).toEqual(initial);
  });

  it("derives the real recall message sequence from user/message", () => {
    const next = memoProjectionDefinition.apply(memoProjectionDefinition.init(), {
      type: "user/message",
      seq: 7,
      data: {
        source: {
          kind: "bailian-memo-recall",
          turn: 3,
          digest: "digest-1",
        },
      },
    });

    expect(next).toMatchObject({
      lastRecallTurn: 3,
      lastRecallSeq: 7,
      lastRecallDigest: "digest-1",
    });
  });
});
