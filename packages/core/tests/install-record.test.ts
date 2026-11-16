import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { installAttributionFromUnknown, readInstallAttribution } from "../src/install/record.ts";

const freshRecord = {
  version: 1,
  first_installed_at: "2020-01-02T03:04:05Z",
  observed_at: "2020-01-02T03:04:05Z",
  first_version: "1.2.3",
  install_channel: "binary",
};

function withConfigDir(run: (configDir: string) => void): void {
  const saved = process.env.BAILIAN_CONFIG_DIR;
  const configDir = mkdtempSync(join(tmpdir(), "bl-install-record-"));
  process.env.BAILIAN_CONFIG_DIR = configDir;
  try {
    run(configDir);
  } finally {
    if (saved === undefined) delete process.env.BAILIAN_CONFIG_DIR;
    else process.env.BAILIAN_CONFIG_DIR = saved;
    rmSync(configDir, { recursive: true, force: true });
  }
}

test("reads a dated install record without treating it as the current time", () => {
  expect(installAttributionFromUnknown(freshRecord)).toEqual({
    installChannel: "binary",
    firstInstalledAt: "2020-01-02T03:04:05Z",
  });
});

test("reads an already-used machine without an install time", () => {
  expect(
    installAttributionFromUnknown({
      version: 1,
      observed_at: "2020-01-02T03:04:05.000Z",
      install_channel: "npm",
    }),
  ).toEqual({
    installChannel: "npm",
  });
});

test("rejects a dated record that is missing first_version", () => {
  expect(
    installAttributionFromUnknown({
      version: 1,
      first_installed_at: "2020-01-02T03:04:05Z",
      observed_at: "2020-01-02T03:04:05Z",
      install_channel: "binary",
    }),
  ).toBeUndefined();
});

test("rejects unrecognized install records", () => {
  expect(installAttributionFromUnknown(null)).toBeUndefined();
  expect(installAttributionFromUnknown({ version: 2 })).toBeUndefined();
  expect(
    installAttributionFromUnknown({ ...freshRecord, first_installed_at: "today" }),
  ).toBeUndefined();
  expect(
    installAttributionFromUnknown({ ...freshRecord, install_channel: "brew" }),
  ).toBeUndefined();
});

test("a missing install.json stays missing", () => {
  withConfigDir((configDir) => {
    expect(readInstallAttribution()).toBeUndefined();
    expect(statSync(configDir).isDirectory()).toBe(true);
    expect(() => statSync(join(configDir, "install.json"))).toThrow();
  });
});

test("a broken install.json is not repaired", () => {
  withConfigDir((configDir) => {
    const recordPath = join(configDir, "install.json");
    writeFileSync(recordPath, "{");
    chmodSync(recordPath, 0o600);
    expect(readInstallAttribution()).toBeUndefined();
    expect(readFileSync(recordPath, "utf8")).toBe("{");
  });
});

test("reads the on-disk record from BAILIAN_CONFIG_DIR", () => {
  withConfigDir((configDir) => {
    writeFileSync(join(configDir, "install.json"), `${JSON.stringify(freshRecord, null, 2)}\n`);
    expect(readInstallAttribution()).toEqual({
      installChannel: "binary",
      firstInstalledAt: "2020-01-02T03:04:05Z",
    });
  });
});
