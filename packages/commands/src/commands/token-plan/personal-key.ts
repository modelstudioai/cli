import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

const GET_KEY_API = "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/api-keys/getKeyByUid";

export default defineCommand({
  description: "Get the personal-edition TokenPlan API key (masked) for the current account",
  auth: "console",
  usageArgs: "[flags]",
  flags: {},
  exampleArgs: [""],
  async run(ctx) {
    const { settings } = ctx;
    const format = detectOutputFormat(settings.output);
    const result = await ctx.client.console(GET_KEY_API, {});
    emitResult(result, format);
  },
});
