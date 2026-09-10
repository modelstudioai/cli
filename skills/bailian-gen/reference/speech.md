# `bl speech` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                       | Authentication | Description                                                       |
| ----------------------------- | -------------- | ----------------------------------------------------------------- |
| `bl speech recognize`         | API Key        | Recognize speech from audio files (FunAudio-ASR / Qwen-ASR Flash) |
| `bl speech synthesize`        | API Key        | Synthesize speech from text                                       |
| `bl speech vocabulary create` | API Key        | Create a precompiled hot-word vocabulary for ASR                  |
| `bl speech vocabulary delete` | API Key        | Delete a precompiled hot-word vocabulary                          |
| `bl speech vocabulary get`    | API Key        | Get details of a precompiled hot-word vocabulary                  |
| `bl speech vocabulary list`   | API Key        | List precompiled hot-word vocabularies                            |
| `bl speech vocabulary update` | API Key        | Replace the contents of a precompiled hot-word vocabulary         |

## Command details

### `bl speech recognize`

| Field              | Value                                                             |
| ------------------ | ----------------------------------------------------------------- |
| **Name**           | `speech recognize`                                                |
| **Description**    | Recognize speech from audio files (FunAudio-ASR / Qwen-ASR Flash) |
| **Authentication** | API Key                                                           |
| **Usage**          | `bl speech recognize --url <audio-url> [flags]`                   |

#### Flags

