import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

const runtimeMocks = vi.hoisted(() => ({
  performBinaryUpdate: vi.fn(),
}));

const childProcessMocks = vi.hoisted(() => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock("bailian-cli-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("bailian-cli-runtime")>();
  return { ...actual, performBinaryUpdate: runtimeMocks.performBinaryUpdate };
});

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return {
    ...actual,
    execSync: childProcessMocks.execSync,
    spawnSync: childProcessMocks.spawnSync,
  };
});

import { buildSettings } from "bailian-cli-core";
import { withCommandOutput } from "./output/command-context.ts";

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
  childProcessMocks.spawnSync.mockReturnValue({
    stdout: Buffer.from('{"skills":[]}'),
    stderr: Buffer.alloc(0),
    status: 0,
    signal: null,
  });
});

afterEach(() => {
  if (previousConfigDir === undefined) delete process.env.BAILIAN_CONFIG_DIR;
  else process.env.BAILIAN_CONFIG_DIR = previousConfigDir;
  if (previousInstallMethod === undefined) delete process.env.BAILIAN_INSTALL_METHOD;
  else process.env.BAILIAN_INSTALL_METHOD = previousInstallMethod;
  rmSync(configDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const identity = {
  binName: "bl",
  clientName: "bailian-cli",
  npmPackage: "bailian-cli",
  version: "1.14.3",
};

function expectSkillUpdateNotInit(): void {
  expect(childProcessMocks.spawnSync).toHaveBeenCalledWith("bl skill update --output json", {
    shell: true,
    stdio: ["inherit", "pipe", "pipe"],
  });
  expect(
    childProcessMocks.spawnSync.mock.calls.some((call) => String(call[0]).includes("skill init")),
  ).toBe(false);
}

test("binary bl update refreshes installed skills and does not run skill init", async () => {
  await updateCommand.run(
    withCommandOutput({
      identity,
      flags: { to: "1.15.0" },
      settings: buildSettings({ flags: {}, file: {}, env: {} }),
    }) as never,
  );

  expect(runtimeMocks.performBinaryUpdate).toHaveBeenCalledWith("1.15.0");
  expectSkillUpdateNotInit();
});

test("npm bl update refreshes installed skills and does not run skill init", async () => {
  process.env.BAILIAN_INSTALL_METHOD = "npm";

  await updateCommand.run(
    withCommandOutput({
      identity,
      flags: { to: "1.15.0" },
      settings: buildSettings({ flags: {}, file: {}, env: {} }),
    }) as never,
  );

  expect(childProcessMocks.spawnSync).toHaveBeenCalledWith("npm install -g bailian-cli@1.15.0", {
    shell: true,
    stdio: ["inherit", "pipe", "pipe"],
  });
  expectSkillUpdateNotInit();
});

test.each([false, true])(
  "binary JSON update retains nested skill result in quiet=%s",
  async (quiet) => {
    let stdout = "",
      stderr = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
    childProcessMocks.spawnSync.mockReturnValue({
      stdout: Buffer.from(
        JSON.stringify({
          registry: "https://fixture.invalid",
          skills: [
            { name: "bailian-fixture", status: "up-to-date", retained: [false, 0, null, []] },
          ],
        }),
      ),
      stderr: Buffer.alloc(0),
      status: 0,
      signal: null,
    });
    await updateCommand.run(
      withCommandOutput({
        identity,
        flags: { to: "1.15.0" },
        settings: buildSettings({ flags: { output: "json", quiet }, file: {}, env: {} }),
      }) as never,
    );
    expect(JSON.parse(stdout)).toMatchObject({
      status: "updated",
      current_version: "1.14.3",
      version: "1.15.0",
      skill_update: {
        status: "updated",
        result: { skills: [{ name: "bailian-fixture", retained: [false, 0, null, []] }] },
      },
    });
    expect(stderr).toBe("");
    expectSkillUpdateNotInit();
  },
);
test("failed nested skill update preserves its partial report and JSONL warning in quiet", async () => {
  let stdout = "",
    stderr = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  childProcessMocks.spawnSync.mockReturnValue({
    status: 1,
    signal: null,
    stderr: Buffer.from(
      JSON.stringify({
        error: {
          code: 1,
          message: "original child failure",
          request_id: "child-request",
          raw_response: "RAW_BODY_CANARY",
        },
      }) + "\n",
    ),
    stdout: Buffer.from(
      JSON.stringify({
        skills: [{ name: "bailian-fixture", status: "failed", reason: "fixture failure" }],
      }),
    ),
  });
  await updateCommand.run(
    withCommandOutput({
      identity,
      flags: { to: "1.15.0" },
      settings: buildSettings({ flags: { output: "json", quiet: true }, file: {}, env: {} }),
    }) as never,
  );
  expect(JSON.parse(stdout)).toMatchObject({
    status: "updated",
    skill_update: {
      status: "skipped",
      result: { skills: [{ status: "failed", reason: "fixture failure" }] },
    },
  });
  expect(JSON.parse(stderr)).toMatchObject({
    warning: {
      code: "SKILL_UPDATE_SKIPPED",
      details: {
        exit_code: 1,
        error: { code: 1, message: "original child failure", request_id: "child-request" },
      },
    },
  });
  expect(stderr).not.toContain("RAW_BODY_CANARY");
});
test("nested JSON warnings are re-emitted without raw stderr even in quiet", async () => {
  let stdout = "",
    stderr = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  childProcessMocks.spawnSync.mockReturnValue({
    status: 0,
    signal: null,
    stdout: Buffer.from('{"skills":[]}'),
    stderr: Buffer.from(
      JSON.stringify({
        warning: {
          code: "CHILD_WARNING",
          message: "fixture warning",
          details: { api_key: "child-secret" },
        },
      }) + "\n",
    ),
  });
  await updateCommand.run(
    withCommandOutput({
      identity,
      flags: { to: "1.15.0" },
      settings: buildSettings({ flags: { output: "json", quiet: true }, file: {}, env: {} }),
    }) as never,
  );
  expect(JSON.parse(stdout)).toMatchObject({ status: "updated" });
  expect(JSON.parse(stderr)).toMatchObject({ warning: { code: "CHILD_WARNING" } });
  expect(stderr).not.toContain("child-secret");
});
