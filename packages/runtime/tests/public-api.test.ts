import { expect, test } from "vite-plus/test";
import * as runtimeApi from "../src/index.ts";

test("confirmation orchestration stays internal to createCli", () => {
  expect(runtimeApi).toHaveProperty("confirmDangerousAction");
  expect(runtimeApi).not.toHaveProperty("confirmationStage");
  expect(runtimeApi).not.toHaveProperty("CONFIRMATION_FLAGS");
  expect(runtimeApi).not.toHaveProperty("confirmationFlagDefs");
  expect(runtimeApi).not.toHaveProperty("ConfirmationRequiredError");
  expect(runtimeApi.CommandRegistry.prototype).not.toHaveProperty("localizeText");
});
