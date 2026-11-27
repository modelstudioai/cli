# bailian-opd

阿里云百炼**纯 Model OPD 蒸馏**（`pg_opd`）端到端引导工作流：通过 `bl` CLI
用教师模型训练学生模型，每个门禁都由确定性脚本强制执行。

[English](README.md) · Agent 执行说明：[SKILL.md](SKILL.md)

## 做什么

按安全顺序跑完创建全链路：

1. **授权**——探测账号 OPD 功能闸（邀测白名单、服务关联角色、开通状态）；
   开通只在你明确确认后执行。
2. **数据校验**——本地 ChatML 校验 JSONL（纯蒸馏允许 prompt-only 的
   `messages` + `rollout_extra`）。
3. **参数探测**——确认学生已登记 `pg_opd`、workspace 与 API Key 匹配。
4. **dry-run + 确认**——组装精确请求体，原样呈现所有告警（未公布组合、
   默认布局容量、教师长度），要求你对请求体和计费范围明确确认。
5. **确认后提交**——创建任务；失败/超时时执行重复创建守卫（服务端可能
   落库后仍回 500），绝不盲目重试。
6. **验证成功**——轮询到终态；`SUCCEEDED` 且查到 checkpoints 才算成功。
   执行期失败（如 MTU 容量不匹配）会提取失败原因并给处置建议。

## 何时使用

你要做 OPD / 在线蒸馏（带 `teacher_model`）。RL / agentic rollout 训练、
SFT/DPO/CPT 精调、部署不属于本 skill，归 `bailian-finetune`。

## 前置条件

- 已安装并更新 `bl`（bailian-cli）；`node` >= 18。
- 双登录：`bl auth login --api-key`（数据/参数/创建）与
  `bl auth login --console`（OPD 功能探测）。
- OPD 为邀测功能；支持的师生组合见官方 OPD 文档"模型与训练单元"章节。

## 快速开始

```bash
# 1. 只读预检（所有门禁聚合为一份 JSON 报告）
node scripts/opd-preflight.mjs \
  --base-model qwen3.5-9b --teacher-model qwen3.5-397b-a17b \
  --datasets ./train.jsonl --validations ./valid.jsonl \
  --hyper-parameters-file assets/baseline-9b-from-397b.hyper_parameters.json \
  --resource-config-file assets/baseline-9b-from-397b.resource_config.json \
  --caller-name my-agent

# 2. 审阅报告，明确确认后才提交
node scripts/opd-submit.mjs <相同参数> --confirmed --caller-name my-agent

# 3. 监控到验证过的终态
node scripts/opd-wait.mjs --job-id ft-xxx --caller-name my-agent
```

## 基线与容量

`assets/` 内置基线是历史成功请求的时点快照（仅公开模型名与参数）。首跑默认
用教师字段全显式的 9B←397B 基线；9B←Flash 为第二选择。

| 布局                          | mtu_capacity   |
| ----------------------------- | -------------- |
| 默认学生布局，9B + Flash 教师 | 24（官方推荐） |
| Flash 基线自定义布局          | 16             |
| 397B 基线全显式               | 24             |

`mtu_capacity` 必须等于学生 GPU 数 + 教师 GPU 数。服务端在任务创建**之后**
才检查容量，因此预检会按两种布局口径计算并在不匹配时告警——建议仅供参考
（教师内接/外接模式无公开查询接口）。

## 计费警示

OPD 任务为 **MTU 后付费**：`mtu_spec_code × mtu_capacity`，任务运行期间计费。
确认门禁的存在就是为了在创建任何东西之前把计费范围讲清楚。轮询超时不会
取消任务。

## 故障摘要

- exit 2：本地闸（缺 MTU 字段、charge type 错误、教师 TP ≠ 每节点 GPU、
  0 训练步数、mini-batch 过大、schema 违规）——未创建任何东西。
- exit 3：登录（`--api-key` / `--console`）。
- 创建 500/超时：相信脚本的 `duplicate_check`；挂到可能已创建的任务上，
  不要重新提交。
- FAILED "OPD requires N student GPUs + M teacher GPUs…"：容量改为 N+M
  或调整布局，重新预检、重新确认、作为新任务提交。
- batch-fit 被拦（"0 训练步数"）：`batch_size` 即每步样本数；数据补到至少
  `ceil(batch_size / n_epochs)` 条并留余量，或调小 `batch_size` / 调大
  `n_epochs`。0 步任务会在计费开始后的执行期失败。
- 绝不把参数接口的 `recommend_value` 填进请求——它不是教师的有效默认值。

完整分诊表与硬性规则见 [SKILL.md](SKILL.md)。
