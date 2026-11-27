---
name: bailian-opd
metadata:
  version: "2.12.1"
  requires:
    bins: ["bl", "node"]
description: >-
  Guided end-to-end pure Model OPD distillation (pg_opd) on Alibaba Cloud Bailian:
  authorize → dataset validate → parameter probes → dry-run consent gate →
  confirmed submit → verified terminal state, driven by deterministic scripts.
  Use when the user wants to distill a student model from a teacher model
  (teacher_model / OPD / 蒸馏 / 在线蒸馏) and run the whole creation chain safely.
  Not for RL / agentic rollout training, SFT/DPO/CPT fine-tuning, or deployment
  (those go to bailian-finetune); not for model selection advice
  (bailian-model-recommend).
---

# Bailian OPD Distillation Workflow

Create a pure Model OPD training job (`training_type=pg_opd`, top-level
`teacher_model`, no rollout/reward functions, no Function Compute) with the
highest possible first-run success rate. Gate logic lives in deterministic
scripts under `scripts/`; the agent orchestrates, presents findings, and obtains
consent — it does not re-implement gates or guess flags.

> **CRITICAL — shared protocol first.** Before executing anything, Read
> `../bailian-protocol/SKILL.md` and follow it: mandatory version pre-flight
> before the first `bl` call, consent classes, attribution, error reporting,
> output conventions. If the protocol skill is missing, stop and prompt
> `bl skill init`. Business context for OPD flags lives in skill
> `bailian-finetune` (its `reference/finetune.md`) or `bl finetune opd --help` —
> never guess flags.

## Attribution

Bundled scripts already carry the protocol `script` attribution
(`BAILIAN_CALLER_TYPE=script`, `BAILIAN_CALLER_NAME` from `--caller-name`).
For inline `bl` commands the agent runs itself, use the protocol `agent`
template, e.g.:

```bash
BAILIAN_CALLER_TYPE=agent BAILIAN_CALLER_NAME=codex BAILIAN_SKILL_NAME=bailian-opd BAILIAN_SKILL_VERSION=2.10.2 bl finetune opd authorize --authorize --yes
```

## Prerequisites

- `bl` installed and up to date (protocol version pre-flight); `node` >= 18 on PATH.
- **Two logins**: API key (`bl auth login --api-key`) for data/params/create, and
  Console (`bl auth login --console`) for the OPD feature authorize probe.
- OPD is invite-only (邀测): the account whitelist must be enabled. Published
  student/teacher pairs and sizing: the official OPD docs "模型与训练单元"
  section (the CLI warns on unpublished pairs).

## Workflow (steps 0–7)

### 0. Protocol pre-flight

Run the protocol version pre-flight; check `node --version` (>= 18) and
`bl auth status`. Missing Console login blocks only the authorize stage — the
preflight report still surfaces everything else.

### 1. Chain-start authorization

Disclose before any probe: OPD training is **MTU postpaid billing**
(`mtu_spec_code × mtu_capacity`, charged while the job runs). Obtain the user's
consent to start the read-only preflight. This consent covers the authorize
probe's `--yes` (the runtime risk gate requires it even for the read-only
probe; the probe never enables anything).

### 2. Choose a baseline (do not improvise hyper-parameters)

Default to the **all-explicit 9B←397B baseline** for a first run — every teacher
resource field is explicit, so nothing depends on server defaults and capacity
is fully computable:

```bash
node scripts/opd-preflight.mjs \
  --base-model qwen3.5-9b --teacher-model qwen3.5-397b-a17b \
  --datasets <train.jsonl> --validations <valid.jsonl> \
  --hyper-parameters-file assets/baseline-9b-from-397b.hyper_parameters.json \
  --resource-config-file assets/baseline-9b-from-397b.resource_config.json \
  --caller-name <host>
```

Second choice: `assets/baseline-9b-from-flash.*` (9B←qwen3.8-flash, teacher
fields omitted → server fills Flash defaults). Capacity guide:

| Layout                                                             | mtu_capacity                                                                 |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Default student layout (layout fields omitted), 9B + Flash teacher | 24 (official recommendation; observed default = 16 student + 8 teacher GPUs) |
| Flash baseline custom layout (4/2 GPUs)                            | 16                                                                           |
| 397B baseline all-explicit (8/8 GPUs + 8 teacher)                  | 24                                                                           |

Baselines are dated snapshots of historically successful requests — never
"improve" them; apply overrides only when the user explicitly asks. Data format:
JSONL, `messages` with system (task) + user (input); prompt-only is valid for
pure distillation; `rollout_extra.solution` passes through untouched. Data size:
`batch_size` is the samples-per-step, so the training set needs at least
`ceil(batch_size / n_epochs)` effective samples for one step — the preflight
`batch-fit` stage computes the step count and blocks zero-step configurations
(they fail at execution time, after billing starts).

### 3. Preflight report and remediation

Run `opd-preflight.mjs` (read-only; aggregates all stages in one pass). Present
the report. Blocked stages → follow their `remediation`:

- Console login missing → `bl auth login --console`.
- Service roles `REQUIRES_USER_ACTION` → surface the manual authorization links
  verbatim; the CLI never creates roles.
- `business-enabled: MISSING` → **only after explicit user confirmation**, run
  inline: `bl finetune opd authorize --authorize --yes`. The scripts never enable.
