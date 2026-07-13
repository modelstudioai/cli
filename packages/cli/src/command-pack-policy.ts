import type { CommandPackPolicy } from "bailian-cli-runtime";

/** Command Packs accepted by the bl product. */
export const commandPackPolicy = {
  supported: {
    "@ali/bailian-plugin-agent": {
      commandPrefixes: ["agent"],
      credentialAccess: ["apiKey"],
    },
  },
} as const satisfies CommandPackPolicy;
