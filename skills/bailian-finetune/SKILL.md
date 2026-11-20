---
name: bailian-finetune
metadata:
  version: "2.10.4"
  requires:
    bins: ["bl"]
description: >-
  阿里云百炼模型精调训练入口：用户要精调、微调、训练自己的模型（fine-tune，支持 SFT / SFT-LoRA / DPO / DPO-LoRA / CPT，
  覆盖文本、语音、图像）、校验或上传训练数据集、看训练进度和日志、挑 checkpoint、导出精调产物、
  把专属模型部署成服务时使用 `bl dataset` / `bl finetune` / `bl deploy`。链路是 validate 校验数据 →
  upload 拿 file-id → finetune create 建任务 → watch 看进度 → export 导出 → 可选 compress 量化压缩 → deploy 上线，需要 API key；
  Console 版本状态与独立部署服务查询使用 Console 鉴权。
  强化学习（RL）训练走 `bl finetune rl`，在隔离沙箱内执行，需先 `bl finetune runtime prepare` 准备运行时（沙箱仅支持 macOS / Linux）；
  OPD 蒸馏训练走 `bl finetune opd`，宿主直连 fine-tunes OpenAPI，无需沙箱运行时；
  授权检查与开通走 `bl finetune rl authorize` / `bl finetune opd authorize`（Console 鉴权）。
  写操作先用 `--dry-run` 预览。反触发：用户点名火山方舟/ark 的精调不走本 skill；只是要选哪个模型走
  bailian-model-recommend；用现成模型生图生视频走 bailian-gen；百炼其他资源管理走 bailian-cli。
  官方安装：`bl skill init`（与共享协议 bailian-protocol 同装）。
---

# Bailian fine-tuning pipeline (`bl dataset` / `bl finetune` / `bl deploy`)

**CRITICAL — Before executing, MUST read the shared protocol in [`../bailian-protocol/SKILL.md`](../bailian-protocol/SKILL.md): Version & updates (pre-flight checklist), Call attribution (every Agent `bl` command), Setup & auth, and CLI errors: report an issue. Command details are authoritative in [`reference/`](reference/index.md) (dataset / finetune / deploy) and `bl <command> --help` — do not guess flags. Examples in `reference/` stay bare; wrap with Call attribution when running. The training pipeline uses an API key; Console dataset-version and independent-deployment queries use Console authentication. If that protocol file is missing, stop and run `bl skill init`; do not guess auth/consent.**

