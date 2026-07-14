import type { CommandPackPolicy } from "bailian-cli-runtime";

/** Command Packs accepted by the bl product. */
export const commandPackPolicy = {
  supported: {
    "@ali/bailian-plugin-agent": {
      commandPrefixes: ["agent"],
      credentialAccess: ["apiKey"],
    },
    "@ali/bailian-plugin-inner-console-call": {
      commandPrefixes: ["inner-console"],
    },
  },
} as const satisfies CommandPackPolicy;
