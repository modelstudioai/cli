import { expect, test } from "vite-plus/test";
import { buildOpenInvocation } from "../src/commands/shared/local-server.ts";

const LOGIN_URL =
  "https://bailian.console.aliyun.com/console-login?notice=127.0.0.1:54675?state=abc&needapikey=true";

/** Command line `cmd.exe` runs after `/s` strips one outer quote pair. */
function commandExecutedByCmd(args: string[]): string {
  const switchIndex = args.lastIndexOf("/c");
  const remainder = args[switchIndex + 1];
  if (!remainder || switchIndex < 0) throw new Error("missing /c command");
  expect(remainder.startsWith('"')).toBe(true);
  expect(remainder.endsWith('"')).toBe(true);
  return remainder.slice(1, -1);
}

/** Split on `&` that is not inside double quotes, the way `cmd.exe` does. */
function splitUnquotedAmpersand(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (const character of command) {
    if (character === '"') {
      quoted = !quoted;
      current += character;
      continue;
    }
    if (character === "&" && !quoted) {
      parts.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts;
}

test("win32 打开带 & 的登录 URL 时，needapikey 留在同一条 start 命令里", () => {
  const invocation = buildOpenInvocation(LOGIN_URL, "win32");
  expect(invocation.command).toBe("cmd");
  expect(invocation.windowsVerbatimArguments).toBe(true);
  expect(invocation.args.slice(0, 4)).toEqual(["/d", "/v:off", "/s", "/c"]);

  const executed = commandExecutedByCmd(invocation.args);
  expect(executed).toBe(`start "" "${LOGIN_URL}"`);
  expect(splitUnquotedAmpersand(executed)).toEqual([executed]);
  expect(executed).toContain("&needapikey=true");
});

test("win32 转义 cmd 会展开的 % 和引号", () => {
  const invocation = buildOpenInvocation('https://example.com/a%20b?"q"', "win32");
  const executed = commandExecutedByCmd(invocation.args);
  expect(executed).toBe('start "" "https://example.com/a%%20b?""q"""');
});

test("darwin / linux 直接把目标交给系统打开命令", () => {
  expect(buildOpenInvocation(LOGIN_URL, "darwin")).toEqual({
    command: "open",
    args: [LOGIN_URL],
  });
  expect(buildOpenInvocation(LOGIN_URL, "linux")).toEqual({
    command: "xdg-open",
    args: [LOGIN_URL],
  });
});
