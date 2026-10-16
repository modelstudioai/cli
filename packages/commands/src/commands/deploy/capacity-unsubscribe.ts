import { defineCommand } from "bailian-cli-core";
import { emitResult, emitBare, refundConsolePage } from "bailian-cli-runtime";
import { CAPACITY_INSTANCE_FLAG, validateQueryIds } from "./query-shared.ts";

export default defineCommand({
  description: {
    "en-US": "Build the Aliyun billing console unsubscribe link for a prepaid capacity instance",
    "zh-CN": "生成预付费容量实例在阿里云费用中心的退订链接",
  },
  auth: "none",
  flags: CAPACITY_INSTANCE_FLAG,
  usageArgs: "--instance-id <id>",
  exampleArgs: ["--instance-id example-instance"],
  notes: [
    {
      "en-US":
        "No API is called and nothing is unsubscribed by this command; it only builds the refund page link. Open the link and finish the unsubscribe flow in the billing console with the account that placed the order.",
      "zh-CN":
        "本命令不调用任何接口，也不会执行退订，只生成费用中心退订页面链接。请用下单账号打开链接，在费用中心完成退订流程。",
    },
    {
      "en-US":
        "Only prepaid instances are unsubscribed this way; postpaid instances are released with `deploy capacity delete`. The ID is the capacity instance ID (see `deploy capacity list` / `get`), not the ModelCode. Unsubscription may interrupt serving and is irreversible; refund rules are decided by the billing console.",
      "zh-CN":
        "仅预付费实例通过此方式退订；后付费实例请使用 `deploy capacity delete` 释放。此处为容量实例 ID（见 `deploy capacity list` / `get`），不是 ModelCode。退订可能中断服务且不可撤销，退款规则以费用中心为准。",
    },
  ],
  validate: validateQueryIds,
  async run(ctx) {
    const { settings, flags } = ctx;
    // Pure link builder: no network call, so dry-run and execution share one path.
    const refundUrl = refundConsolePage(flags.instanceId);
    if (settings.quiet) {
      emitBare(refundUrl);
      return;
    }
    emitResult(
      {
        action: "deploy.capacity.unsubscribe",
        instance_id: flags.instanceId,
        refund_url: refundUrl,
      },
      "json",
    );
  },
});
