# 模型训练 + 数据集 + 部署：最小闭环 CLI 设计

> 目标：一个 Qwen 文本模型 SFT 训练、数据集上传、模型部署的端到端最小链路。

---

## 一、命令概览

| 优先级 | 命令                                | 映射 API                                      | 用途                            |
| ------ | ----------------------------------- | --------------------------------------------- | ------------------------------- |
| P0     | `bl dataset upload <path>`          | `POST /api/v1/files`                          | 上传训练数据(含本地格式校验)    |
| P0     | `bl finetune create`                | `POST /api/v1/fine-tunes`                     | 创建 SFT 训练任务(预填默认超参) |
| P0     | `bl finetune status <job_id>`       | `GET /api/v1/fine-tunes/{job_id}`             | 查询训练状态                    |
| P0     | `bl deploy create`                  | `POST /api/v1/deployments`                    | 部署训练好的模型                |
| P1     | `bl finetune logs <job_id>`         | `GET /api/v1/fine-tunes/{job_id}/logs`        | 拉取训练日志                    |
| P1     | `bl finetune checkpoints <job_id>`  | `GET /api/v1/fine-tunes/{job_id}/checkpoints` | 查看/挑选 Checkpoint            |
| P1     | `bl deploy status <deployed_model>` | `GET /api/v1/deployments/{deployed_model}`    | 查询部署状态                    |
| P1     | `bl deploy delete <deployed_model>` | `DELETE /api/v1/deployments/{deployed_model}` | 下线部署                        |
| P1     | `bl infer --model <deployed_model>` | 复用 `text chat` 通路                         | 调用已部署模型                  |

---

## 二、P0 命令详细设计

### 2.1 `bl dataset upload`

**定位：** 上传训练数据文件到百炼平台，获取 `file_id` 供训练任务引用。

#### CLI 签名

```
bl dataset upload <path> [--purpose fine-tune] [--validate] [--no-validate]
```

| Flag            | 必填 | 默认值      | 说明                           |
| --------------- | ---- | ----------- | ------------------------------ |
| `<path>`        | 是   | —           | 本地文件路径（.jsonl 或 .zip） |
| `--purpose`     | 否   | `fine-tune` | 文件用途标签                   |
| `--validate`    | 否   | `true`      | 上传前执行本地格式校验         |
| `--no-validate` | 否   | —           | 跳过本地校验                   |

#### 本地格式校验规则（提交前拦截）

校验逻辑在 `packages/core` 实现（纯函数），CLI 调用后展示错误：

1. **文件格式检查**：仅允许 `.jsonl` 和 `.zip`（zip 内根目录必须有 `data.jsonl`）
2. **JSONL 逐行校验**：
   - 每行可被 `JSON.parse`
   - 顶层必须包含 `messages` 数组
   - `messages` 中每项必须包含 `role`（枚举：`system` | `user` | `assistant`）和 `content`（非空字符串）
   - 至少包含一条 `user` + 一条 `assistant` 消息
3. **数量校验**：SFT 训练至少需要上千条数据（给出 warning 而非 hard fail，阈值建议 ≥ 10 条 hard fail）
4. **文件体积**：≤ 300MB

#### 校验失败输出示例

```
✗ Validation failed:

  Line 3: missing "messages" field
  Line 7: role "bot" is not valid (expected: system | user | assistant)
  Line 12: "content" is empty string

Fix 3 errors above and retry.
```

#### API 调用

```
POST https://dashscope.aliyuncs.com/api/v1/files
Content-Type: multipart/form-data
Authorization: Bearer <api-key>

Body:
  files: <binary>
  purpose: "fine-tune"

Response 200:
{
  "id": "file-xxxx",
  "bytes": 12345,
  "filename": "train.jsonl",
  "purpose": "fine-tune",
  "created_at": 1700000000
}
```

#### 输出

- 默认 text：`✓ Uploaded file-xxxx (12.3 KB) — use this ID in bl finetune create`
- `--output json`：完整 response body
- `--quiet`：仅输出 `file-xxxx`

---

### 2.2 `bl finetune create`

