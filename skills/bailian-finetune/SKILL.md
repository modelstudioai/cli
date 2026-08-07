---
name: bailian-finetune
metadata:
  version: "1.14.2"
  requires:
    bins: ["bl"]
description: >-
  阿里云百炼模型精调训练入口：用户要精调、微调、训练自己的模型（fine-tune，支持 SFT / SFT-LoRA / DPO / DPO-LoRA / CPT，
  覆盖文本、语音、图像）、校验或上传训练数据集、看训练进度和日志、挑 checkpoint、导出精调产物、
  把专属模型部署成服务时使用 `bl dataset` / `bl finetune` / `bl deploy`。链路是 validate 校验数据 →
  upload 拿 file-id → finetune create 建任务 → watch 看进度 → export 导出 → deploy 上线，需要 API key；
  写操作先用 `--dry-run` 预览。反触发：用户点名火山方舟/ark 的精调不走本 skill；只是要选哪个模型走
  bailian-model-recommend；用现成模型生图生视频走 bailian-gen；百炼其他资源管理走 bailian-cli。
  官方安装：`npx skills add modelstudioai/cli --all -g`（与共享协议 bailian-protocol 同装）。
---

# Bailian fine-tuning pipeline (`bl dataset` / `bl finetune` / `bl deploy`)

**CRITICAL — Before executing, MUST read the shared protocol in [`../bailian-protocol/SKILL.md`](../bailian-protocol/SKILL.md): Version & updates (pre-flight checklist), Setup & auth, and CLI errors: report an issue. Command details are authoritative in [`reference/`](reference/index.md) (dataset / finetune / deploy) and `bl <command> --help` — do not guess flags. The whole pipeline requires an API key. If that protocol file is missing, stop and run `npx skills add modelstudioai/cli --all -g`; do not guess auth/consent.**

## End-to-end workflow (follow in order)

```
1. Validate data   bl dataset validate --file train.jsonl [--schema chatml|dpo|cpt|tts|image]
2. Upload data     bl dataset upload --file train.jsonl          # returns a file-id
3. Create job      bl finetune text|audio|image create --model <base> --datasets <file-id|path>
4. Watch progress  bl finetune watch --job-id ft-xxx             # or get / logs
5. Pick artifact   bl finetune checkpoints --job-id ft-xxx
6. Export model    bl finetune export --job-id ft-xxx --checkpoint ckpt-N --model-name my-model
7. Deploy service  bl deploy text|audio|image create --model my-model --name my-svc
```

- Unsure which training methods a base model supports → `bl finetune capability --model <base>` or `--training-type sft|sft-lora|dpo|cpt`.
- Text `--training-type` values: `sft` / `sft-lora` / `dpo` / `dpo-lora` / `cpt`. Audio bases include `cosyvoice-v3-flash`; image bases include `wan2.7-image-pro`.
- Deployment plans: audio defaults to `--plan mu`; text/image default to `lora`.
- Preview write operations (create / delete / cancel / scale) with `--dry-run` first, and confirm with the user before deleting a job or dataset.

## When to use which command

| Intent                          | Command                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| Validate / upload training data | `bl dataset validate` / `upload` (`.jsonl` or `.zip`)                                            |
| Dataset list / detail / delete  | `bl dataset list` / `get` / `delete`                                                             |
| Create a fine-tuning job        | `bl finetune text\|audio\|image create`                                                          |
| Job list / detail / follow      | `bl finetune list` / `get` / `watch` / `logs`                                                    |
| Artifacts and export            | `bl finetune checkpoints` / `export`                                                             |
| Cancel / delete a job           | `bl finetune cancel` / `delete`                                                                  |
| Trainable capability lookup     | `bl finetune capability`                                                                         |
| Deploy / lifecycle              | `bl deploy text\|audio\|image create`, `list` / `get` / `update` / `scale` / `delete` / `models` |

Flags, usage, and examples: see [`reference/`](reference/index.md) or `bl <command> --help` — do not guess flags.

## Quick examples

```bash
bl dataset validate --file train.jsonl
bl dataset upload --file train.jsonl
bl finetune text create --model qwen3-8b --training-type sft-lora --datasets file-xxx
bl finetune watch --job-id ft-xxx
bl finetune export --job-id ft-xxx --checkpoint ckpt-3 --model-name my-qwen-sft
bl deploy text create --model my-qwen-sft --name my-svc
```

## Common hand-offs

软 hand-off（按 skill **名**；已安装则 Read，否则 `--help` / 提示 `npx skills add modelstudioai/cli --all -g`）：

- After deployment, try the model or generate content → skill `bailian-gen` (media) or `bl text chat` (fallback: `bl image\|video\|text --help`).
- Unsure which base model to pick → `bailian-model-recommend` / `bl advisor recommend`.
- Training quota / usage questions → skill `bailian-cli` (fallback: `bl quota` / `bl usage --help`).

## references

- [bailian-protocol](../bailian-protocol/SKILL.md) — shared protocol (install via `--all -g`)
- [reference/](reference/index.md) — command details
