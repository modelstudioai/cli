---
name: bailian-finetune
metadata:
  version: "2.0.0"
  requires:
    bins: ["bl"]
description: >-
  阿里云百炼模型精调训练入口：用户要精调、微调、训练自己的模型（fine-tune，支持 SFT / SFT-LoRA / DPO / DPO-LoRA / CPT，
  覆盖文本、语音、图像）、校验或上传训练数据集、看训练进度和日志、挑 checkpoint、导出精调产物、
  把专属模型部署成服务时使用 `bl dataset` / `bl finetune` / `bl deploy`。链路是 validate 校验数据 →
  upload 拿 file-id → finetune create 建任务 → watch 看进度 → export 导出 → deploy 上线，需要 API key；
  写操作先用 `--dry-run` 预览。反触发：用户点名火山方舟/ark 的精调不走本 skill；只是要选哪个模型走
  bailian-model-recommend；用现成模型生图生视频走 bailian-gen；百炼其他资源管理走 bailian-cli。
  官方安装：`bl skill init`（与共享协议 bailian-protocol 同装）。
---

# Bailian fine-tuning pipeline (`bl dataset` / `bl finetune` / `bl deploy`)

**CRITICAL — Before executing, MUST read the shared protocol in [`../bailian-protocol/SKILL.md`](../bailian-protocol/SKILL.md): Version & updates (pre-flight checklist), Setup & auth, and CLI errors: report an issue. Command details are authoritative in [`reference/`](reference/index.md) (dataset / finetune / deploy) and `bl <command> --help` — do not guess flags. The whole pipeline requires an API key. If that protocol file is missing, stop and run `bl skill init`; do not guess auth/consent.**

## End-to-end workflow (follow in order)

```
1. Validate data   bl dataset validate --file train.jsonl [--schema chatml|dpo|cpt|tts|image]
2. Upload data     bl dataset upload --file train.jsonl          # returns a file-id
3. Create job      bl finetune text|audio|image create --base-model <base> --datasets <file-id|path>
4. Watch progress  bl finetune watch --job-id ft-xxx             # or get / logs
5. Pick artifact   bl finetune checkpoints --job-id ft-xxx
6. Export model    bl finetune export --job-id ft-xxx --checkpoint ckpt-N --model-name my-model
7. Deploy service  bl deploy text|audio|image create --model-name my-model --display-name my-svc
```

- Unsure which training methods a base model supports → `bl finetune capability --base-model <base>` or `--training-type sft|sft-lora|dpo|cpt`.
- Text `--training-type` values: `sft` / `sft-lora` / `dpo` / `dpo-lora` / `cpt`. Audio bases include `cosyvoice-v3-flash`; image bases include `wan2.7-image-pro`.
- Deployment plans: audio defaults to `--plan mu`; text/image default to `lora`.
- For `risk: high` or `requires_confirmation`, follow `bailian-protocol`; never add `--yes` automatically.

## When to use which command

| Intent                                 | Command                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Validate / upload training data        | `bl dataset validate` / `upload` (`.jsonl` or `.zip`)                                            |
| Dataset list / detail / delete         | `bl dataset list` / `get` / `delete`                                                             |
| Create a fine-tuning job               | `bl finetune text\|audio\|image create`                                                          |
| Job list / detail / follow             | `bl finetune list` / `get` / `watch` / `logs`                                                    |
| Artifacts and export                   | `bl finetune checkpoints` / `export`                                                             |
| Cancel / delete a job                  | `bl finetune cancel` / `delete`                                                                  |
| Trainable capability lookup            | `bl finetune capability`                                                                         |
| Deploy / lifecycle                     | `bl deploy text\|audio\|image create`, `list` / `get` / `update` / `scale` / `delete` / `models` |
| Query throughput reservations          | `bl deploy list --plan ptu` / `bl deploy get`                                                    |
| Query capacity instances               | `bl deploy capacity list` / `get`                                                                |
| Query / wait for a capacity operation  | `bl deploy operation get` / `wait`                                                               |
| Buy / scale / renew / release capacity | `bl deploy capacity create` / `scale` / `renew` / `delete`                                       |
| Unsubscribe a prepaid instance         | `bl deploy capacity unsubscribe` (builds the billing console refund link)                        |
| Configure ModelCode overflow strategy  | `bl deploy overflow`                                                                             |

The `capacity list` / `get`, `operation get` / `wait` and `deploy list` / `get` queries are read-only. Capacity values are kTPM; effective, configured and target capacities are distinct. `deploy list --status` filters only the fetched page locally, with the server total left unfiltered. `operation get` reports status as data; `operation wait` exits non-zero on failure or timeout and refreshes capacity after success. Use IDs returned by the API; waiting never retries a write.

The `capacity create` / `scale` / `renew` / `delete` and `overflow` commands are high-risk writes: preview with `--dry-run`, then confirm with the runtime-injected `--yes`. Each write is submitted once and never auto-retried; HTTP 200 is not success, so pass `--wait` or check `operation_status`. Scale values are one instance's absolute kTPM, not deltas or ModelCode totals, and zero is not release. `capacity delete` releases an instance but keeps the ModelCode; active prepaid instances cannot be DELETEd — run `capacity unsubscribe --instance-id <id>` to get the billing console refund link and finish there (no API exists for refunds). Release is confirmed by `deleted=true`. `overflow` applies to the whole ModelCode, not one instance. There is no estimator or standalone auto-renewal endpoint — renewal settings ride along purchase/scale/renew.

Flags, usage, and examples: see [`reference/`](reference/index.md) or `bl <command> --help` — do not guess flags.

## Quick examples

```bash
bl dataset validate --file train.jsonl
bl dataset upload --file train.jsonl
bl finetune text create --base-model qwen3-8b --training-type sft-lora --datasets file-xxx
bl finetune watch --job-id ft-xxx
bl finetune export --job-id ft-xxx --checkpoint ckpt-3 --model-name my-qwen-sft
bl deploy text create --model-name my-qwen-sft --display-name my-svc
```

## Common hand-offs

软 hand-off（按 skill **名**；已安装则 Read，否则 `--help` / 提示 `bl skill init`）：

- After deployment, try the model or generate content → skill `bailian-gen` (media) or `bl text chat` (fallback: `bl image\|video\|text --help`).
- Unsure which base model to pick → `bailian-model-recommend` / `bl advisor recommend`.
- Training quota / usage questions → skill `bailian-cli` (fallback: `bl quota` / `bl usage --help`).

## references

- [bailian-protocol](../bailian-protocol/SKILL.md) — shared protocol (install via `bl skill init`)
- [reference/](reference/index.md) — command details