**定位：** 创建一个 SFT 训练任务。核心设计原则——**预填合理默认超参 + 提交前二次确认**，降低 OOM/超参不合理导致的训练失败率。

#### CLI 签名

```
bl finetune create --model <model> --data <file_id> [hyperparams...]
```

| Flag                | 必填 | 默认值       | 说明                                         |
| ------------------- | ---- | ------------ | -------------------------------------------- |
| `--model`           | 是   | —            | 基座模型（如 `qwen3-8b`, `qwen3-14b`）       |
| `--data`            | 是   | —            | 训练数据 file_id（bl dataset upload 返回值） |
| `--validation-data` | 否   | —            | 验证数据 file_id                             |
| `--epochs`          | 否   | 3            | 训练轮次 (n_epochs)                          |
| `--batch-size`      | 否   | 按模型自动选 | 批大小                                       |
| `--lr`              | 否   | 按模型自动选 | 学习率 (learning_rate_multiplier)            |
| `--warmup-ratio`    | 否   | 0.1          | warmup 比例                                  |
| `--suffix`          | 否   | —            | 输出模型后缀名                               |
| `--yes` / `-y`      | 否   | —            | 跳过确认直接提交                             |

#### 预填默认超参策略

| 基座模型   | batch_size | lr_multiplier | n_epochs | 备注             |
| ---------- | ---------- | ------------- | -------- | ---------------- |
| qwen3-8b   | 4          | 1e-5          | 3        | 小模型可大 batch |
| qwen3-14b  | 2          | 5e-6          | 3        | 中模型防 OOM     |
| qwen3-32b+ | 1          | 2e-6          | 2        | 大模型保守设置   |

> 以上为建议默认值，用户显式传参时覆盖。具体映射表在 `packages/core/src/finetune/defaults.ts` 维护。

#### 提交前交互确认

非 `--yes` 模式下，显示任务摘要等待确认：

```
┌─ Fine-tune Job Summary ──────────────────────┐
│ Model:        qwen3-8b                        │
│ Training:     file-abc123 (2,048 samples)     │
│ Validation:   (none)                          │
│ Epochs:       3                               │
│ Batch size:   4                               │
│ LR:           1e-5                            │
│ Warmup:       0.1                             │
│ Suffix:       my-assistant                    │
│                                               │
│ Estimated cost: ~¥XX (based on token count)   │
└───────────────────────────────────────────────┘
Proceed? [Y/n]
```

#### API 调用

```
POST https://dashscope.aliyuncs.com/api/v1/fine-tunes
Authorization: Bearer <api-key>
Content-Type: application/json

{
  "model": "qwen3-8b",
  "training_file_ids": ["file-abc123"],
  "validation_file_ids": [],
  "hyper_parameters": {
    "n_epochs": 3,
    "batch_size": 4,
    "learning_rate": "1e-5",
    "warmup_ratio": 0.1
  },
  "suffix": "my-assistant"
}

Response 200:
{
  "job_id": "ft-xxxx",
  "status": "PENDING",
  "model": "qwen3-8b",
  "created_at": "2025-01-01T00:00:00Z",
  "training_file_ids": ["file-abc123"],
  "hyper_parameters": {...},
  "trained_model": null
}
```

#### 输出

- text：`✓ Fine-tune job ft-xxxx created (PENDING). Track with: bl finetune status ft-xxxx`
- json：完整 response body
- quiet：`ft-xxxx`

---

### 2.3 `bl finetune status`

**定位：** 查询训练任务状态，支持 `--wait` 轮询模式。

#### CLI 签名

```
bl finetune status <job_id> [--wait] [--interval <seconds>]
```

| Flag         | 必填 | 默认值 | 说明             |
| ------------ | ---- | ------ | ---------------- |
| `<job_id>`   | 是   | —      | 任务 ID          |
| `--wait`     | 否   | —      | 持续轮询直到终态 |
| `--interval` | 否   | 30     | 轮询间隔(秒)     |

#### 状态机

```
PENDING → RUNNING → SUCCEEDED
                  ↘ FAILED
```

#### 输出（text 模式）