| Flag                        | Type   | Required | Description                                                                                                                                                                                                                                          |
| --------------------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--url <url>`               | array  | yes      | Audio file URL or local file path (repeatable, max 100)                                                                                                                                                                                              |
| `--model <model>`           | string | no       | Model ID (default: configured Profile ASR model, otherwise fun-asr). Async: fun-asr / _-filetrans / paraformer-_; sync: qwen3-asr-flash* / fun-asr-flash* / qwen-audio-\*-asr-flash                                                                  |
| `--language <lang>`         | string | no       | Language hint (e.g. zh, en, ja). Classic async/input-audio: language_hints; qwen3-filetrans: language; qwen3 sync: asr_options.language                                                                                                              |
| `--diarization`             | switch | no       | Enable automatic speaker diarization                                                                                                                                                                                                                 |
| `--speaker-count <n>`       | number | no       | Expected number of speakers (requires --diarization)                                                                                                                                                                                                 |
| `--vocabulary-id <id>`      | string | no       | Pre-built hot-word vocabulary ID (create it via `speech vocabulary create`). Its target_model must exactly match --model, otherwise it is silently ignored. Wider model support than --vocabulary, including Fun-ASR and Paraformer                  |
| `--vocabulary <json>`       | string | no       | Instant hot words as JSON object of word→weight, e.g. '{"Fendouzhe":4}'. Weight 1-5 (4 recommended; higher values can hurt other words), 50 for super hot word. No pre-built vocabulary needed. Takes effect only on Qwen-Audio-3.0-ASR-Flash models |
| `--context <text>`          | string | no       | Context enhancement word list to improve accuracy on proper nouns; must contain the target words themselves (a topic description alone has little effect); max 400 chars. Takes effect only on Qwen-Audio-3.0-ASR-Flash and Fun-ASR-Flash models     |
| `--channel-id <n>`          | number | no       | Audio channel ID (default: 0)                                                                                                                                                                                                                        |
| `--out <path>`              | string | no       | Save full transcription result to JSON file                                                                                                                                                                                                          |
| `--async`                   | switch | no       | Return async task id without waiting                                                                                                                                                                                                                 |
| `--poll-interval <seconds>` | number | no       | Polling interval in seconds (default: 2)                                                                                                                                                                                                             |
| `--api-key <key>`           | string | no       | API key                                                                                                                                                                                                                                              |
| `--base-url <url>`          | string | no       | API base URL                                                                                                                                                                                                                                         |

#### Examples

```bash
bl speech recognize --url https://example.com/audio.mp3
```

```bash
bl speech recognize --url https://example.com/a.mp3 --url https://example.com/b.mp3
```

```bash
bl speech recognize --url https://example.com/meeting.wav --diarization --speaker-count 3
```

```bash
bl speech recognize --url https://example.com/audio.mp3 --language zh
```

```bash
bl speech recognize --url https://example.com/audio.mp3 --vocabulary-id vocab-abc123
```

```bash
bl speech recognize --url https://example.com/audio.mp3 --model qwen-audio-3.0-asr-flash-filetrans --vocabulary '{"奋斗者":4,"鲸落":4}'
```

```bash
bl speech recognize --url https://example.com/audio.mp3 --model qwen-audio-3.0-asr-flash-filetrans --context "奋斗者号 鲸落 深海勇士"
```

```bash
bl speech recognize --url https://example.com/audio.mp3 --out result.json
```

```bash
bl speech recognize --url https://example.com/audio.mp3 --async --quiet
```

```bash
bl speech recognize --url https://example.com/audio.mp3 --model qwen-audio-3.0-asr-flash --language en
```

### `bl speech synthesize`

| Field              | Value                                        |
| ------------------ | -------------------------------------------- |
| **Name**           | `speech synthesize`                          |
| **Description**    | Synthesize speech from text                  |
| **Authentication** | API Key                                      |
| **Usage**          | `bl speech synthesize --text <text> [flags]` |

#### Flags

| Flag                             | Type   | Required | Description                                                                                                               |
| -------------------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `--text <text>`                  | string | no       | Text to synthesize into speech (or use --text-file)                                                                       |
| `--text-file <path>`             | string | no       | Read text from a file instead of --text                                                                                   |
| `--model <model>`                | string | no       | Model ID (default: configured Profile TTS model, otherwise cosyvoice-v3-flash). System voices vary by model               |
| `--voice <voice>`                | string | no       | Voice ID. Use --list-voices to see built-in voices for cosyvoice-v3-flash; for v3.5-flash provide a clone/design voice ID |
| `--list-voices`                  | switch | no       | List built-in system voices for the selected model and exit (console link shown in output)                                |
| `--format <mp3\|pcm\|wav\|opus>` | string | no       | Audio format: mp3, pcm, wav, opus (default: mp3; streaming default: pcm)                                                  |
| `--sample-rate <rate>`           | string | no       | Audio sample rate in Hz (e.g. 24000)                                                                                      |
| `--volume <volume>`              | string | no       | Volume 0-100 (default: 50)                                                                                                |
| `--rate <rate>`                  | string | no       | Speech rate 0.5-2.0 (default: 1.0)                                                                                        |
| `--pitch <pitch>`                | string | no       | Pitch multiplier 0.5-2.0 (default: 1.0)                                                                                   |
| `--seed <seed>`                  | string | no       | Random seed 0-65535 for reproducible synthesis                                                                            |
| `--language <lang>`              | string | no       | Language hint (e.g. zh, en, ja, ko, fr, de)                                                                               |
| `--instruction <text>`           | string | no       | Natural language instruction to control speech style (e.g. "Use a gentle tone"）                                          |
| `--enable-ssml`                  | switch | no       | Enable SSML markup parsing in input text                                                                                  |
| `--out <path>`                   | string | no       | Save audio to file (default: auto-generate in temp dir)                                                                   |
| `--stream`                       | switch | no       | Stream raw PCM audio to stdout (pipe to player)                                                                           |
| `--concurrent <n>`               | number | no       | Run N parallel requests (default: 1)                                                                                      |
| `--api-key <key>`                | string | no       | API key                                                                                                                   |
| `--base-url <url>`               | string | no       | API base URL                                                                                                              |

#### Examples

```bash
bl speech synthesize --list-voices --model cosyvoice-v3-flash
```

```bash
bl speech synthesize --text "Hello, I am Qwen" --voice <voice_id>
```

```bash
bl speech synthesize --text "Hello world" --voice <voice_id> --language en
```

```bash
bl speech synthesize --text-file script.txt --out speech.wav --voice <voice_id>
```

```bash
bl speech synthesize --text "Today is a good day" --voice <voice_id> --instruction "Use a gentle tone"
```

```bash
bl speech synthesize --text "Hello" --voice <voice_id> --format wav --sample-rate 24000
```

```bash
# Stream to audio player (macOS)
```

```bash
bl speech synthesize --text "Hello" --voice <voice_id> --stream | afplay -
```

```bash
# Pipe to ffplay
```

```bash
bl speech synthesize --text "Hello" --voice <voice_id> --stream | ffplay -nodisp -autoexit -f s16le -ar 24000 -ac 1 -
```

### `bl speech vocabulary create`

| Field              | Value                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| **Name**           | `speech vocabulary create`                                                                                      |
| **Description**    | Create a precompiled hot-word vocabulary for ASR                                                                |
| **Authentication** | API Key                                                                                                         |
| **Usage**          | `bl speech vocabulary create --model <model> --prefix <prefix> (--words <json> \| --words-file <path>) [flags]` |

#### Flags

| Flag                  | Type   | Required | Description                                                                                                                                                                                                                                                                    |
| --------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--model <model>`     | string | yes      | ASR model this vocabulary is built for (required). Must exactly match the --model passed to `speech recognize` later, otherwise the vocabulary is silently ignored                                                                                                             |
| `--prefix <prefix>`   | string | yes      | Custom vocabulary prefix (required). Digits and lowercase letters only, max 10 chars                                                                                                                                                                                           |
| `--words <json>`      | string | no       | Hot words as JSON object of word→weight, e.g. '{"Fendouzhe":4}'; or the API entry array for per-entry lang. Weight 1-5 (4 recommended); when the vocabulary target_model is a Qwen-Audio-3.0-ASR-Flash series model, 50 is also allowed as super hot word. Or use --words-file |
| `--words-file <path>` | string | no       | JSON file with the hot words (use - for stdin)                                                                                                                                                                                                                                 |
| `--lang <code>`       | string | no       | Language code applied to every hot word when using object form (optional; ignored for array form). Paraformer: zh/en/ja/yue/ko/de/fr/ru; Fun-ASR: zh/en/ja                                                                                                                     |
| `--api-key <key>`     | string | no       | API key                                                                                                                                                                                                                                                                        |
| `--base-url <url>`    | string | no       | API base URL                                                                                                                                                                                                                                                                   |

