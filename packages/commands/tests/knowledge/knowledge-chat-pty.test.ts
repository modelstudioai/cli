import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";
const exec = promisify(execFile);
const fixture = fileURLToPath(new URL("./fixtures/chat-pty.ts", import.meta.url));
const loader = import.meta.resolve("tsx");
const driver = `
import os, pty, subprocess, sys, errno
master, slave = pty.openpty()
child = subprocess.Popen(sys.argv[1:], stdin=slave, stdout=slave, stderr=slave)
os.close(slave)
try:
    while True:
        try:
            chunk = os.read(master, 65536)
        except OSError as error:
            if error.errno == errno.EIO:
                break
            raise
        if not chunk:
            break
        sys.stdout.buffer.write(chunk)
finally:
    os.close(master)
sys.exit(child.wait())
`;

test.skipIf(process.platform === "win32").each([false, true])(
  "real PTY honors quiet=%s using local SSE fixture",
  async (quiet) => {
    const command = [process.execPath, "--import", loader, fixture, ...(quiet ? ["--quiet"] : [])];
    const result = await exec("python3", ["-c", driver, ...command], {
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });
    const text = result.stdout.replaceAll("\r", "");
    if (quiet) expect(text.trim()).toBe("最终答案");
    else {
      expect(text).toContain("[Planning]");
      expect(text).toContain("[Answer]");
      expect(text).toContain("https://example.com/video.mp4");
      expect(text.match(/最终答案/g)).toHaveLength(1);
    }
  },
);
