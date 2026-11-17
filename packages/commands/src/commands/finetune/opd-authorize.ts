import { type FlagsDef } from "bailian-cli-core";
import { defineConsoleReadCommand } from "../shared/console-read.ts";
import { runRlAuthorize } from "./rl-shared.ts";

const AUTHORIZE_FLAGS = {
  authorize: {
    type: "switch",
    description: {
      "en-US":
        "Permit creating missing service roles and enabling OPD (read-only probe without it)",
      "zh-CN": "允许补建缺失的服务角色并开通 OPD（不传则仅只读检查）",
    },
  },
} satisfies FlagsDef;

export default defineConsoleReadCommand({
  defaultOutput: "json",
  description: {
    "en-US": "Check and authorize OPD distillation access (whitelist, service roles, enablement)",
    "zh-CN": "检查并授权 OPD 蒸馏访问能力（准入白名单、服务角色、业务开通）",
  },
  auth: "console",
  risk: {
    level: "high",
    reason: "destructive",
    message: {
      "en-US":
        "With --authorize this creates service-linked roles and enables the OPD training mode for your account.",
      "zh-CN": "传入 --authorize 时，该操作会为账号创建服务关联角色并开通 OPD 训练模式。",
    },
  },
  usageArgs: "[--authorize]",
  flags: AUTHORIZE_FLAGS,
  exampleArgs: ["", "--authorize --yes", "--dry-run"],
  notes: [
    {
      "en-US":
        "Without --authorize this is a read-only probe. Each capability reports READY / MISSING / UNKNOWN / REQUIRES_USER_ACTION / FAILED; a failed query is UNKNOWN, never assumed enabled.",
      "zh-CN":
        "不传 --authorize 时仅只读检查。每项能力返回 READY / MISSING / UNKNOWN / REQUIRES_USER_ACTION / FAILED；查询失败记为 UNKNOWN，绝不臆断为已开通。",
    },
    {
      "en-US":
        "Only OPD is enabled; RL is never auto-enabled. In CI pass --authorize --yes to permit changes; --yes alone does not expand permissions.",
      "zh-CN":
        "只开通 OPD，不会自动开通 RL。CI 中须显式 --authorize --yes 才允许变更；单独 --yes 不扩大权限。",
    },
  ],
  async run(ctx) {
    await runRlAuthorize(ctx, {
      target: "opd",
      action: "finetune.opd.authorize",
      authorize: ctx.flags.authorize === true,
    });
  },
});