单次查询：

```
Job:     ft-xxxx
Status:  RUNNING (elapsed 12m)
Model:   qwen3-8b
Output:  (pending)
```

`--wait` 模式（spinner + 实时刷新）：

```
⠋ ft-xxxx RUNNING [14:32 elapsed]
✓ ft-xxxx SUCCEEDED — trained model: qwen3-8b:ft-xxxx-20250101
  Deploy with: bl deploy create --model qwen3-8b:ft-xxxx-20250101
```

失败时：

```
✗ ft-xxxx FAILED
  Error: OutOfMemory — try reducing --batch-size or using a smaller model
```

---

### 2.4 `bl deploy create`

**定位：** 将训练好的模型（或 checkpoint）部署为可调用的推理服务。

#### CLI 签名

```
bl deploy create --model <model_name> [--plan <plan>] [--capacity <n>]
```

| Flag         | 必填 | 默认值     | 说明                                            |
| ------------ | ---- | ---------- | ----------------------------------------------- |
| `--model`    | 是   | —          | 待部署模型名称（finetune 产出的 trained_model） |
| `--plan`     | 否   | `standard` | 部署方案                                        |
| `--capacity` | 否   | 依 plan    | 并发容量                                        |
| `--wait`     | 否   | —          | 等待部署就绪                                    |

#### API 调用

```
POST https://dashscope.aliyuncs.com/api/v1/deployments
Authorization: Bearer <api-key>
Content-Type: application/json

{
  "model_name": "qwen3-8b:ft-xxxx-20250101",
  "plan": "standard",
  "capacity": 2
}

Response 200:
{
  "deployed_model": "qwen3-8b-ft-xxxx",
  "model_name": "qwen3-8b:ft-xxxx-20250101",
  "status": "PENDING",
  "created_at": "..."
}
```

#### 输出

```
✓ Deployment created: qwen3-8b-ft-xxxx (PENDING)
  Once RUNNING, call with: bl text chat --model qwen3-8b-ft-xxxx
  Check status: bl deploy status qwen3-8b-ft-xxxx
```

---

## 三、P1 命令简要设计

### 3.1 `bl finetune logs <job_id>`

流式输出训练日志，支持 `--follow`（类似 `tail -f`）。输出 loss/step/epoch 信息。

### 3.2 `bl finetune checkpoints <job_id>`

列出可选 checkpoint（step, loss, eval metrics），支持 `--output json` 供脚本使用。可配合 `bl deploy create --model <checkpoint_model>` 部署指定 checkpoint。

### 3.3 `bl deploy status <deployed_model>`

查询部署状态及资源信息（PENDING → RUNNING → STOPPED/FAILED）。

### 3.4 `bl deploy delete <deployed_model>`

下线部署。需部署处于 RUNNING/STOPPED/FAILED 状态。交互确认或 `--yes` 跳过。

### 3.5 `bl infer --model <deployed_model>`

实际可复用已有 `bl text chat --model <deployed_model>` 通路，作为别名/快捷方式。P1 考虑是否有独立存在必要。

---

## 四、代码架构方案

按照 monorepo 分层约定（core 纯逻辑 / cli 是 UI）：

### packages/core 新增模块

```
packages/core/src/
├── finetune/
│   ├── index.ts          # re-export
│   ├── api.ts            # createFineTune, getFineTune, getFineTuneLogs, getCheckpoints
│   ├── defaults.ts       # 模型 → 默认超参映射表
│   └── types.ts          # FineTuneJob, HyperParameters, CheckpointInfo 类型
├── dataset/
│   ├── index.ts
│   ├── upload.ts         # uploadDataset (multipart)
│   ├── validate.ts       # validateJsonl (纯函数,逐行校验)
│   └── types.ts          # DatasetFile, ValidationError 类型
└── deploy/
    ├── index.ts
    ├── api.ts            # createDeployment, getDeployment, deleteDeployment
    └── types.ts          # Deployment, DeploymentStatus 类型
```

### packages/cli 新增命令

