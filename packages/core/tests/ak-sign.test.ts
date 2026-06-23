import { expect, test } from "vite-plus/test";
import { buildCanonicalQuery } from "../src/client/ak-sign.ts";

test("buildCanonicalQuery flattens arrays as indexed keys", () => {
  expect(
    buildCanonicalQuery({
      WorkspaceId: "ws_1",
      SeatType: "pro",
      AccountIds: ["acc_1", "acc_2"],
    }),
  ).toBe("AccountIds.1=acc_1&AccountIds.2=acc_2&SeatType=pro&WorkspaceId=ws_1");
});

test("buildCanonicalQuery uses single indexed key for one-element arrays", () => {
  expect(
    buildCanonicalQuery({
      AccountIds: ["acc_2bd88814c31743d9aa5833dc16b3b8e0"],
    }),
  ).toBe("AccountIds.1=acc_2bd88814c31743d9aa5833dc16b3b8e0");
});
