# bailian-opd

Guided end-to-end workflow for **pure Model OPD distillation** (`pg_opd`) on
Alibaba Cloud Bailian: train a student model from a teacher model through the
`bl` CLI, with deterministic scripts enforcing every gate.

[中文版](README.zh.md) · Agent instructions: [SKILL.md](SKILL.md)

## What it does

Runs the full creation chain in the safe order:

1. **Authorize** — probe the account's OPD feature gate (whitelist, service
   roles, enablement); enablement only after your explicit confirmation.
2. **Validate data** — local ChatML validation of your JSONL (prompt-only
   `messages` + `rollout_extra` are valid for pure distillation).
3. **Probe parameters** — confirm the student is registered for `pg_opd` and
   the workspace matches the API key.
4. **Dry-run + consent** — assemble the exact request body, surface every
   warning (unpublished pair, default-layout capacity, teacher length), and
   require your explicit confirmation of the body and billing scope.
5. **Confirmed submit** — create the job; on failure/timeout a duplicate-creation
   guard checks whether the server persisted a job anyway (it can return 500
   after persisting). Never blind-retries.
6. **Verified success** — poll to a terminal state; `SUCCEEDED` plus listed
   checkpoints counts as success. Execution-phase failures (e.g. MTU capacity
   mismatch) are extracted with a triage hint.

## When to use

You want OPD / online distillation with a `teacher_model`. Not for RL / agentic
rollout training, SFT/DPO/CPT fine-tuning, or deployment — those belong to the
`bailian-finetune` skill.

## Prerequisites

- `bl` (bailian-cli) installed and up to date; `node` >= 18.
- Two logins: `bl auth login --api-key` (data/params/create) and
  `bl auth login --console` (OPD feature probe).
- OPD is invite-only; supported student/teacher pairs are published in the
  official OPD docs ("模型与训练单元" section).

## Quickstart

```bash
# 1. Read-only preflight (aggregates all gates into one JSON report)
node scripts/opd-preflight.mjs \
  --base-model qwen3.5-9b --teacher-model qwen3.5-397b-a17b \
  --datasets ./train.jsonl --validations ./valid.jsonl \
  --hyper-parameters-file assets/baseline-9b-from-397b.hyper_parameters.json \
  --resource-config-file assets/baseline-9b-from-397b.resource_config.json \
  --caller-name my-agent

# 2. Review the report, then submit ONLY after explicit confirmation
node scripts/opd-submit.mjs <same flags> --confirmed --caller-name my-agent

# 3. Monitor to a verified terminal state
node scripts/opd-wait.mjs --job-id ft-xxx --caller-name my-agent
```

## Baselines and capacity

Bundled `assets/` baselines are dated snapshots of historically successful
requests (public model names and parameters only). Default to the all-explicit
9B←397B baseline for a first run; 9B←Flash is the second choice.

| Layout                                     | mtu_capacity                 |
| ------------------------------------------ | ---------------------------- |
| Default student layout, 9B + Flash teacher | 24 (official recommendation) |
| Flash baseline custom layout               | 16                           |
| 397B baseline all-explicit                 | 24                           |

`mtu_capacity` must equal student GPUs + teacher GPUs. The server checks this
**after** job creation, so the preflight computes both layout interpretations
and warns on mismatch — treat the advice as advisory (teacher mode has no public
query API).

## Billing warning

OPD jobs are **MTU postpaid**: `mtu_spec_code × mtu_capacity`, charged while the
job runs. The consent gate exists to make that scope explicit before anything
is created. A poll timeout does not cancel the job.

## Troubleshooting (summary)

- Exit 2: local guard (missing MTU fields, wrong charge type, teacher TP ≠ GPUs
  per node, 0 training steps, mini-batch too large, schema violation) — nothing
  was created.
- Exit 3: log in (`--api-key` / `--console`).
- Create 500/timeout: trust the script's `duplicate_check`; attach to a possibly
  created job instead of resubmitting.
- FAILED "OPD requires N student GPUs + M teacher GPUs…": set capacity to N+M or
  change the layout, re-preflight, re-confirm, submit as a new job.
- batch-fit blocked ("0 training steps"): `batch_size` is the samples-per-step;
  add data to at least `ceil(batch_size / n_epochs)` samples with headroom, or
  lower `batch_size` / raise `n_epochs`. Zero-step jobs fail at execution time,
  after billing starts.
- Never fill the parameter API's `recommend_value` into requests — it is not the
  teacher's effective default.

Full triage table and hard rules: [SKILL.md](SKILL.md).