#### Notes

- The --model must exactly match the --model used later with `speech recognize --vocabulary-id`; a mismatch causes silent failure with no error.
- Each account may have at most 10 vocabularies; updates must be at least 5 minutes apart. See improve-asr-accuracy for full limits.
- Hot-word vocabularies are not supported in Singapore sub-workspaces; the server error is passed through as-is.
- Weight 1-5 (4 recommended); when the vocabulary target_model is a Qwen-Audio-3.0-ASR-Flash series model, 50 is also allowed as super hot word.

#### Examples

```bash
bl speech vocabulary create --model fun-asr --prefix demo --words '{"Fendouzhe":4,"Jingluo":4}'
```

```bash
bl speech vocabulary create --model paraformer-v2 --prefix demo --words '[{"text":"Fendouzhe","weight":4,"lang":"zh"}]'
```

```bash
bl speech vocabulary create --model fun-asr --prefix demo --words '{"Fendouzhe":4}' --lang zh
```

```bash
bl speech vocabulary create --model fun-asr --prefix demo --words-file ./hotwords.json
```

```bash
bl speech vocabulary create --model fun-asr --prefix demo --words '{"Fendouzhe":4}' --quiet
```

### `bl speech vocabulary delete`

| Field              | Value                                                                            |
| ------------------ | -------------------------------------------------------------------------------- |
| **Name**           | `speech vocabulary delete`                                                       |
| **Description**    | Delete a precompiled hot-word vocabulary                                         |
| **Authentication** | API Key                                                                          |
| **Usage**          | `bl speech vocabulary delete --id <id>`                                          |
| **Risk**           | `high`                                                                           |
| **Risk message**   | This permanently deletes the specified hot-word vocabulary and cannot be undone. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag               | Type   | Required | Description                       |
| ------------------ | ------ | -------- | --------------------------------- |
| `--id <id>`        | string | yes      | Hot-word vocabulary ID (required) |
| `--yes`            | switch | no       | Confirm this high-risk operation  |
| `--api-key <key>`  | string | no       | API key                           |
| `--base-url <url>` | string | no       | API base URL                      |

#### Examples

```bash
bl speech vocabulary delete --id vocab-demo-xxx --dry-run
```

```bash
# Only after explicit user confirmation:
bl speech vocabulary delete --id vocab-demo-xxx --yes
```

### `bl speech vocabulary get`

| Field              | Value                                            |
| ------------------ | ------------------------------------------------ |
| **Name**           | `speech vocabulary get`                          |
| **Description**    | Get details of a precompiled hot-word vocabulary |
| **Authentication** | API Key                                          |
| **Usage**          | `bl speech vocabulary get --id <id>`             |

#### Flags

| Flag               | Type   | Required | Description                       |
| ------------------ | ------ | -------- | --------------------------------- |
| `--id <id>`        | string | yes      | Hot-word vocabulary ID (required) |
| `--api-key <key>`  | string | no       | API key                           |
| `--base-url <url>` | string | no       | API base URL                      |

