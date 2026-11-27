import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import files, {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { createOAuthSecretStore } from "../src/auth/secure-store.ts";
import { BailianError } from "../src/errors/base.ts";
import { ExitCode } from "../src/errors/codes.ts";

const SESSION = {
  refreshToken: "fixture-refresh-secret",
  accessToken: "fixture-oauth-secret",
  sts: { accessKeySecret: "fixture-sts-secret", securityToken: "fixture-session-secret" },
  consoleTokens: { example: { token: "fixture-console-secret" } },
  unicode: '凭据文件\n"quoted"\\value',
};
const PAYLOAD = JSON.stringify(SESSION);
const UPDATED = { ...SESSION, refreshToken: "fixture-rotated-refresh-secret" };
const execFileAsync = promisify(execFile);
const unix = process.platform !== "win32";

let configDirectory: string;
beforeEach(async () => {
  configDirectory = await mkdtemp(join(tmpdir(), "bl-oauth-store-"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  await rm(configDirectory, { recursive: true, force: true });
});

const cacheDirectory = () => join(configDirectory, "oauth");
const sessionPath = (reference: string) => join(cacheDirectory(), `${reference}.json`);
const fileMode = (status: Stats) => status.mode & 0o777;

async function expectSafeFailure(operation: Promise<unknown>, forbidden = SESSION.refreshToken) {
  const error: unknown = await operation.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(BailianError);
  const failure = error as BailianError;
  expect(failure.exitCode).toBe(ExitCode.GENERAL);
  expect(failure.message).toMatch(/[\u4e00-\u9fff]/);
  expect(failure.hint).toMatch(/[\u4e00-\u9fff]/);
  expect(failure.cause).toBeUndefined();
  expect(JSON.stringify(failure.toJSON())).not.toContain(forbidden);
}

test("writes a private, plaintext session file without touching the main configuration", async () => {
  const reference = randomUUID();
  const store = createOAuthSecretStore(configDirectory);
  const configPath = join(configDirectory, "config.json");
  await writeFile(configPath, '{"language":"en-US"}', { mode: 0o600 });
  await store.write(reference, PAYLOAD);
  expect(await store.read(reference.toUpperCase())).toBe(PAYLOAD);
  expect(JSON.parse(await readFile(sessionPath(reference), "utf8"))).toEqual({
    reference,
    session: SESSION,
  });
  expect(await readFile(configPath, "utf8")).toBe('{"language":"en-US"}');
  expect(await readdir(cacheDirectory())).toEqual([`${reference}.json`]);
  if (unix) {
    expect(fileMode(await stat(cacheDirectory()))).toBe(0o700);
    expect(fileMode(await stat(sessionPath(reference)))).toBe(0o600);
  }
});

test("reads the same session in a fresh Node process without a credential service", async () => {
  const reference = randomUUID();
  await createOAuthSecretStore(configDirectory).write(reference, PAYLOAD);
  const modulePath = new URL("../src/auth/secure-store.ts", import.meta.url).href;
  // A fresh process verifies persistence without shared memory or putting the payload in argv.
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      `import { createOAuthSecretStore } from ${JSON.stringify(modulePath)};
const [directory, reference] = process.argv.slice(1);
const session = JSON.parse(await createOAuthSecretStore(directory).read(reference));
process.stdout.write(String(session.refreshToken === 'fixture-refresh-secret' && session.sts.securityToken === 'fixture-session-secret'));`,
      configDirectory,
      reference,
    ],
    { timeout: 12_000, env: { SystemRoot: process.env.SystemRoot, TEMP: configDirectory } },
  );
  expect(stdout).toBe("true");
  expect(stderr).not.toContain(SESSION.refreshToken);
}, 15_000);

test("missing reads and deletes are not writes", async () => {
  const reference = randomUUID();
  const store = createOAuthSecretStore(configDirectory);
  expect(await store.read(reference)).toBeUndefined();
  await store.remove(reference);
  expect(await readdir(configDirectory)).toEqual([]);
});

test.each([
  "../escape",
  "/tmp/escape",
  "C:\\escape",
  "not-a-uuid",
  "",
  "01234567-89ab-cdef-0123-456789abcdef\n",
  "01234567-89ab-cdef-0123-456789abcdef/../escape",
  "01234567-89ab-cdef-0123-456789abcdef\\escape",
  "01234567-89ab-cdef-0123-456789abcdef\0",
  "%2e%2e%2f01234567-89ab-cdef-0123-456789abcdef",
])("rejects unsafe reference %j without side effects", async (reference) => {
  const store = createOAuthSecretStore(configDirectory);
  await expectSafeFailure(store.read(reference));
  await expectSafeFailure(store.write(reference, PAYLOAD));
  await expectSafeFailure(store.remove(reference));
  expect(await readdir(configDirectory)).toEqual([]);
});

test("rejects corrupt or legacy encrypted files without decoding or overwriting them", async () => {
  const reference = randomUUID();
  const store = createOAuthSecretStore(configDirectory);
  await store.write(reference, PAYLOAD);
  const enclosingContents = [
    "not-json",
    "null",
    "[]",
    JSON.stringify({ reference, session: [SESSION] }),
    JSON.stringify({ version: 1, algorithm: "aes-256-gcm", ciphertext: "fixture-old-cache" }),
  ];
  for (const raw of enclosingContents) {
    await writeFile(sessionPath(reference), raw);
    await expectSafeFailure(store.read(reference));
    await expectSafeFailure(store.write(reference, PAYLOAD));
    expect(await readFile(sessionPath(reference), "utf8")).toBe(raw);
  }
  await store.remove(reference);
  expect(await store.read(reference)).toBeUndefined();
});

test("rejects a file copied to a different session reference", async () => {
  const source = randomUUID();
  const destination = randomUUID();
  const store = createOAuthSecretStore(configDirectory);
  await store.write(source, PAYLOAD);
  await writeFile(sessionPath(destination), await readFile(sessionPath(source)), { mode: 0o600 });
  await expectSafeFailure(store.read(destination));
  expect(await store.read(source)).toBe(PAYLOAD);
});

test("removes only the selected session and is idempotent", async () => {
  const removed = randomUUID();
  const retained = randomUUID();
  const store = createOAuthSecretStore(configDirectory);
  await store.write(removed, PAYLOAD);
  await store.write(retained, PAYLOAD);
  await store.remove(removed);
  await store.remove(removed);
  expect(await store.read(removed)).toBeUndefined();
  expect(await store.read(retained)).toBe(PAYLOAD);
  expect(await readdir(cacheDirectory())).toEqual([`${retained}.json`]);
});

test.skipIf(!unix)(
  "refuses unsafe Unix permissions without relaxing or overwriting files",
  async () => {
    const reference = randomUUID();
    const store = createOAuthSecretStore(configDirectory);
    await chmod(configDirectory, 0o777);
    await expectSafeFailure(store.write(reference, PAYLOAD));
    expect(await readdir(configDirectory)).toEqual([]);
    await chmod(configDirectory, 0o700);
    await mkdir(cacheDirectory(), { mode: 0o755 });
    await chmod(cacheDirectory(), 0o755);
    await expectSafeFailure(store.write(reference, PAYLOAD));
    expect(fileMode(await stat(cacheDirectory()))).toBe(0o755);
    await chmod(cacheDirectory(), 0o700);
    await store.write(reference, PAYLOAD);
    await chmod(sessionPath(reference), 0o644);
    await expectSafeFailure(store.read(reference));
    await expectSafeFailure(store.write(reference, JSON.stringify(UPDATED)));
    await expectSafeFailure(store.remove(reference));
    expect(fileMode(await stat(sessionPath(reference)))).toBe(0o644);
  },
);

test("refuses a linked cache directory without touching its target", async () => {
  const reference = randomUUID();
  const outside = join(configDirectory, "outside");
  await mkdir(outside, { mode: 0o700 });
  await symlink(outside, cacheDirectory(), "junction");
  const store = createOAuthSecretStore(configDirectory);
  await expectSafeFailure(store.read(reference));
  await expectSafeFailure(store.write(reference, PAYLOAD));
  await expectSafeFailure(store.remove(reference));
  expect(await readdir(outside)).toEqual([]);
});

test.each(unix ? ["symlink", "hardlink"] : ["hardlink"])(
  "refuses a %s session file before read, write, or deletion",
  async (kind) => {
    const reference = randomUUID();
    const outside = join(configDirectory, "outside.json");
    await mkdir(cacheDirectory(), { mode: 0o700 });
    await writeFile(outside, "sentinel", { mode: 0o600 });
    await (kind === "hardlink" ? link : symlink)(outside, sessionPath(reference));
    const store = createOAuthSecretStore(configDirectory);
    await expectSafeFailure(store.read(reference));
    await expectSafeFailure(store.write(reference, PAYLOAD));
    await expectSafeFailure(store.remove(reference));
    expect(await readFile(outside, "utf8")).toBe("sentinel");
    expect(await readdir(cacheDirectory())).toEqual([`${reference}.json`]);
  },
);

test("syncs exclusive private temporaries before rename and rolls back a failed rename", async () => {
  const reference = randomUUID();
  const store = createOAuthSecretStore(configDirectory);
  const actualOpen = files.open;
  const actualRename = files.rename;
  const temporaries: string[] = [];
  const synced = new Set<string>();
  let failRename = false;
  vi.spyOn(files, "open").mockImplementation(async (path, flags, mode) => {
    const handle = await actualOpen(path, flags, mode);
    if (typeof path === "string" && path.endsWith(".tmp")) {
      temporaries.push(path);
      expect(Number(flags) & constants.O_EXCL).toBe(constants.O_EXCL);
      expect(mode).toBe(0o600);
      const actualSync = handle.sync.bind(handle);
      vi.spyOn(handle, "sync").mockImplementation(async () => {
        if (unix) expect(fileMode(await handle.stat())).toBe(0o600);
        expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
          reference,
          session: failRename ? UPDATED : SESSION,
        });
        await actualSync();
        synced.add(path);
      });
    }
    return handle;
  });
  vi.spyOn(files, "rename").mockImplementation(async (source, destination) => {
    expect(synced.delete(String(source))).toBe(true);
    if (failRename) throw new Error("fixture-filesystem-secret-error");
    await actualRename(source, destination);
  });
  syncBuiltinESMExports();
  await store.write(reference, PAYLOAD);
  failRename = true;
  await expectSafeFailure(
    store.write(reference, JSON.stringify(UPDATED)),
    "fixture-filesystem-secret-error",
  );
  expect(await store.read(reference)).toBe(PAYLOAD);
  expect(new Set(temporaries).size).toBe(2);
  expect(await readdir(cacheDirectory())).toEqual([`${reference}.json`]);
});

test("replaces the target in one step with a complete new session", async () => {
  const reference = randomUUID();
  const store = createOAuthSecretStore(configDirectory);
  await store.write(reference, PAYLOAD);
  const actualRename = files.rename;
  vi.spyOn(files, "rename").mockImplementation(async (source, destination) => {
    expect(await store.read(reference)).toBe(PAYLOAD);
    await actualRename(source, destination);
    expect(await store.read(reference)).toBe(JSON.stringify(UPDATED));
  });
  syncBuiltinESMExports();
  await store.write(reference, JSON.stringify(UPDATED));
  expect(await readdir(cacheDirectory())).toEqual([`${reference}.json`]);
});
