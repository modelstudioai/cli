import { describe, expect, test } from "vite-plus/test";
import { responsesPath } from "../src/index.ts";

describe("Responses API", () => {
  test("uses the OpenAI-compatible Responses endpoint", () => {
    expect(responsesPath()).toBe("/compatible-mode/v1/responses");
  });
});
