import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { join, resolve, win32 } from "node:path";
import { promisify } from "node:util";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

export interface OAuthSecretStore {
  read(reference: string): Promise<string | undefined>;
  write(reference: string, value: string): Promise<void>;
  remove(reference: string): Promise<void>;
}

const FAILURES = {
  reference: [
    "Invalid OAuth secret reference. / OAuth 凭据文件引用无效。",
    "Use a UUID reference. / 请使用 UUID 引用。",
  ],
  data: [
    "Invalid OAuth session file. / OAuth 会话文件无效。",
    "Sign in again to create a new OAuth session. / 请重新登录以创建新的 OAuth 会话。",
  ],
  file: [
    "OAuth session file access failed. / OAuth 会话文件访问失败。",
    "Use a private directory and regular files (700/600 on Unix, private ACLs on Windows). / 请使用私有目录和普通文件（Unix 700/600，Windows 私有 ACL）。",
  ],
} as const;

function failure(reason: keyof typeof FAILURES): BailianError {
  const [message, hint] = FAILURES[reason];
  return new BailianError(message, ExitCode.GENERAL, hint);
}

function normalizeReference(reference: string): string {
  if (
    typeof reference !== "string" ||
    reference.length !== 36 ||
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(reference)
  ) {
    throw failure("reference");
  }
  return reference.toLowerCase();
}

function parseRecord(raw: string): Record<string, unknown> {
  try {
    const data: unknown = JSON.parse(raw);
    if (data && typeof data === "object" && !Array.isArray(data))
      return data as Record<string, unknown>;
  } catch {
    throw failure("data");
  }
  throw failure("data");
}

function readSession(raw: string, reference: string): string {
  const record = parseRecord(raw);
  if (
    record.reference !== reference ||
    !record.session ||
    typeof record.session !== "object" ||
    Array.isArray(record.session)
  )
    throw failure("data");
  return JSON.stringify(record.session);
}

const isWindows = process.platform === "win32";
const noFollow = isWindows ? 0 : constants.O_NOFOLLOW;
const execFileAsync = promisify(execFile);

function isPrivateFile(status: Stats): boolean {
  return (
    status.isFile() &&
    status.nlink === 1 &&
    (isWindows || ((status.mode & 0o777) === 0o600 && status.uid === process.getuid?.()))
  );
}

async function assertPrivateWindowsAcl(path: string): Promise<void> {
  // Windows chmod cannot remove access granted to other users by an ACL.
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$acl = Get-Acl -LiteralPath $env:BAILIAN_OAUTH_ACL_PATH",
    "$sidType = [Security.Principal.SecurityIdentifier]",
    "$current = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
    "$trusted = @($current, 'S-1-5-18', 'S-1-5-32-544')",
    "if ($trusted -notcontains $acl.GetOwner($sidType).Value) { exit 1 }",
    "$currentAllowed = $false",
    "foreach ($rule in $acl.GetAccessRules($true, $true, $sidType)) {",
    "  if ($rule.AccessControlType -ne 'Allow') { continue }",
    "  if ($trusted -notcontains $rule.IdentityReference.Value) { exit 1 }",
    "  if ($rule.IdentityReference.Value -eq $current) { $currentAllowed = $true }",
    "}",
    "if (-not $currentAllowed) { exit 1 }",
  ].join("\n");
  await execFileAsync(
    win32.join(
      process.env.SystemRoot ?? "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    ),
    [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    { env: { ...process.env, BAILIAN_OAUTH_ACL_PATH: path }, timeout: 10_000, windowsHide: true },
  );
}

export function createOAuthSecretStore(configDirectory: string): OAuthSecretStore {
  const rootDirectory = resolve(configDirectory);
  const directory = join(rootDirectory, "oauth");
  const filePath = (reference: string) => join(directory, `${reference}.json`);

  async function checkDirectory(create: boolean): Promise<boolean> {
    try {
      if (create) await mkdir(rootDirectory, { recursive: true, mode: 0o700 });
      const root = await lstat(rootDirectory);
      if (
        !root.isDirectory() ||
        (!isWindows && ((root.mode & 0o022) !== 0 || root.uid !== process.getuid?.()))
      )
        throw failure("file");
      if (isWindows) await assertPrivateWindowsAcl(rootDirectory);
      if (create) {
        try {
          await mkdir(directory, { mode: 0o700 });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
      }
      const status = await lstat(directory);
      if (
        !status.isDirectory() ||
        (!isWindows && ((status.mode & 0o777) !== 0o700 || status.uid !== process.getuid?.()))
      )
        throw failure("file");
      if (isWindows) await assertPrivateWindowsAcl(directory);
      return true;
    } catch (error) {
      if (!create && (error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw failure("file");
    }
  }

  async function readFile(reference: string): Promise<string | undefined> {
    if (!(await checkDirectory(false))) return undefined;
    const path = filePath(reference);
    try {
      const original = await lstat(path);
      if (!original.isFile()) throw failure("file");
      if (isWindows) await assertPrivateWindowsAcl(path);
      const handle = await open(path, constants.O_RDONLY | noFollow);
      try {
        const status = await handle.stat();
        if (!isPrivateFile(status) || status.ino !== original.ino || status.dev !== original.dev)
          throw failure("file");
        return await handle.readFile("utf8");
      } finally {
        await handle.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw failure("file");
    }
  }

  async function syncDirectory(): Promise<void> {
    if (isWindows) return;
    const handle = await open(directory, constants.O_RDONLY | noFollow);
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async function atomicWrite(reference: string, contents: string): Promise<void> {
    await checkDirectory(true);
    const temporary = join(directory, `.${reference}.${randomUUID()}.tmp`);
    try {
      const handle = await open(
        temporary,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | noFollow,
        0o600,
      );
      try {
        try {
          if (isWindows) await assertPrivateWindowsAcl(temporary);
          else await handle.chmod(0o600);
          if (!isPrivateFile(await handle.stat())) throw failure("file");
          await handle.writeFile(contents, "utf8");
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(temporary, filePath(reference));
        await syncDirectory();
      } finally {
        await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
    } catch {
      throw failure("file");
    }
  }

  return {
    async read(reference) {
      const normalized = normalizeReference(reference);
      const raw = await readFile(normalized);
      return raw === undefined ? undefined : readSession(raw, normalized);
    },
    async write(reference, value) {
      const normalized = normalizeReference(reference);
      const session = parseRecord(value);
      const previous = await readFile(normalized);
      if (previous !== undefined) readSession(previous, normalized);
      await atomicWrite(normalized, JSON.stringify({ reference: normalized, session }));
    },
    async remove(reference) {
      const normalized = normalizeReference(reference);
      if ((await readFile(normalized)) === undefined) return;
      try {
        await unlink(filePath(normalized));
        await syncDirectory();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw failure("file");
      }
    },
  };
}
