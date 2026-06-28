/**
 * Environment detection utilities for bailian-cli.
 */

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