#### Notes

- Use this command to confirm target_model before calling `speech recognize --vocabulary-id`; a model mismatch causes silent failure.

#### Examples

```bash
bl speech vocabulary get --id vocab-demo-xxx
```

```bash
bl speech vocabulary get --id vocab-demo-xxx --quiet
```

### `bl speech vocabulary list`

| Field              | Value                                                                          |
| ------------------ | ------------------------------------------------------------------------------ |
| **Name**           | `speech vocabulary list`                                                       |
| **Description**    | List precompiled hot-word vocabularies                                         |
| **Authentication** | API Key                                                                        |
| **Usage**          | `bl speech vocabulary list [--prefix <prefix>] [--page <n>] [--page-size <n>]` |

#### Flags

| Flag                | Type   | Required | Description                                                                       |
| ------------------- | ------ | -------- | --------------------------------------------------------------------------------- |
| `--prefix <prefix>` | string | no       | Filter by vocabulary prefix                                                       |
| `--page <n>`        | number | no       | Page number, 1-based (default: 1). Mapped to API page_index (0-based) as page - 1 |
| `--page-size <n>`   | number | no       | Results per page (default: 10)                                                    |
| `--api-key <key>`   | string | no       | API key                                                                           |
| `--base-url <url>`  | string | no       | API base URL                                                                      |

#### Notes

- List responses do not include target_model; use `speech vocabulary get` to inspect the model a vocabulary was built for.
- Vocabularies with status UNDEPLOYED are silently ignored by ASR.

#### Examples

```bash
bl speech vocabulary list
```

```bash
bl speech vocabulary list --prefix demo
```

```bash
bl speech vocabulary list --page 2 --page-size 20
```

### `bl speech vocabulary update`

| Field              | Value                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| **Name**           | `speech vocabulary update`                                                                                      |
| **Description**    | Replace the contents of a precompiled hot-word vocabulary                                                       |
| **Authentication** | API Key                                                                                                         |
| **Usage**          | `bl speech vocabulary update --id <id> (--words <json> \| --words-file <path>) [flags]`                         |
| **Risk**           | `high`                                                                                                          |
| **Risk message**   | This fully replaces all hot words in the vocabulary. Entries not listed will be discarded and cannot be undone. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                  | Type   | Required | Description                                                                                                                                                                                                                                                                    |
| --------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--id <id>`           | string | yes      | Hot-word vocabulary ID (required)                                                                                                                                                                                                                                              |
| `--words <json>`      | string | no       | Hot words as JSON object of word→weight, e.g. '{"Fendouzhe":4}'; or the API entry array for per-entry lang. Weight 1-5 (4 recommended); when the vocabulary target_model is a Qwen-Audio-3.0-ASR-Flash series model, 50 is also allowed as super hot word. Or use --words-file |
| `--words-file <path>` | string | no       | JSON file with the hot words (use - for stdin)                                                                                                                                                                                                                                 |
| `--lang <code>`       | string | no       | Language code applied to every hot word when using object form (optional; ignored for array form). Paraformer: zh/en/ja/yue/ko/de/fr/ru; Fun-ASR: zh/en/ja                                                                                                                     |
| `--yes`               | switch | no       | Confirm this high-risk operation                                                                                                                                                                                                                                               |
| `--api-key <key>`     | string | no       | API key                                                                                                                                                                                                                                                                        |
| `--base-url <url>`    | string | no       | API base URL                                                                                                                                                                                                                                                                   |

#### Notes

- update is a full replace, not an append. Prefer --dry-run first to preview the complete vocabulary that will be written.
- Each account may have at most 10 vocabularies; updates must be at least 5 minutes apart. See improve-asr-accuracy for full limits.
- Hot-word vocabularies are not supported in Singapore sub-workspaces; the server error is passed through as-is.
- Weight 1-5 (4 recommended); when the vocabulary target_model is a Qwen-Audio-3.0-ASR-Flash series model, 50 is also allowed as super hot word.

#### Examples

```bash
bl speech vocabulary update --id vocab-demo-xxx --words '{"Fendouzhe":4}' --dry-run
```

```bash
# Only after explicit user confirmation:
bl speech vocabulary update --id vocab-demo-xxx --words '{"Fendouzhe":4,"Jingluo":4}' --yes
```