**Call attribution:** Examples below and in `reference/` stay bare `bl …`. When running a command, wrap it with [`bailian-protocol` → Call attribution](../bailian-protocol/SKILL.md#call-attribution-mandatory-for-every-agent-bl-command) (bash or PowerShell). One sample for this skill (`BAILIAN_SKILL_NAME=bailian-finetune`; replace `codex` with this host). After deploy, `bl text chat` is owned by `bailian-cli`. **When copying commands into a reusable script / template / task definition, switch to the protocol `script` template (never keep `agent`); the sample below is for this-turn inline execution only. Strip attribution when handing a command to the user to paste.**

```bash
BAILIAN_CALLER_TYPE=agent BAILIAN_CALLER_NAME=codex BAILIAN_SKILL_NAME=bailian-finetune BAILIAN_SKILL_VERSION=<metadata.version> bl dataset validate --file train.jsonl
```

## End-to-end workflow (follow in order)

```
1. Validate data   bl dataset validate --file train.jsonl [--schema chatml|dpo|cpt|tts|image]
2. Upload data     bl dataset upload --file train.jsonl          # returns a file-id
3. Create job      bl finetune text|audio|image create --base-model <base> --datasets <file-id|path>
4. Watch progress  bl finetune watch --job-id ft-xxx             # or get / logs
5. Pick artifact   bl finetune checkpoints --job-id ft-xxx
6. Export model    bl finetune export --job-id ft-xxx --checkpoint ckpt-N --model-name my-model
7. Compress model  bl finetune compress templates --model my-model       # optional; full-parameter models only
                   bl finetune compress create --model my-model --template-id <template-id>
                   bl finetune compress watch --job-id quant-xxx --follow
8. Deploy service  bl deploy text|audio|image create --model-name <my-model|quantized-output> --display-name my-svc
```

- Unsure which training methods a base model supports → `bl finetune capability --base-model <base>` or `--training-type sft|sft-lora|dpo|cpt`.
- Text `--training-type` values: `sft` / `sft-lora` / `dpo` / `dpo-lora` / `cpt`. Audio bases include `cosyvoice-v3-flash`; image bases include `wan2.7-image-pro`.
- Deployment plans: audio defaults to `--plan mu`; text/image default to `lora`.
- For `risk: high` or `requires_confirmation`, follow `bailian-protocol`; never add `--yes` automatically.

## When to use which command

| Intent                                                 | Command                                                                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Validate / upload training data                        | `bl dataset validate` / `upload` (`.jsonl` or `.zip`)                                                                                            |
| Dataset list / detail / delete                         | `bl dataset list` / `get` / `delete`                                                                                                             |
| Console dataset groups / discover version and file IDs | `bl dataset groups` → `bl dataset version --dataset-group-id <group-id>` (Console auth)                                                          |
| Console version detail / import and release state      | `bl dataset version --dataset-id <version-id>` (Console auth; optional `--include-status`)                                                       |
| Console independent deployment services                | `bl deploy instances` (Console auth; not capacity instances or replicas)                                                                         |
| Create a fine-tuning job                               | `bl finetune text\|audio\|image create`                                                                                                          |
| Job list / detail / follow                             | `bl finetune list` / `get` / `watch` / `logs`                                                                                                    |
| Artifacts and export                                   | `bl finetune checkpoints` / `export`                                                                                                             |
| Quantize / compress a full model                       | `bl finetune compress templates` / `create` / `watch` / `get` / `logs` / `list`                                                                  |
| Cancel / delete a compression job                      | `bl finetune compress cancel` / `delete`                                                                                                         |
| Cancel / delete a fine-tuning job                      | `bl finetune cancel` / `delete`                                                                                                                  |
| Reinforcement-learning (RL) training                   | `bl finetune rl run` / `get` / `list` / `watch` / `logs` / `cancel` / `delete` (sandbox)                                                         |
| RL / OPD authorization check and enablement            | `bl finetune rl authorize` / `bl finetune opd authorize` (Console auth; `--authorize` to mutate)                                                 |
| OPD distillation training                              | `bl finetune opd run --teacher-model <id>` / `get` / `watch` / `logs` / `cancel` / `delete` (OpenAPI; forces `pg_opd`; list via `finetune list`) |
| OPD training / resource parameter query                | `bl finetune opd params --base-model <id> [--param-type hyper\|resource]`                                                                        |
| Prepare / check / clean the RL sandbox runtime         | `bl finetune runtime prepare` / `doctor` / `clean`                                                                                               |
| Import an external OSS LoRA model                      | Hand-off: `bl cmodel import *` — hub-owned commands; see `bailian-cli` reference or `bl cmodel --help`                                           |
| Trainable capability lookup                            | `bl finetune capability`                                                                                                                         |
| Deploy / lifecycle                                     | `bl deploy text\|audio\|image create`, `list` / `get` / `update` / `scale` / `delete` / `models`                                                 |
| Query throughput reservations                          | `bl deploy list --plan ptu` / `bl deploy get`                                                                                                    |
| Query capacity instances                               | `bl deploy capacity list` / `get`                                                                                                                |
| Query / wait for a capacity operation                  | `bl deploy operation get` / `wait`                                                                                                               |
| Buy / scale / renew / release capacity                 | `bl deploy capacity create` / `scale` / `renew` / `delete`                                                                                       |
| Unsubscribe a prepaid instance                         | `bl deploy capacity unsubscribe` (builds the billing console refund link)                                                                        |
| Configure ModelCode overflow strategy                  | `bl deploy overflow`                                                                                                                             |

The `capacity list` / `get`, `operation get` / `wait` and `deploy list` / `get` queries are read-only. Capacity values are kTPM; effective, configured and target capacities are distinct. `deploy list --status` filters only the fetched page locally, with the server total left unfiltered. `operation get` reports status as data; `operation wait` exits non-zero on failure or timeout and refreshes capacity after success. Use IDs returned by the API; waiting never retries a write.

The `capacity create` / `scale` / `renew` / `delete` and `overflow` commands are high-risk writes: preview with `--dry-run`, then confirm with the runtime-injected `--yes`. Each write is submitted once and never auto-retried; HTTP 200 is not success, so pass `--wait` or check `operation_status`. Scale values are one instance's absolute kTPM, not deltas or ModelCode totals, and zero is not release. `capacity delete` releases an instance but keeps the ModelCode; active prepaid instances cannot be DELETEd — run `capacity unsubscribe --instance-id <id>` to get the billing console refund link and finish there (no API exists for refunds). Release is confirmed by `deleted=true`. `overflow` applies to the whole ModelCode, not one instance. There is no estimator or standalone auto-renewal endpoint — renewal settings ride along purchase/scale/renew.

Console reads are separate from API-key file/deployment queries; the API Key / `file_id` semantics of `dataset list` are unchanged. Discover `records[].datasetGroupId` with `dataset groups`, then pass it to `dataset version --dataset-group-id <group-id>` to get `{result:[...]}` with `result[].datasetId` and an optional `fileId`. Use `dataset version --dataset-id <version-id>` for details; exactly one of `--dataset-group-id` and `--dataset-id` is required, and they cannot be combined. `fileId` is not `datasetId`; never pass a file ID from `dataset list` as a Console version ID. Groups are paginated and contain only one nested version preview; `version --dataset-group-id` normalizes array responses to `result` without promising exhaustive results or exposing pagination. Keep the same workspace throughout this chain. `--include-status` is available only in detail mode (`dataset version --dataset-id <version-id> --include-status`) and preserves raw version and task state; missing/unknown state never means validation success or training readiness, and the returned task is not guaranteed to be the latest. A failed follow-up query retains metadata and exits nonzero. `deploy instances` returns one page (`records` is the list, `items` the total); reading does not establish inference or pause permission. With `--workspace-id`, these commands resolve that workspace's Console identity before business requests and stop on resolution failure. For an error-report file key, hand off to `bailian-cli` (`file url`); an existing report URL can be used directly.

Flags, usage, and examples: see [`reference/`](reference/index.md) or `bl <command> --help` — do not guess flags.

## RL sandbox / OPD distillation training

`bl finetune rl` submits reinforcement-learning jobs with the DashScope SDK inside an isolated sandbox (credential deny-read, home redirect, whitelist proxy), so the host Python environment is never used. The sandbox is a local black box: on first run it downloads and verifies a fixed CPython + dashscope runtime from a bundled reviewed manifest, caches it, and reuses the cache afterwards.

```
1. Authorize     bl finetune rl authorize            # read-only probe (Console auth)
                 bl finetune rl authorize --authorize --yes   # enable RL (roles must be authorized manually first)
2. Prepare runtime  bl finetune runtime prepare      # trigger first-run download / verify cache; or set BAILIAN_RL_RUNTIME for dev
3. Check sandbox    bl finetune runtime doctor       # isolation self-check, exits non-zero on failure
4. Submit job       bl finetune rl run --model <id> --train-file <path> --code-dir . --rollout <classpath> --watch
5. Manage job       bl finetune rl get|list|watch|logs|cancel|delete <job-id>
```

`bl finetune opd` submits pure Model OPD distillation jobs (`training_type=pg_opd`) directly from the host via the fine-tunes OpenAPI — no sandbox, no runtime prepare, no rollout/reward functions or function-compute resources.

For a guided end-to-end OPD workflow (authorize → dataset validation → preflight → billing consent → submit → monitor to terminal state), hand off to skill `bailian-opd` (script-gated preflight and submit; Read its `SKILL.md` if installed, else `bl finetune opd --help` or prompt `bl skill init`). Use the raw commands below when the user asks for a specific step or manages existing jobs.

```
1. Authorize     bl finetune opd authorize           # read-only probe (Console auth)
                 bl finetune opd authorize --authorize --yes   # enable OPD
2. Query params  bl finetune opd params --base-model qwen3.5-9b --param-type resource --mtu-spec-code MTU4
3. Submit job    bl finetune opd run --base-model qwen3.5-9b --teacher-model qwen3.8-flash \
                   --datasets ./train.jsonl --hyper-parameters-file ./hp.json --resource-config-file ./resource.json --watch
4. Manage job    bl finetune opd get|watch|logs|cancel|delete --job-id ft-xxx   # list via bl finetune list
5. Artifacts     bl finetune checkpoints / export / metrics --job-id ft-xxx   # shared finetune commands
```

- OPD hyper-parameters are sent exactly as provided (`--hyper-parameters-file` JSON, then `--hp key=value` overrides; `--charge-type` / `--mtu-spec` / `--mtu-count` override `--resource-config-file`). Omitted fields are resolved by the server and the selected teacher's defaults — never fill the parameter API's `recommend_value` into requests: it is not the teacher's effective default (e.g. Flash/Max teacher max length 16385 vs the generic 33792). Exception: `resource_config.charge_type` defaults to `mtu_postpaid` (pg_opd is MTU-only; any other explicit value is a usage error), and `mtu_spec_code` / `mtu_capacity` are required locally (via `--resource-config-file` or `--mtu-spec` / `--mtu-count`) — without them the server persists the job, returns 500, and the job fails at execution time. Their values depend on the student + teacher GPU layout; no defaults are filled.
- The teacher must be a platform-registered model ID compatible with the student; compatibility and MTU capacity (student GPUs + teacher GPUs) are validated server-side and errors surface as-is. Compatible-teacher discovery is not exposed by the parameter API yet.
- OPD local pre-flight (also in `--dry-run`): `opd_teacher_infer_tp` must equal `opd_teacher_n_gpus_per_node` when both are explicit (usage error — teacher Worker template constraint). Warnings never block: student/teacher pair outside the published support matrix (official docs "模型与训练单元", invite-only, region-specific); student GPU layout not fully specified (docs recommend MTU4 × 24 for the default layout — `mtu_capacity` must equal student + teacher GPUs, and the server checks this only after job creation); explicit `max_length` / `max_prompt_length` above an explicit `opd_teacher_max_model_len`. `finetune get` hides the empty legacy `training_files` / `validation_files` for jobs carrying dataset descriptors.
- OPD batch-fit (real submit with local datasets): `batch_size` is the samples-per-step — `floor(samples × n_epochs / batch_size) = 0` is a usage error before upload (the job would fail at execution time on `lr_decay_steps > 0`, after billing starts); provide at least `ceil(batch_size / n_epochs)` samples with headroom. `ppo_mini_batch_size` above `batch_size × n_rollouts` is a usage error when all three are explicit (also in `--dry-run`). When steps are computable, explicit `lr_warmup_steps` / `eval_steps` / `save_steps` above the total step count warn (`OPD_WARMUP_EXCEEDS_STEPS` / `OPD_INTERVAL_EXCEEDS_STEPS`); file-id datasets with explicit batch_size/n_epochs warn `OPD_BATCH_FIT_UNKNOWN`.
- `rl run` / `opd run` are billed (`risk: high`, reason billing); `rl` / `opd` `cancel` / `delete` are destructive. Preview with `--dry-run` (zero network for both), then confirm with the runtime-injected `--yes`; never add `--yes` automatically.
- `authorize` only enables the requested target (RL never auto-enables OPD and vice versa) and never creates service-linked roles — missing roles report `REQUIRES_USER_ACTION` with manual-authorization docs (RL: https://docs.bailian.console.aliyun.com/zh/model-studio/rl-training-overview#%E7%8E%AF%E5%A2%83%E5%87%86%E5%A4%87, OPD: https://docs.bailian.console.aliyun.com/zh/model-studio/opd-training-overview#%E7%8E%AF%E5%A2%83%E5%87%86%E5%A4%87) and block enablement. A failed query reports `UNKNOWN`, never assumed enabled. In CI, permission changes require explicit `--authorize --yes`.
- `rl|opd run --watch` / `rl|opd watch --follow` poll to a terminal state; `--wait-timeout` / `--poll-timeout` only stop waiting (default: no limit), never cancel the cloud job. `watch` without `--follow` is a single non-blocking probe. The RL sandbox is macOS / Linux only — on Windows it fails closed with "Not supported on Windows yet." OPD has no platform restriction.
- OPD job commands accept `--workspace-id` (upload, parameter query, creation and reads use the same workspace). There is no `opd list` — OPD jobs appear in `finetune list` (same records, including non-OPD jobs).
- Runtime downloads fall back to a built-in npmmirror mirror when GitHub is unreachable; set `BAILIAN_RL_PYTHON_MIRROR` to a custom mirror prefix. Where the PyPI CDN stalls, set `BAILIAN_RL_PIP_INDEX_URL` to a stable PyPI mirror (e.g. `https://pypi.tuna.tsinghua.edu.cn/simple/` or `https://mirrors.aliyun.com/pypi/simple/`). Mirrors lag PyPI — if a mirror lacks a pinned version, pip fails closed with `No matching distribution found for X==ver`; use a fresher mirror or the default PyPI. Integrity is always verified against the reviewed SHA256 / per-package hashes regardless of source.
- Sandbox artifact lifecycle: each invocation's task directory is disposed when the invocation ends (success / failure / timeout alike — nothing is retained for retries). Crash orphans older than 24h and superseded runtime versions are reclaimed by `bl finetune runtime clean` (local only, no auth; destructive — preview the remove/keep plan with `--dry-run`, then confirm with `--yes`; `--ttl-hours` tunes the orphan threshold). `runtime prepare` also prunes orphaned runs as a side effect. The current baseline runtime, `BAILIAN_RL_RUNTIME` dev directories and the content-addressed download cache are never touched.
- Flags, usage, and examples: see [`reference/finetune.md`](reference/finetune.md) or `bl finetune rl --help` / `bl finetune opd --help` — do not guess flags.

## Quick examples

```bash
bl dataset validate --file train.jsonl
bl dataset upload --file train.jsonl
bl finetune text create --base-model qwen3-8b --training-type sft-lora --datasets file-xxx
bl finetune watch --job-id ft-xxx
bl finetune export --job-id ft-xxx --checkpoint ckpt-3 --model-name my-qwen-sft
# Optional quantization (Beijing region; full-parameter fine-tuned models only)
bl finetune compress templates --model my-qwen-sft
bl finetune compress create --model my-qwen-sft --template-id quant-xxx --suffix int4
bl finetune compress watch --job-id quant-xxx --follow
bl deploy text create --model-name <my-qwen-sft-or-quantized-output> --display-name my-svc
# RL sandbox training (macOS / Linux)
bl finetune runtime prepare
bl finetune rl run --model qwen3.5-9b --train-file ./data/train.jsonl --code-dir . --rollout functions.rollout.MyRollout --charge-type mtu_postpaid --mtu-spec MTU4 --mtu-count 24 --watch
# OPD distillation (host OpenAPI, no sandbox)
bl finetune opd run --base-model qwen3.5-9b --teacher-model qwen3.5-397b-a17b --datasets ./data/train.jsonl --charge-type mtu_postpaid --mtu-spec MTU4 --mtu-count 24 --watch
```

## Common hand-offs

软 hand-off（按 skill **名**；已安装则 Read，否则 `--help` / 提示 `bl skill init`）：

- After deployment, try the model or generate content → skill `bailian-gen` (media) or `bl text chat` (fallback: `bl image\|video\|text --help`).
- Unsure which base model to pick → `bailian-model-recommend` / `bl advisor recommend`.
- Training quota / usage questions → skill `bailian-cli` (fallback: `bl quota` / `bl usage --help`).

## references

- [bailian-protocol](../bailian-protocol/SKILL.md) — shared protocol (install via `bl skill init`)
- [reference/](reference/index.md) — command details
