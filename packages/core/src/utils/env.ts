/**
 * Environment detection utilities for bailian-cli.
 *
 * Used to determine whether the CLI is running in an interactive terminal
 * (human user) or in a non-interactive environment (CI, agent, pipe, etc.),
 * so commands can adjust their behavior accordingly.
 */

/**
 * Detects whether the current environment is interactive.
 *
 * Returns false when:
 *  - stdout or stdin is not a TTY
 *  - The --non-interactive flag was explicitly set
 *  - The process is running in a known CI environment (CI env var present)
 *
 * Returns true when stdout and stdin are both TTYs and --non-interactive
 * was not passed.
 */
export function isInteractive(options?: { nonInteractive?: boolean }): boolean {
  if (options?.nonInteractive === true) return false;
  if (process.env.CI) return false;
  return process.stdout.isTTY === true && process.stdin.isTTY === true;
}

/**
 * Detects whether the current process is running in a CI environment.
 */
export function isCI(): boolean {
  return !!(
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.GITLAB_CI ||
    process.env.JENKINS_URL ||
    process.env.TRAVIS ||
    process.env.CIRCLECI
  );
}
