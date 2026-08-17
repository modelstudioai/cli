import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

const runtimeMocks = vi.hoisted(() => ({
  performBinaryUpdate: vi.fn(),
}));

const childProcessMocks = vi.hoisted(() => ({
  execSync: vi.fn(),
}));

vi.mock("bailian-cli-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("bailian-cli-runtime")>();
  return { ...actual, performBinaryUpdate: runtimeMocks.performBinaryUpdate };
});

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, execSync: childProcessMocks.execSync };
});

import updateCommand from "../src/commands/update.ts";

let configDir: string;
let previousConfigDir: string | undefined;
let previousInstallMethod: string | undefined;

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), "bl-update-binary-"));
  previousConfigDir = process.env.BAILIAN_CONFIG_DIR;
  previousInstallMethod = process.env.BAILIAN_INSTALL_METHOD;
  process.env.BAILIAN_CONFIG_DIR = configDir;
  process.env.BAILIAN_INSTALL_METHOD = "binary";
  runtimeMocks.performBinaryUpdate.mockResolvedValue("1.15.0");
});

afterEach(() => {
  if (previousConfigDir === undefined) delete process.env.BAILIAN_CONFIG_DIR;
  else process.env.BAILIAN_CONFIG_DIR = previousConfigDir;
  if (previousInstallMethod === undefined) delete process.env.BAILIAN_INSTALL_METHOD;
  else process.env.BAILIAN_INSTALL_METHOD = previousInstallMethod;
  rmSync(configDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

test("binary bl update syncs bailian skills after the CLI update succeeds", async () => {
  await updateCommand.run({
    identity: {
      binName: "bl",
      clientName: "bailian-cli",
      npmPackage: "bailian-cli",
      version: "1.14.3",
    },
    flags: { to: "1.15.0" },
    settings: {},
  } as never);

  expect(runtimeMocks.performBinaryUpdate).toHaveBeenCalledWith("1.15.0");
  expect(childProcessMocks.execSync).toHaveBeenCalledWith("bl skill init", { stdio: "inherit" });
});
