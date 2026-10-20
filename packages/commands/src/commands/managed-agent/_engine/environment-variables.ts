import { BailianError, ExitCode, type FlagsDef } from "bailian-cli-core";

export const ENVIRONMENT_VARIABLE_FLAGS = {
  // Preserve the API-aligned spelling requested for Session and Deployment commands.
  environment_variables: {
    type: "array",
    valueHint: "<KEY=VALUE>",
    description: {
      "en-US": "Runtime environment variable; repeat for multiple values (last value wins)",
      "zh-CN": "运行时环境变量；可重复传入，同名变量以后一次为准",
    },
  },
} satisfies FlagsDef;

export function parseEnvironmentVariables(
  entries: string[] | undefined,
): Record<string, string> | undefined {
  if (!entries?.length) return undefined;
  return Object.fromEntries(
    entries.map((entry) => {
      const separator = entry.indexOf("=");
      if (separator < 0) {
        throw new BailianError(
          "--environment_variables values must use KEY=VALUE format. / --environment_variables 必须使用 KEY=VALUE 格式。",
          ExitCode.USAGE,
        );
      }
      const key = entry.slice(0, separator).trim();
      if (!key) {
        throw new BailianError(
          "--environment_variables keys must not be empty. / --environment_variables 的键不能为空。",
          ExitCode.USAGE,
        );
      }
      return [key, entry.slice(separator + 1)];
    }),
  );
}

export function redactEnvironmentVariables(
  variables: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  return variables === undefined
    ? undefined
    : Object.fromEntries(Object.keys(variables).map((key) => [key, "[REDACTED]"]));
}
