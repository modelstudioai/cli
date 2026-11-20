import { describe, expect, test } from "vite-plus/test";
import {
  buildBwrapArgs,
  buildSbplProfile,
  createIsolationAdapter,
  detectIsolation,
  type IIsolationSpec,
} from "../src/index.ts";

const REAL_HOME = "/Users/real/.dashscope";

const SPEC: IIsolationSpec = {
  runId: "run-1",
  runtimeRoot: "/data/runtimes/rl/abc",
  taskDir: "/data/runs/run-1",
  snapshotDir: "/data/runs/run-1/snapshot",
  deployCopyDir: "/data/runs/run-1/deploy-copy",
  dataDir: "/data/runs/run-1/data",
  homeDir: "/data/runs/run-1/home",
  tmpDir: "/data/runs/run-1/tmp",
  cacheDir: "/data/runs/run-1/cache",
  configPath: "/data/runs/run-1/config.yaml",
  command: ["/data/runtimes/rl/abc/bin/python", "-I", "-m", "dashscope"],
  apiKey: "sk-secret",
  credentialDenyPaths: [REAL_HOME],
  network: { managementDomains: ["dashscope.aliyuncs.com"], ossSuffixes: [], allowedPorts: [443] },
  proxyPort: 9090,
  timeoutMs: 1000,
  maxOutputBytes: 1024,
};

describe("platform dispatch", () => {
  test("win32 is fail-closed with a plain not-supported reason", async () => {
    const capability = await createIsolationAdapter("win32").detect();
    expect(capability.credentialDenyRead.available).toBe(false);
    expect(capability.credentialDenyRead.mechanism).toBe("appcontainer");
    expect(capability.credentialDenyRead.reason).toBe("Not supported on Windows yet.");
    expect(capability.hardening).toEqual({
      networkEnforce: false,
      processTree: false,
      memoryLimit: false,
    });
  });

  test("unknown platforms are fail-closed", async () => {
    const capability = await detectIsolation("freebsd" as NodeJS.Platform);
    expect(capability.credentialDenyRead.available).toBe(false);
    expect(capability.credentialDenyRead.mechanism).toBe("none");
    expect(capability.credentialDenyRead.reason).toBe("Not supported on freebsd yet.");
  });

  test("windows adapter leaves the command unwrapped", () => {
    const adapter = createIsolationAdapter("win32");
    expect(adapter.wrapCommand(SPEC, SPEC.command)).toEqual(SPEC.command);
  });
});

describe("darwin SBPL profile", () => {
  test("is deny-default and only allows runtime / task paths", () => {
    const profile = buildSbplProfile(SPEC);
    expect(profile).toContain("(deny default)");
    expect(profile).toContain("(allow file-read*");
    expect(profile).toContain(SPEC.runtimeRoot);
    expect(profile).toContain(SPEC.snapshotDir);
    expect(profile).toContain(SPEC.deployCopyDir);
    expect(profile).toContain(`(allow network-outbound (remote tcp "localhost:9090"))`);
  });

  test("never references the real credential home", () => {
    const profile = buildSbplProfile(SPEC);
    expect(profile).not.toContain(REAL_HOME);
    expect(profile).not.toContain("/Users/real");
  });

  test("allows root inode read and the task cwd for interpreter startup", () => {
    const profile = buildSbplProfile(SPEC);
    // dyld 启动解析绝对路径需读根目录本身，缺失则解释器 SIGABRT（exit 134）且无输出。
    expect(profile).toContain('(literal "/")');
    // cwd=taskDir，getcwd() 需读 cwd 目录本身；仅允许子目录会让 rich 的 os.getcwd() 报 EPERM。
    expect(profile).toContain(`(subpath "${SPEC.taskDir}")`);
  });

  test("allows the system CA bundle for TLS certificate verification", () => {
    const profile = buildSbplProfile(SPEC);
    expect(profile).toContain('(subpath "/private/etc/ssl")');
  });
});

describe("linux bwrap args", () => {
  test("binds runtime and task dirs by real path with pid isolation", () => {
    const args = buildBwrapArgs(SPEC, SPEC.command);
    expect(args).toContain("--unshare-pid");
    expect(args).toContain("--die-with-parent");
    expect(args).toContain("--ro-bind");
    // 运行时与 snapshot/data 只读，deploy-copy/tmp/home 可写，均按真实路径绑定。
    expect(args).toContain(SPEC.runtimeRoot);
    expect(args).toContain(SPEC.deployCopyDir);
    expect(args).toContain(SPEC.homeDir);
    // 命令位于 -- 之后。
    const separator = args.indexOf("--");
    expect(args.slice(separator + 1)).toEqual(SPEC.command);
  });

  test("never binds the real credential home", () => {
    const args = buildBwrapArgs(SPEC, SPEC.command);
    expect(args).not.toContain(REAL_HOME);
    expect(args.some((arg) => arg.startsWith("/Users/real"))).toBe(false);
  });

  test("linux adapter wraps the command with bwrap", () => {
    const adapter = createIsolationAdapter("linux");
    const wrapped = adapter.wrapCommand(SPEC, SPEC.command);
    expect(wrapped[0]).toBe("bwrap");
    expect(wrapped).toContain("--unshare-pid");
  });
});
