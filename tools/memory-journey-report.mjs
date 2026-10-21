/** The default library needs only a valid workspace/key pair. */
export function missingCloudEnvironment(environment) {
  return ["DASHSCOPE_API_KEY", "BAILIAN_WORKSPACE_ID"].filter((key) => !environment[key]?.trim());
}

/** Convert Vitest evidence to strict acceptance: skipped/missing is never PASS. */
export function summarizeSuite(report, requiredIds) {
  const assertions = (report.testResults ?? []).flatMap((suite) => suite.assertionResults ?? []);
  return requiredIds.map((id) => {
    const checks = assertions.filter((assertion) =>
      new RegExp(`^${id}\\b`).test(assertion.title ?? ""),
    );
    const status = checks.some((check) => check.status === "failed")
      ? "FAIL"
      : checks.length && checks.every((check) => check.status === "passed")
        ? "PASS"
        : "BLOCKED";
    return {
      id,
      status,
      checks: checks.map((check) => ({ title: check.title, status: check.status })),
    };
  });
}
