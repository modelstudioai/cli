import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, expect, test } from "vite-plus/test";
import type { Identity, Settings } from "../src/config/schema.ts";
import { UID_FILE_NAME, ensureUid, getUidPath, loadUid } from "../src/telemetry/uid.ts";
import { trackCommandExecution } from "../src/telemetry/tracker.ts";
import { enterIsolatedHome, type IsolatedHomeHandle } from "./helpers/isolation.ts";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
let iso: IsolatedHomeHandle;

beforeEach(() => {
  iso = enterIsolatedHome();
});
afterEach(() => iso.restore());

function uidModuleUrl(): string {
  return pathToFileURL(fileURLToPath(new URL("../src/telemetry/uid.ts", import.meta.url))).href;
}

async function runEnsureUidChildren(count: number): Promise<string[]> {
  const script = `
    import { ensureUid } from ${JSON.stringify(uidModuleUrl())};
    process.stdout.write(String(ensureUid() ?? ""));
  `;
  const tsxLoader = import.meta.resolve("tsx");
  const run = () =>
    new Promise<string>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["--import", tsxLoader, "--input-type=module", "-e", script],
        {
          env: { ...process.env },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let out = "";
      let err = "";
      child.stdout.on("data", (chunk: Buffer) => {
        out += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        err += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve(out);
        else reject(new Error(`child exited ${code}: ${err || out}`));
      });
    });
  return Promise.all(Array.from({ length: count }, () => run()));
}

test("first call writes a UUID v4 and later calls return the same value", () => {
  expect(loadUid()).toBeUndefined();
  const id = ensureUid();
  expect(id).toMatch(UUID_V4);
  expect(readFileSync(getUidPath(), "utf8")).toBe(`${id}\n`);
  expect(ensureUid()).toBe(id);
  expect(loadUid()).toBe(id);
});

test("uid path follows BAILIAN_CONFIG_DIR", () => {
  ensureUid();
  expect(getUidPath()).toBe(join(iso.configDir, UID_FILE_NAME));
});

test.skipIf(process.platform === "win32")("file mode is 0600", () => {
  ensureUid();
  expect(statSync(getUidPath()).mode & 0o777).toBe(0o600);
});

test("creates the config directory when missing", () => {
  process.env.BAILIAN_CONFIG_DIR = join(iso.home, "nested", "cfg");
  expect(ensureUid()).toMatch(UUID_V4);
});

test("rebuilds when content is invalid", () => {
  writeFileSync(getUidPath(), "not-a-uuid\n");
  const id = ensureUid();
  expect(id).toMatch(UUID_V4);
  expect(readFileSync(getUidPath(), "utf8").trim()).toBe(id);
});

test("accepts upper-case or padded UUID without rewriting the file", () => {
  const upper = "  0F8FAD5B-D9CB-469F-A165-70867728950E \n";
  writeFileSync(getUidPath(), upper);
  expect(ensureUid()).toBe("0f8fad5b-d9cb-469f-a165-70867728950e");
  expect(readFileSync(getUidPath(), "utf8")).toBe(upper);
});

test("keeps an ID already published by another process", () => {
  const existing = "0f8fad5b-d9cb-469f-a165-70867728950e";
  writeFileSync(getUidPath(), `${existing}\n`);
  expect(ensureUid()).toBe(existing);
});

test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
  "returns undefined without throwing when the directory is not writable",
  () => {
    chmodSync(iso.configDir, 0o500);
    try {
      expect(ensureUid()).toBeUndefined();
    } finally {
      chmodSync(iso.configDir, 0o700);
    }
  },
);

test.skipIf(process.platform === "win32")(
  "does not overwrite a path occupied by a directory; returns undefined",
  () => {
    mkdirSync(getUidPath());
    expect(ensureUid()).toBeUndefined();
    expect(statSync(getUidPath()).isDirectory()).toBe(true);
  },
);

test("leaves no temporary files behind", () => {
  ensureUid();
  const names = readdirSync(iso.configDir);
  expect(names.filter((name) => name.endsWith(".tmp"))).toEqual([]);
  expect(names).toContain(UID_FILE_NAME);
});

test("telemetry disabled does not create the uid file", async () => {
  const identity: Identity = {
    binName: "bl",
    version: "0.0.0-test",
    clientName: "bailian-cli-test",
    npmPackage: "bailian-cli",
  };
  await trackCommandExecution(
    {
      identity,
      settings: { telemetry: false } as Settings,
      caller: { callerType: "unknown" },
    },
    ["config", "show"],
    {},
    async () => {},
  );
  expect(existsSync(getUidPath())).toBe(false);
});

test("eight concurrent first runs leave one valid on-disk ID", async () => {
  const ids = await runEnsureUidChildren(8);
  const finalId = readFileSync(getUidPath(), "utf8").trim();
  expect(finalId).toMatch(UUID_V4);
  // Lock-free temp+rename: each process returns its own id; disk keeps the last rename.
  expect(ids.every((id) => UUID_V4.test(id))).toBe(true);
  expect(ids).toContain(finalId);
  expect(readdirSync(iso.configDir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
});

test("eight concurrent repairs of an invalid file leave one valid on-disk ID", async () => {
  writeFileSync(getUidPath(), "not-a-uuid\n");
  const ids = await runEnsureUidChildren(8);
  const finalId = readFileSync(getUidPath(), "utf8").trim();
  expect(finalId).toMatch(UUID_V4);
  expect(ids.every((id) => UUID_V4.test(id))).toBe(true);
  expect(ids).toContain(finalId);
  expect(readdirSync(iso.configDir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
});
