import type { CliOptions } from "bailian-cli-runtime";

/** Decode the existing Aliyun subprocess protocol at the product boundary. */
export function resolveAliyunIntegration(
  environment: NodeJS.ProcessEnv,
): Pick<CliOptions, "commandInvocation"> {
  if (environment.ALIBABA_CLOUD_BL_COMPAT_MODE?.trim() !== "aliyun bl") return {};
  return {
    commandInvocation: { bin: "aliyun", path: ["bl"] },
  };
}
