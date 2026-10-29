/**
 * In-process test isolation for the core package (core must not depend on e2e).
 * Commands / CLI E2E should use `e2e/isolation` (includes child-process env).
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENT_ENV_KEYS, SKIP_HOST_AGENTS_ENV } from "../../src/skills/agents.ts";

export interface IsolatedHomeHandle {
  home: string;
  configDir: string;
  restore: () => void;
}

/** Enter a temp HOME/config and disable host-level Agent detection. */
export function enterIsolatedHome(): IsolatedHomeHandle {
  const saved: Record<string, string | undefined> = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    BAILIAN_CONFIG_DIR: process.env.BAILIAN_CONFIG_DIR,
    [SKIP_HOST_AGENTS_ENV]: process.env[SKIP_HOST_AGENTS_ENV],
  };
  for (const key of AGENT_ENV_KEYS) {
    saved[key] = process.env[key];
  }

  const root = mkdtempSync(join(tmpdir(), "bl-iso-home-"));
  mkdirSync(join(root, "home"), { recursive: true });
  // realpath: align with process.cwd() /private/var prefix on macOS
  const home = realpathSync(join(root, "home"));
  const configDir = join(home, ".bailian");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, "config.json"),
    `${JSON.stringify({ language: "en-US" }, null, 2)}\n`,
    "utf8",
  );

  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.XDG_CONFIG_HOME = join(home, ".config");
  process.env.BAILIAN_CONFIG_DIR = configDir;
  process.env[SKIP_HOST_AGENTS_ENV] = "1";
  for (const key of AGENT_ENV_KEYS) {
    delete process.env[key];
  }

  return {
    home,
    configDir,
    restore: () => {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** Async helper with automatic restore. */
export async function withIsolatedHome(
  fn: (home: string, configDir: string) => Promise<void>,
): Promise<void> {
  const handle = enterIsolatedHome();
  try {
    await fn(handle.home, handle.configDir);
  } finally {
    handle.restore();
  }
}