```
packages/cli/src/commands/
├── dataset/
│   └── upload.ts         # bl dataset upload
├── finetune/
│   ├── create.ts         # bl finetune create
│   ├── status.ts         # bl finetune status
│   ├── logs.ts           # bl finetune logs
│   └── checkpoints.ts    # bl finetune checkpoints
└── deploy/
    ├── create.ts         # bl deploy create
    ├── status.ts         # bl deploy status
    └── delete.ts         # bl deploy delete
```

---

## 五、关键设计决策

### 5.1 数据格式校验放在 CLI 侧（提交前拦截）

训练失败 TOP 原因中"数据格式错误"占比高。与其等服务端 10 分钟后返回 FAILED，不如 CLI 本地秒级校验：

- **validate.ts** 是纯函数，接收 ReadableStream/Buffer，返回 `ValidationError[]`
- CLI 在 `dataset upload` 默认执行校验，`--no-validate` 允许跳过
- 未来可扩展为独立命令 `bl dataset validate <path>`

### 5.2 超参预填 + 确认而非强制

- core 维护 `defaults.ts` 映射：`model → { batch_size, lr, epochs }`
- CLI `finetune create` 未指定超参时自动填入
- 提交前展示完整参数面板（非 --yes 模式），避免"我以为用了默认但其实没传"

### 5.3 费用感知（P1+）

- 图像/语音/视频训练费用远高于文本。MVP 阶段（Qwen 文本 SFT）费用可控
- 后续扩展多模态时，在 confirm panel 中强化费用估算提示
- `bl quota check` 已存在，可在 `finetune create` 内部集成余额预检

### 5.4 `bl infer` 是否独立存在

建议 P1 阶段**不新增** `bl infer`，而是让 `bl text chat --model <deployed_model>` 直接工作。部署完成后的引导文案中指明这个用法即可。减少命令膨胀。

---

## 六、最小闭环用户操作流

```bash
# 1. 准备数据 → 上传（含校验）
bl dataset upload ./train.jsonl
# ✓ Uploaded file-abc123 (5.2 MB)

# 2. 创建训练任务（自动预填超参）
bl finetune create --model qwen3-8b --data file-abc123
# Shows summary panel → confirm → ✓ Job ft-xxxx created

# 3. 等待训练完成
bl finetune status ft-xxxx --wait
# ⠋ RUNNING [23:15] → ✓ SUCCEEDED: qwen3-8b:ft-xxxx-20250601

# 4. 部署模型
bl deploy create --model qwen3-8b:ft-xxxx-20250601 --wait
# ✓ Deployed: qwen3-8b-ft-xxxx (RUNNING)

# 5. 调用模型
bl text chat --model qwen3-8b-ft-xxxx "你好，介绍一下你自己"
# (正常推理输出)
```

---

## 七、实现顺序建议

```
Phase 1 (P0 — 最小闭环):
  core: dataset/validate.ts → dataset/upload.ts → finetune/api.ts → deploy/api.ts
  cli:  dataset upload → finetune create → finetune status → deploy create
  测试: 单元测试 validate.ts + e2e dry-run + 真实 API 端到端一次

Phase 2 (P1 — 可观测性):
  finetune logs → finetune checkpoints → deploy status → deploy delete
  费用估算集成

Phase 3 (后续):
  bl dataset validate (独立命令)
  bl dataset list (查看已上传)
  bl finetune list (查看历史任务)
  多模态 SFT 支持（图像/视频数据格式校验扩展）
```

---

## 八、风险与 TODO

| 风险点            | 影响              | 缓解措施                                      |
| ----------------- | ----------------- | --------------------------------------------- |
| OOM 训练失败      | 用户浪费时间/金钱 | 保守默认超参 + batch_size 自适应模型大小      |
| 数据格式错误      | 训练启动后才失败  | 本地校验拦截，启动秒级反馈                    |
| 部署等待时间长    | 用户困惑          | `--wait` + 预估时间提示                       |
| 费用超预期        | 账号欠费          | confirm panel 预估费用（P1 集成 quota check） |
| API endpoint 变动 | 调用失败          | 端点集中管理在 core/client/endpoints.ts       |
