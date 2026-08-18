import { defineCommand } from "bailian-cli-core";
import { runPermissionChange, validatePermissionChange } from "./shared.ts";

export default defineCommand({
  description: "Grant model permissions (inference / finetune / deploy)",
  auth: "apiKey",
  usageArgs: "--model <models> [--action <actions>] | --all",
  flags: {
    model: {
      type: "string",
      valueHint: "<models>",
      description: "Model ID(s), comma-separated (max 20)",
    },
    action: {
      type: "string",
      valueHint: "<actions>",
      description:
        "Permission action(s), comma-separated: inference, finetune, deploy (default: inference)",
    },
    all: {
      type: "switch",
      description:
        "One-key grant inference for all models in the workspace (including future ones)",
    },
  },
  exampleArgs: [
    "--model qwen-plus",
    "--model qwen-plus,qwen3-max --action inference,finetune",
    "--all",
    "--model qwen-plus --dry-run --output json",
  ],
  notes: [
    "Grants apply to the business workspace your API key belongs to.",
    "--all maps to the server one-key switch (access_all_entities: OPEN) and only covers inference.",
    "Actions you omit keep their current grants (server-side tri-state patch).",
  ],
  validate: (flags) => validatePermissionChange(flags),
  async run(ctx) {
    await runPermissionChange(ctx, ctx.flags, true);
  },
});
