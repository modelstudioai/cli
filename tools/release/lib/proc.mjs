import { spawnSync } from "child_process";

import { ROOT } from "./packages.mjs";

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    stdio: options.stdio ?? "inherit",
    env: { ...process.env, ...options.env },
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim();
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `\n${detail}` : ""}`);
  }
  return result.stdout ?? "";
}

export function runCapture(command, args, options = {}) {
  return run(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function tryRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...options.env },
    encoding: "utf-8",
  });
  return {
    status: result.status,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}
