import { expect, test, vi } from "vite-plus/test";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

import { isOpenPathTimeout, openPath } from "../src/commands/shared/local-server.ts";

function lastOptions(): { timeout?: number; killSignal?: string } {
  return execFileMock.mock.calls[0]?.[2] as { timeout?: number; killSignal?: string };
}

// 上限是 opt-in：共享调用方（config ui 的 /api/*/open、console 登录）把 reject 映射成
// HTTP 400 或「无法打开默认浏览器」，默认设上限会把「已打开但慢」误报成失败。
test("默认不设上限，保持既有语义", () => {
  execFileMock.mockClear();
  execFileMock.mockImplementation(() => undefined);
  void openPath("https://example.com");

  const options = lastOptions();
  expect(options.timeout).toBeUndefined();
  expect(options.killSignal).toBeUndefined();
});

test("显式传 timeoutMs 才设上限，并以 SIGTERM 杀掉以释放事件循环", () => {
  execFileMock.mockClear();
  execFileMock.mockImplementation(() => undefined);
  void openPath("https://example.com", { timeoutMs: 5_000 });

  const options = lastOptions();
  expect(options.timeout).toBe(5_000);
  expect(options.killSignal).toBe("SIGTERM");
});

test("被 timeout 杀掉的打开器归类为超时，而不是失败", async () => {
  execFileMock.mockClear();
  execFileMock.mockImplementation(
    (
      _command: string,
      _args: string[],
      _options: unknown,
      callback: (err: Error | null) => void,
    ) => {
      const killed = Object.assign(new Error("Command failed"), {
        killed: true,
        signal: "SIGTERM",
      });
      callback(killed);
    },
  );

  const error = await openPath("https://example.com").catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(Error);
  expect(isOpenPathTimeout(error)).toBe(true);
});

test("正常失败（ENOENT / 非零退出）不被误判为超时", async () => {
  execFileMock.mockClear();
  execFileMock.mockImplementation(
    (
      _command: string,
      _args: string[],
      _options: unknown,
      callback: (err: Error | null) => void,
    ) => {
      callback(Object.assign(new Error("no display"), { killed: false }));
    },
  );

  const error = await openPath("https://example.com").catch((caught: unknown) => caught);
  expect(isOpenPathTimeout(error)).toBe(false);
});

test("打开器成功返回时 promise 解决", async () => {
  execFileMock.mockClear();
  execFileMock.mockImplementation(
    (
      _command: string,
      _args: string[],
      _options: unknown,
      callback: (err: Error | null) => void,
    ) => {
      callback(null);
    },
  );
  await expect(openPath("https://example.com")).resolves.toBeUndefined();
});
