import { expect, test } from "vite-plus/test";
import { defineCommand, type CommandPack, type CommandRiskLevel } from "../src/index.ts";

const noopRun = async () => {};

test("high-risk commands keep level and message in one typed object", () => {
  const command = defineCommand({
    description: "danger",
    auth: "none",
    risk: { level: "high", message: "dangerous operation" },
    run: noopRun,
  });
  const pack = {
    "agent dangerous": {
      description: "danger",
      auth: "none",
      risk: { level: "high", message: "dangerous operation" },
      run: noopRun,
    },
  } satisfies CommandPack;

  expect(command.risk).toEqual({ level: "high", message: "dangerous operation" });
  expect(pack["agent dangerous"].risk.level).toBe("high");
});

test("risk types reject flat or incomplete declarations", () => {
  const high = "high" satisfies CommandRiskLevel;
  // @ts-expect-error unsupported levels must be added to CommandRiskLevel first.
  const low = "low" satisfies CommandRiskLevel;

  defineCommand({
    description: "danger",
    auth: "none",
    // @ts-expect-error high-risk metadata requires a message.
    risk: { level: "high" },
    run: noopRun,
  });
  defineCommand({
    description: "danger",
    auth: "none",
    // @ts-expect-error risk metadata is a single object, not a flat level.
    risk: "high",
    run: noopRun,
  });

  expect(high).toBe("high");
  expect(low).toBe("low");
});