- Empty parameter schema → the student is not registered for pg_opd; pick a
  published student.
- Workspace 400/403 → the workspace does not match the API key; fix
  `--workspace-id` / config.
- `batch-fit` blocked (0 training steps) → add data to at least
  `ceil(batch_size / n_epochs)` samples with headroom, or lower `batch_size` /
  raise `n_epochs`; re-run preflight.

Re-run preflight after remediation until no stage is blocked.

### 4. Consent gate (mandatory, verbatim)

Present to the user, verbatim from the report:

- `body_preview` (the exact request body),
- every warning (`OPD_PAIR_NOT_PUBLISHED`, `OPD_DEFAULT_LAYOUT_CAPACITY`,
  `OPD_LENGTH_EXCEEDS_TEACHER`, `OPD_BATCH_FIT_UNKNOWN`,
  `OPD_WARMUP_EXCEEDS_STEPS`, `OPD_INTERVAL_EXCEEDS_STEPS`, capacity advice,
  dataset warnings),
- `pending_uploads` (local files that will be uploaded),
- billing scope: `mtu_spec_code × mtu_capacity`, MTU postpaid, charged until the
  job reaches a terminal state.

Obtain explicit confirmation. **Any scope change (model, teacher, data,
capacity, hyper-parameters) requires re-running preflight and re-confirming.**
Never add `--yes` or `--confirmed` automatically.

### 5. Confirmed submit

```bash
node scripts/opd-submit.mjs <same assembly flags> --confirmed --caller-name <host>
```

The script passes `--yes` to `bl finetune opd run` only because `--confirmed`
was given after step 4. Local paths are validated and uploaded inside this run.
On create failure/timeout the script **never retries**; it runs a
duplicate-creation guard (the server can persist a job and still return 500) and
reports `duplicate_check`. `possibly_created` → attach to that job, do not
resubmit. `unknown` → stop and report the uncertainty.

### 6. Monitor to a verified terminal state

```bash
node scripts/opd-wait.mjs --job-id <ft-xxx> [--interval 30] [--poll-timeout 3600] --caller-name <host>
```

(or `opd-submit.mjs … --confirmed --wait`). Creation returning a job id is NOT
success: capacity mismatches fail at execution time, after billing starts.
Poll timeout (exit 5) ≠ failure — the job was not canceled; resume with the
printed command, never resubmit.

### 7. Verified success and hand-off

Success = terminal `SUCCEEDED` **and** checkpoints listed (the wait script
includes them). Give the protocol one-line summary. Export / deployment /
metrics → soft hand-off to skill `bailian-finetune` (`bl finetune checkpoints /
export / metrics`, then `bl deploy`). Listing jobs: `bl finetune list` (there is
no `opd list`).

## Failure triage

| Signal                                                                                   | Meaning                                                                                                                             | Action                                                                                                                  |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| exit 2                                                                                   | usage / local guard (missing MTU fields, bad charge_type, TP ≠ GPUs/node, 0 training steps, mini-batch too large, schema violation) | fix inputs; nothing was uploaded or created                                                                             |
| exit 3                                                                                   | auth missing                                                                                                                        | `bl auth login --api-key` / `--console`                                                                                 |
| exit 5                                                                                   | poll timeout                                                                                                                        | job still alive; resume waiting                                                                                         |
| exit 6                                                                                   | network                                                                                                                             | retry the read-only step; never blind-retry create                                                                      |
| exit 7                                                                                   | `requires_confirmation`                                                                                                             | normal control flow — obtain consent, then `--yes`/`--confirmed`                                                        |
| create 500 / timeout                                                                     | job may exist anyway                                                                                                                | trust `duplicate_check`; attach or stop-and-report                                                                      |
| FAILED message "OPD requires N student GPUs + M teacher GPUs, but the MTU capacity is K" | execution-phase capacity mismatch                                                                                                   | set capacity N+M (or change layout), re-preflight, re-confirm, submit as a NEW job                                      |
| batch-fit blocked / exit 2 "0 training steps"                                            | samples × n_epochs < batch_size (samples per step)                                                                                  | add data to ≥ ceil(batch_size / n_epochs) with headroom, or lower batch_size / raise n_epochs; re-preflight, re-confirm |
| FAILED length errors                                                                     | student lengths exceed teacher limit                                                                                                | keep `max_length`/`max_prompt_length` ≤ teacher `max_model_len` (Flash/Max default 16385); re-confirm                   |

## Anti-patterns (hard rules)

- Never fill the parameter API's `recommend_value` into requests — it is not the
  selected teacher's effective default (Flash/Max teacher max length 16385 vs
  the generic 33792/34816).
- Never hardcode teacher defaults into requests; omitted teacher fields are
  resolved by the server.
- Never pass `--yes` to `opd run` or `--confirmed` to the submit script without
  explicit user confirmation of the exact scope.
- Never blind-retry a create; a timeout is not a rejection.
- `opd authorize` exit 0 does NOT mean enabled — parse `ok` / `checks`.
- Treat capacity advice as advisory: teacher mode (internal/external) has no
  public query API, so the scripts compute both interpretations and warn.

## References

- Shared execution protocol: `../bailian-protocol/SKILL.md`
- OPD command flags and domain rules: skill `bailian-finetune`, `bl finetune opd --help`
- User-facing intro: `README.md` / `README.zh.md`
