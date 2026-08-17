import { defineCommand, BailianError, ExitCode } from "bailian-cli-core";
import { runPermissionChange, validatePermissionChange } from "./shared.ts";

export default defineCommand({
  description: "Revoke model permissions (inference / finetune / deploy)",
  auth: "apiKey",
  usageArgs: "--model <models> [--action <actions>] | --all --yes",
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
      description: "Close one-key authorization and clear ALL historical inference grants",
    },
    yes: {
      type: "switch",
      description: "Confirm --all without an interactive prompt (required)",
    },
  },
  exampleArgs: [
    "--model qwen-plus",
    "--model qwen-plus,qwen3-max --action inference,finetune",
    "--all --yes",
    "--model qwen-plus --dry-run --output json",
  ],
  notes: [
    "Grants apply to the business workspace your API key belongs to.",
    "--all maps to the server one-key switch (access_all_entities: CLOSE): it clears every historical inference grant and cannot be undone, so it requires --yes.",
    "Actions you omit keep their current grants (server-side tri-state patch).",
  ],
  validate: (flags) => validatePermissionChange(flags),
  async run(ctx) {
    const { flags, settings } = ctx;
    if (flags.all && !flags.yes && !settings.dryRun) {
      throw new BailianError(
        "Refusing to clear all historical inference grants without confirmation.",
        ExitCode.USAGE,
        "Re-run with --yes to close one-key authorization (or preview with --dry-run).",
      );
    }
    await runPermissionChange(ctx, flags, false);
  },
});
