import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";
import pkg from "../package.json" with { type: "json" };
import { recordNpmInstall } from "../postinstall.js";

const postinstallPath = fileURLToPath(new URL("../postinstall.js", import.meta.url));

function withInstallEnv(run: (configDir: string) => void): void {
  const savedConfigDir = process.env.BAILIAN_CONFIG_DIR;
  const savedGlobal = process.env.npm_config_global;
  const savedDoNotTrack = process.env.DO_NOT_TRACK;
  const configDir = mkdtempSync(join(tmpdir(), "bl-postinstall-record-"));
  process.env.BAILIAN_CONFIG_DIR = configDir;
  process.env.npm_config_global = "true";
  delete process.env.DO_NOT_TRACK;
  try {
    run(configDir);
  } finally {
    if (savedConfigDir === undefined) delete process.env.BAILIAN_CONFIG_DIR;
    else process.env.BAILIAN_CONFIG_DIR = savedConfigDir;
    if (savedGlobal === undefined) delete process.env.npm_config_global;
    else process.env.npm_config_global = savedGlobal;
    if (savedDoNotTrack === undefined) delete process.env.DO_NOT_TRACK;
    else process.env.DO_NOT_TRACK = savedDoNotTrack;
    chmodSync(configDir, 0o700);
    rmSync(configDir, { recursive: true, force: true });
  }
}

test("global install writes a fresh npm record once", () => {
  withInstallEnv((configDir) => {
    const savedLifecycle = process.env.npm_lifecycle_event;
    process.env.npm_lifecycle_event = "postinstall";
    let launches = 0;
    const launchFirstInstallReport = () => {
      launches += 1;
    };
    try {
      recordNpmInstall({ launchFirstInstallReport });
      const recordPath = join(configDir, "install.json");
      const record = JSON.parse(readFileSync(recordPath, "utf8")) as {
        install_channel: string;
        first_version: string;
        first_installed_at: string;
        observed_at: string;
      };
      expect(record).toMatchObject({
        version: 1,
        install_channel: "npm",
        first_version: pkg.version,
      });
      expect(record).not.toHaveProperty("anchor");
      expect(record.first_installed_at).toBe(record.observed_at);
      expect(statSync(recordPath).mode & 0o777).toBe(0o600);
      expect(launches).toBe(1);

      record.first_installed_at = "2020-01-02T03:04:05.000Z";
      record.observed_at = "2020-01-02T03:04:05.000Z";
      writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
      recordNpmInstall({ launchFirstInstallReport });
      const again = JSON.parse(readFileSync(recordPath, "utf8")) as { first_installed_at: string };
      expect(again.first_installed_at).toBe("2020-01-02T03:04:05.000Z");
      expect(launches).toBe(1);
    } finally {
      if (savedLifecycle === undefined) delete process.env.npm_lifecycle_event;
      else process.env.npm_lifecycle_event = savedLifecycle;
    }
  });
});

test("an existing config directory is not counted as a new install", () => {
  withInstallEnv((configDir) => {
    const savedLifecycle = process.env.npm_lifecycle_event;
    process.env.npm_lifecycle_event = "postinstall";
    let launches = 0;
    try {
      writeFileSync(join(configDir, "install-method"), "binary\n");
      recordNpmInstall({
        launchFirstInstallReport: () => {
          launches += 1;
        },
      });
      const record = JSON.parse(readFileSync(join(configDir, "install.json"), "utf8")) as Record<
        string,
        unknown
      >;
      expect(record.install_channel).toBe("npm");
      expect(record).not.toHaveProperty("anchor");
      expect(record).not.toHaveProperty("first_installed_at");
      expect(launches).toBe(0);
    } finally {
      if (savedLifecycle === undefined) delete process.env.npm_lifecycle_event;
      else process.env.npm_lifecycle_event = savedLifecycle;
    }
  });
});

test("non-global install, opt-out, and a broken file do not create or repair a record", () => {
  withInstallEnv((configDir) => {
    process.env.npm_config_global = "false";
    recordNpmInstall();
    expect(() => statSync(join(configDir, "install.json"))).toThrow();

    process.env.npm_config_global = "true";
    process.env.DO_NOT_TRACK = "1";
    recordNpmInstall();
    expect(() => statSync(join(configDir, "install.json"))).toThrow();

    delete process.env.DO_NOT_TRACK;
    writeFileSync(join(configDir, "install.json"), "{");
    recordNpmInstall();
    expect(readFileSync(join(configDir, "install.json"), "utf8")).toBe("{");
  });
});

test("an unwritable config directory does not throw", () => {
  if (typeof process.getuid === "function" && process.getuid() === 0) return;
  withInstallEnv((configDir) => {
    chmodSync(configDir, 0o500);
    expect(() => recordNpmInstall()).not.toThrow();
    expect(() => statSync(join(configDir, "install.json"))).toThrow();
  });
});

test("wiki download failure still leaves the install record and exits 0", () => {
  const root = mkdtempSync(join(tmpdir(), "bl-postinstall-spawn-"));
  const configDir = join(root, "config");
  mkdirSync(configDir);
  const preloadPath = join(root, "offline.mjs");
  writeFileSync(preloadPath, "globalThis.fetch = async () => { throw new Error('offline'); };\n");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    npm_config_global: "true",
    BAILIAN_CONFIG_DIR: configDir,
  };
  delete env.DO_NOT_TRACK;

  try {
    const result = spawnSync(process.execPath, ["--import", preloadPath, postinstallPath], {
      env,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("wiki data pre-download skipped");
    const record = JSON.parse(readFileSync(join(configDir, "install.json"), "utf8")) as {
      install_channel: string;
      first_installed_at: string;
    };
    expect(record).not.toHaveProperty("origin");
    expect(record.install_channel).toBe("npm");
    expect(record.first_installed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
