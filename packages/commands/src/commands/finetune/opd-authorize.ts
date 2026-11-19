import { type FlagsDef } from "bailian-cli-core";
import { OPD_TRAINING_DOC } from "bailian-cli-runtime";
import { defineConsoleReadCommand } from "../shared/console-read.ts";
import { runRlAuthorize } from "./rl-shared.ts";

const AUTHORIZE_FLAGS = {
  authorize: {
    type: "switch",
    description: {
      "en-US":
        "Permit enabling OPD once the service roles are manually authorized (read-only probe without it)",
      "zh-CN": "允许在角色已手动授权后开通 OPD（不传则仅只读检查）",
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
        "With --authorize this enables the OPD training mode for your account. The CLI never creates service-linked roles.",
      "zh-CN": "传入 --authorize 时会为账号开通 OPD 训练模式。CLI 不会创建服务关联角色。",
    },
  },
  usageArgs: "[--authorize]",
  flags: AUTHORIZE_FLAGS,
  exampleArgs: ["", "--authorize --yes", "--dry-run"],
  notes: [
    {
      "en-US": `Service-linked roles must be authorized manually first (${OPD_TRAINING_DOC}); missing roles report REQUIRES_USER_ACTION and block enablement.`,
      "zh-CN": `服务关联角色须先手动授权（${OPD_TRAINING_DOC}）；角色缺失时报告 REQUIRES_USER_ACTION 并阻止开通。`,
    },
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
