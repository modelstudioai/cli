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
import {
  DEVICE_ID_FILE_NAME,
  ensureDeviceId,
  getDeviceIdPath,
  loadDeviceId,
} from "../src/telemetry/device-id.ts";
import { trackCommandExecution } from "../src/telemetry/tracker.ts";
import { enterIsolatedHome, type IsolatedHomeHandle } from "./helpers/isolation.ts";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
let iso: IsolatedHomeHandle;

beforeEach(() => {
  iso = enterIsolatedHome();
});
afterEach(() => iso.restore());

test("first call writes a UUID v4 and later calls return the same value", () => {
  expect(loadDeviceId()).toBeUndefined();
  const id = ensureDeviceId();
  expect(id).toMatch(UUID_V4);
  expect(readFileSync(getDeviceIdPath(), "utf8")).toBe(`${id}\n`);
  expect(ensureDeviceId()).toBe(id);
  expect(loadDeviceId()).toBe(id);
});

test("device id path follows BAILIAN_CONFIG_DIR", () => {
  ensureDeviceId();
  expect(getDeviceIdPath()).toBe(join(iso.configDir, DEVICE_ID_FILE_NAME));
});

test.skipIf(process.platform === "win32")("file mode is 0600", () => {
  ensureDeviceId();
  expect(statSync(getDeviceIdPath()).mode & 0o777).toBe(0o600);
});

test("creates the config directory when missing", () => {
  process.env.BAILIAN_CONFIG_DIR = join(iso.home, "nested", "cfg");
  expect(ensureDeviceId()).toMatch(UUID_V4);
});

test("rebuilds when content is invalid", () => {
  writeFileSync(getDeviceIdPath(), "not-a-uuid\n");
  const id = ensureDeviceId();
  expect(id).toMatch(UUID_V4);
  expect(readFileSync(getDeviceIdPath(), "utf8").trim()).toBe(id);
});

test("accepts upper-case or padded UUID without rewriting the file", () => {
  const upper = "  0F8FAD5B-D9CB-469F-A165-70867728950E \n";
  writeFileSync(getDeviceIdPath(), upper);
  expect(ensureDeviceId()).toBe("0f8fad5b-d9cb-469f-a165-70867728950e");
  expect(readFileSync(getDeviceIdPath(), "utf8")).toBe(upper);
});

test("keeps an ID already published by another process", () => {
  const existing = "0f8fad5b-d9cb-469f-a165-70867728950e";
  writeFileSync(getDeviceIdPath(), `${existing}\n`);
  expect(ensureDeviceId()).toBe(existing);
});

test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
  "returns undefined without throwing when the directory is not writable",
  () => {
    chmodSync(iso.configDir, 0o500);
    try {
      expect(ensureDeviceId()).toBeUndefined();
    } finally {
      chmodSync(iso.configDir, 0o700);
    }
  },
);

test.skipIf(process.platform === "win32")(
  "does not overwrite a path occupied by a directory; returns undefined",
  () => {
    mkdirSync(getDeviceIdPath());
    expect(ensureDeviceId()).toBeUndefined();
    expect(statSync(getDeviceIdPath()).isDirectory()).toBe(true);
  },
);

test("leaves no temporary files behind", () => {
  ensureDeviceId();
  expect(readdirSync(iso.configDir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
});

test("telemetry disabled does not create the device id file", async () => {
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
  expect(existsSync(getDeviceIdPath())).toBe(false);
});

test("eight concurrent first runs converge on one ID", async () => {
  const deviceIdUrl = pathToFileURL(
    fileURLToPath(new URL("../src/telemetry/device-id.ts", import.meta.url)),
  ).href;
  const script = `
    import { ensureDeviceId } from ${JSON.stringify(deviceIdUrl)};
    process.stdout.write(String(ensureDeviceId() ?? ""));
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
  const ids = await Promise.all(Array.from({ length: 8 }, () => run()));
  const finalId = readFileSync(getDeviceIdPath(), "utf8").trim();
  expect(finalId).toMatch(UUID_V4);
  expect(new Set(ids)).toEqual(new Set([finalId]));
});
