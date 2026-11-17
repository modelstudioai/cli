import {
  defineCommand,
  resolveRuntime,
  RUNTIME_OVERRIDE_ENV,
  type FlagsDef,
} from "bailian-cli-core";

import { emitRlDryRun, emitRlResult } from "./rl-shared.ts";

const PREPARE_FLAGS = {
  manifest: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Optional runtime manifest file (defaults to the bundled reviewed manifest)",
      "zh-CN": "可选的运行时清单文件（默认使用随包受审查清单）",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US": "Prepare the managed Python/SDK runtime used by RL and OPD jobs",
    "zh-CN": "准备 RL / OPD 任务使用的托管 Python/SDK 运行时",
  },
  auth: "none",
  usageArgs: "[--manifest <path>]",
  flags: PREPARE_FLAGS,
  exampleArgs: ["", "--manifest ./runtime-manifest.json", "--dry-run"],
  notes: [
    {
      "en-US":
        "Downloads and verifies the runtime locally; it never creates a training job. Set BAILIAN_RL_RUNTIME to a local dashscope Python directory to reuse a development runtime instead.",
      "zh-CN":
        "仅在本地下载并校验运行时，不会创建训练任务。可将 BAILIAN_RL_RUNTIME 指向本机 dashscope Python 目录以复用开发态运行时。",
    },
    {
      "en-US":
        "On an unsupported platform this reports RUNTIME_UNAVAILABLE; no cloud resources are created.",
      "zh-CN": "在不支持的平台返回 RUNTIME_UNAVAILABLE；不会创建任何云资源。",
    },
    {
      "en-US":
        "CPython downloads fall back to a built-in npmmirror mirror when GitHub is unreachable; set BAILIAN_RL_PYTHON_MIRROR to a custom mirror prefix. Integrity is always verified against the reviewed SHA256 regardless of source.",
      "zh-CN":
        "GitHub 不可达时 CPython 下载回退到内置 npmmirror 镜像；可用 BAILIAN_RL_PYTHON_MIRROR 指定自定义镜像前缀。无论哪个源，完整性始终按受审查 SHA256 校验。",
    },
    {
      "en-US":
        "In regions where the PyPI CDN stalls, set BAILIAN_RL_PIP_INDEX_URL to a stable PyPI mirror (e.g. https://pypi.tuna.tsinghua.edu.cn/simple/ or https://mirrors.aliyun.com/pypi/simple/); pip still verifies every package hash via --require-hashes. Mirrors lag PyPI: if a mirror lacks a pinned version, pip reports 'No matching distribution found for X==ver' — use a fresher mirror or the default PyPI.",
      "zh-CN":
        "PyPI CDN 受限地区可设 BAILIAN_RL_PIP_INDEX_URL 指向稳定 PyPI 镜像（如 https://pypi.tuna.tsinghua.edu.cn/simple/ 或 https://mirrors.aliyun.com/pypi/simple/）；pip 仍以 --require-hashes 逐包校验哈希。镜像同步滞后于 PyPI：若镜像缺锁文件钉的版本，pip 报 No matching distribution found for X==ver，换更新更快的镜像或回默认 PyPI。",
    },
  ],
  async run(ctx) {
    if (ctx.settings.dryRun) {
      emitRlDryRun(ctx, "finetune.runtime.prepare", {
        manifest: ctx.flags.manifest,
        override_env: RUNTIME_OVERRIDE_ENV,
        allow_install: true,
      });
      return;
    }
    const runtime = await resolveRuntime({
      allowInstall: true,
      manifestPath: ctx.flags.manifest,
    });
    emitRlResult(ctx, {
      runtime_root: runtime.runtimeRoot,
      python_path: runtime.pythonPath,
      dashscope_version: runtime.dashscopeVersion,
      source: runtime.source,
    });
  },
});
