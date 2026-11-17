import { homedir } from "node:os";
import { join } from "node:path";
import {
  assertDoctorPassed,
  defineCommand,
  resolveRuntime,
  runRuntimeDoctor,
  type IResolvedRuntime,
} from "bailian-cli-core";

import { emitRlDryRun, emitRlResult } from "./rl-shared.ts";

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US":
      "Check the RL runtime and sandbox isolation (credential deny, home redirect, SDK import)",
    "zh-CN": "检查 RL 运行时与沙箱隔离（凭据禁读、home 重定向、SDK 导入）",
  },
  auth: "none",
  usageArgs: "",
  flags: {},
  exampleArgs: ["", "--dry-run", "--output json"],
  notes: [
    {
      "en-US":
        "Read-only self-check; it creates no cloud resources. Required checks must pass; when the runtime is missing they are skipped (not treated as passed) and the command exits non-zero.",
      "zh-CN":
        "只读自检，不创建任何云资源。必过项必须通过；运行时缺失时相关项记为 skip（不当作通过），命令以非零码退出。",
    },
    {
      "en-US":
        "Enhanced hardening (kernel network enforcement, process tree, memory) degrades with a notice when unavailable and does not fail the overall check.",
      "zh-CN": "增强项（内核网络强制、进程树、内存）不可用时降级提示，不判定整体失败。",
    },
  ],
  async run(ctx) {
    if (ctx.settings.dryRun) {
      emitRlDryRun(ctx, "finetune.runtime.doctor", {
        credential_deny_paths: [join(homedir(), ".dashscope")],
      });
      return;
    }
    // A missing runtime is reported as skipped checks, not a hard resolve error.
    let runtime: IResolvedRuntime | undefined;
    try {
      runtime = await resolveRuntime({ allowInstall: false });
    } catch {
      runtime = undefined;
    }
    const report = await runRuntimeDoctor({
      runtime,
      credentialDenyPaths: [join(homedir(), ".dashscope")],
    });
    emitRlResult(ctx, report);
    assertDoctorPassed(report);
  },
});
