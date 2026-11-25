# `bl speech` commands

> Auto-generated from `packages/cli/src/commands.ts`. Do not edit by hand.
> Regenerate: `pnpm --filter bailian-cli run generate:reference`.

Index: [index.md](index.md)

## Commands in this group

| Command                       | Authentication | Description                                                       |
| ----------------------------- | -------------- | ----------------------------------------------------------------- |
| `bl speech generate`          | API Key        | Generate podcast/dialogue audio content from a text prompt        |
| `bl speech recognize`         | API Key        | Recognize speech from audio files (FunAudio-ASR / Qwen-ASR Flash) |
| `bl speech synthesize`        | API Key        | Synthesize speech from text                                       |
| `bl speech vocabulary create` | API Key        | Create a precompiled hot-word vocabulary for ASR                  |
| `bl speech vocabulary delete` | API Key        | Delete a precompiled hot-word vocabulary                          |
| `bl speech vocabulary get`    | API Key        | Get details of a precompiled hot-word vocabulary                  |
| `bl speech vocabulary list`   | API Key        | List precompiled hot-word vocabularies                            |
| `bl speech vocabulary update` | API Key        | Replace the contents of a precompiled hot-word vocabulary         |
| `bl speech voice clone`       | API Key        | Clone a custom voice from reference audio                         |
| `bl speech voice delete`      | API Key        | Delete a custom voice                                             |
| `bl speech voice design`      | API Key        | Design a custom voice from a text description                     |
| `bl speech voice get`         | API Key        | Get details of a custom voice                                     |
| `bl speech voice list`        | API Key        | List custom voices                                                |
| `bl speech voice preview`     | API Key        | Fetch the reference audio URL for a cloned voice                  |
| `bl speech voice update`      | API Key        | Update the reference audio of a cloned voice                      |

## Command details

### `bl speech generate`

| Field              | Value                                                                     |
| ------------------ | ------------------------------------------------------------------------- |
| **Name**           | `speech generate`                                                         |
| **Description**    | Generate podcast/dialogue audio content from a text prompt                |
| **Authentication** | API Key                                                                   |
| **Usage**          | `bl speech generate --text-prompt <text> [--audio <url-or-path>] [flags]` |

#### Flags

| Flag                    | Type    | Required | Description                                                                                                                               |
| ----------------------- | ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `--text-prompt <text>`  | string  | yes      | Audio generation prompt (up to 3000 characters)                                                                                           |
| `--audio <url-or-path>` | array   | no       | Reference audio URL, local file, or Data URI (repeatable, up to 3; WAV/MP3/OGG Opus only). Referenced in order as @voice1/@voice2/@voice3 |
| `--model <model>`       | string  | no       | Model id (default: qwen-audio-3.1-tts-next)                                                                                               |
| `--workspace-id <id>`   | string  | no       | Workspace ID for the default MaaS endpoint (or set BAILIAN_WORKSPACE_ID)                                                                  |
| `--format <fmt>`        | string  | no       | Output format: wav / mp3 / pcm (default: wav)                                                                                             |
| `--sample-rate <hz>`    | number  | no       | Sample rate: 8000 / 16000 / 24000 / 44100 / 48000                                                                                         |
| `--channels <n>`        | number  | no       | Channels: 1 or 2                                                                                                                          |
| `--volume <n>`          | number  | no       | Volume 0-100 (integer)                                                                                                                    |
| `--rate <n>`            | number  | no       | Speech rate 0.5-2                                                                                                                         |
| `--seed <n>`            | number  | no       | Random seed (integer)                                                                                                                     |
| `--aigc-tag <bool>`     | boolean | no       | Enable AIGC tag (enable_aigc_tag)                                                                                                         |
| `--enable-cbr <bool>`   | boolean | no       | Enable MP3 CBR encoding (MP3 only)                                                                                                        |
| `--bit-rate <bps>`      | number  | no       | MP3 bit rate when CBR is enabled                                                                                                          |
| `--quality <0-9>`       | number  | no       | MP3 VBR quality 0-9 (when CBR is off)                                                                                                     |
| `--out-dir <path>`      | string  | no       | Output directory for the generated audio                                                                                                  |
| `--out-prefix <text>`   | string  | no       | Filename prefix (basename only; cannot escape the output directory)                                                                       |
| `--api-key <key>`       | string  | no       | API key                                                                                                                                   |
| `--base-url <url>`      | string  | no       | API base URL                                                                                                                              |

#### Notes

- Unlike `speech synthesize`, this command uses text_prompt/references and does not accept system or cloned voice IDs.
- Default endpoint is Beijing MaaS and needs a workspace ID. For Singapore or other hosts, set --base-url / DASHSCOPE_BASE_URL / Profile base_url explicitly (for example https://<ws>.ap-southeast-1.maas.aliyuncs.com); that override does not require workspace.

#### Examples

```bash
bl speech generate --workspace-id <id> --text-prompt "Generate a short podcast about city nightscapes." --dry-run --output json
```

```bash
bl speech generate --workspace-id <id> --text-prompt "Introduce today's weather with @voice1." --audio ./reference.wav --out-dir ./audio
```

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
| `--model <model>`           | string | no       | Model ID (default: configured Profile ASR model, otherwise fun-asr). Async: fun-asr / _-filetrans / paraformer-_; sync: qwen3-asr-flash* / fun-asr-flash* / qwen-audio-*-asr-flash                                                                   |
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

#### Notes

- Model "auto" (via --model auto or a config default model of "auto") routes to the official Bailian MCP with a reduced parameter set and simplified text output; MCP-incompatible flags fail fast with a usage error instead of falling back to REST.

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

| Flag                             | Type   | Required | Description                                                                                                                                                                                |
| -------------------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--text <text>`                  | string | no       | Text to synthesize into speech (or use --text-file)                                                                                                                                        |
| `--text-file <path>`             | string | no       | Read text from a file instead of --text                                                                                                                                                    |
| `--model <model>`                | string | no       | Model ID (default: configured Profile TTS model, otherwise qwen-audio-3.1-tts-flash). System voices vary by model                                                                          |
| `--voice <voice>`                | string | no       | Voice ID. Use --list-voices for the selected model (e.g. qwen-audio-3.1-tts-flash/plus, qwen-audio-3.0-tts-plus/flash, cosyvoice-v3-flash); for v3.5-flash provide a clone/design voice ID |
| `--list-voices`                  | switch | no       | List built-in system voices for the selected model and exit (console link shown in output)                                                                                                 |
| `--format <mp3\|pcm\|wav\|opus>` | string | no       | Audio format: mp3, pcm, wav, opus (default: mp3; streaming default: pcm)                                                                                                                   |
| `--sample-rate <rate>`           | string | no       | Audio sample rate in Hz (e.g. 24000)                                                                                                                                                       |
| `--volume <volume>`              | string | no       | Volume 0-100 (default: 50)                                                                                                                                                                 |
| `--rate <rate>`                  | string | no       | Speech rate 0.5-2.0 (default: 1.0)                                                                                                                                                         |
| `--pitch <pitch>`                | string | no       | Pitch multiplier 0.5-2.0 (default: 1.0)                                                                                                                                                    |
| `--seed <seed>`                  | string | no       | Random seed 0-65535 for reproducible synthesis                                                                                                                                             |
| `--language <lang>`              | string | no       | Language hint (e.g. zh, en, ja, ko, fr, de)                                                                                                                                                |
| `--instruction <text>`           | string | no       | Natural language instruction to control speech style (e.g. "Use a gentle tone"）                                                                                                           |
| `--enable-ssml`                  | switch | no       | Enable SSML markup parsing in input text                                                                                                                                                   |
| `--out <path>`                   | string | no       | Save audio to file (default: auto-generate in temp dir)                                                                                                                                    |
| `--stream`                       | switch | no       | Stream raw PCM audio to stdout (pipe to player); JSON output requires --out                                                                                                                |
| `--concurrent <n>`               | number | no       | Run N parallel requests (default: 1)                                                                                                                                                       |
| `--api-key <key>`                | string | no       | API key                                                                                                                                                                                    |
| `--base-url <url>`               | string | no       | API base URL                                                                                                                                                                               |

#### Notes

- Built-in default (when --model and Profile default_speech_model are both unset) is qwen-audio-3.1-tts-flash. Voice IDs are model-specific: keep CosyVoice voices such as longanyang only with --model cosyvoice-v3-flash; for the new default use matching IDs (e.g. longanlingxin_v3.1) via --list-voices.
- Model "auto" (via --model auto or a config default model of "auto") routes to the official Bailian MCP with a reduced parameter set; MCP-incompatible flags fail fast with a usage error instead of falling back to REST.

#### Examples

```bash
# Ordinary API Key
```

```bash
bl speech synthesize --list-voices --model qwen-audio-3.1-tts-flash
```

```bash
bl speech synthesize --list-voices --model cosyvoice-v3-flash
```

```bash
bl speech synthesize --text "Hello, I am Qwen" --model qwen-audio-3.1-tts-flash --voice longanlingxin_v3.1
```

```bash
# Token Plan (omit --model to use Profile default qwen-audio-3.0-tts-plus)
```

```bash
bl speech synthesize --text "Hello, I am Qwen" --voice longanlingxin
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

### `bl speech voice clone`

| Field              | Value                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------- |
| **Name**           | `speech voice clone`                                                                         |
| **Description**    | Clone a custom voice from reference audio                                                    |
| **Authentication** | API Key                                                                                      |
| **Usage**          | `bl speech voice clone --audio <url-or-path> --prefix <text> --target-model <model> [flags]` |

#### Flags

| Flag                                  | Type    | Required | Description                                                                                                                                                                                                                 |
| ------------------------------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--audio <url-or-path>`               | string  | yes      | Reference audio URL or local file                                                                                                                                                                                           |
| `--prefix <text>`                     | string  | yes      | Name prefix (CosyVoice/Qwen-Audio: 1-10 alnum → prefix) or Omni preferred_name (1-16 alnum/underscore)                                                                                                                      |
| `--target-model <model>`              | string  | yes      | Target model for this voice (required). CosyVoice/Qwen-Audio → later `speech synthesize --model`; Omni CLI clone → qwen3.5-omni-flash/plus then `omni --model <same-target-model> --voice <id>` (Realtime targets rejected) |
| `--language-hint <code>`              | array   | no       | Language hint (at most one). CosyVoice/Qwen-Audio → language_hints[]; Omni → language                                                                                                                                       |
| `--volume-normalize <bool>`           | boolean | no       | Enable volume normalization (CosyVoice/Qwen-Audio; sent as string "true"/"false")                                                                                                                                           |
| `--max-prompt-audio-length <seconds>` | number  | no       | Max prompt audio length in seconds (3-30; CosyVoice/Qwen-Audio only)                                                                                                                                                        |
| `--preprocess <bool>`                 | boolean | no       | Enable audio preprocess (enable_preprocess; CosyVoice/Qwen-Audio only)                                                                                                                                                      |
| `--text <transcript>`                 | string  | no       | Transcript matching the reference audio (Omni only; optional)                                                                                                                                                               |
| `--voice-clone-mode <mode>`           | string  | no       | Omni voice_clone_mode: normal \| dialect \| crosslingual (optional for CLI-supported qwen3.5-omni-flash/plus)                                                                                                               |
| `--skip-audio-process <bool>`         | boolean | no       | Skip Omni audio preprocess (parameters.skip_audio_process; default false)                                                                                                                                                   |
| `--api-key <key>`                     | string  | no       | API key                                                                                                                                                                                                                     |
| `--base-url <url>`                    | string  | no       | API base URL                                                                                                                                                                                                                |

#### Notes

- You must have the right to use the reference audio or described voice. Do not clone or imitate a real person without authorization.
- A voice ID is bound to its target model. Later `speech synthesize --model` or `omni --model` must match the clone --target-model.
- CosyVoice/Qwen-Audio use model voice-enrollment (create_voice → voice_id). Review status DEPLOYING/OK/UNDEPLOYED — use `speech voice get` / `preview`.
- CLI Omni clone only supports non-realtime targets qwen3.5-omni-flash/plus (dated suffixes allowed) via qwen-voice-enrollment → output.voice → `omni --model <same-target-model> --voice <id>` (must match create --target-model; omitting --model is rejected with exit 2 when it would auto-switch qwen3.8-omni-flash to plus). Realtime (*-realtime) enrollment is rejected here (no Realtime command in this CLI). No get/update/preview/design for Omni.

#### Examples

```bash
bl speech voice clone --audio ./reference.wav --prefix demo --target-model cosyvoice-v3-flash --dry-run --output json
```

```bash
bl speech voice clone --audio https://example.com/ref.wav --prefix Demo01 --target-model cosyvoice-v3-flash --language-hint zh
```

```bash
bl speech voice clone --audio ./reference.wav --prefix guanyu --target-model qwen3.5-omni-flash --language-hint zh --dry-run --output json
```

### `bl speech voice delete`

| Field              | Value                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `speech voice delete`                                                                                                |
| **Description**    | Delete a custom voice                                                                                                |
| **Authentication** | API Key                                                                                                              |
| **Usage**          | `bl speech voice delete --id <voice-id> [--target-model <model>]`                                                    |
| **Risk**           | `high`                                                                                                               |
| **Risk message**   | This permanently deletes the voice ID. Synthesis that still references it will fail and the action cannot be undone. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                     | Type   | Required | Description                                                                                                                             |
| ------------------------ | ------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `--id <voice-id>`        | string | yes      | Voice ID (required)                                                                                                                     |
| `--target-model <model>` | string | no       | Protocol switch only: any qwen3.x-omni* id selects qwen-voice-enrollment delete. Also auto-detected when --id starts with qwen-omni-vc- |
| `--yes`                  | switch | no       | Confirm this high-risk operation                                                                                                        |
| `--api-key <key>`        | string | no       | API key                                                                                                                                 |
| `--base-url <url>`       | string | no       | API base URL                                                                                                                            |

#### Notes

- Deletion is irreversible. Prefer --dry-run first to confirm the request body. CosyVoice/Qwen-Audio: delete_voice + voice_id. Omni: delete + voice.

#### Examples

```bash
bl speech voice delete --id <voice-id> --dry-run --output json
```

```bash
# Only after explicit user confirmation:
bl speech voice delete --id <voice-id> --yes
```

```bash
bl speech voice delete --id qwen-omni-vc-guanyu-voice-… --dry-run --output json
```

### `bl speech voice design`

| Field              | Value                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| **Name**           | `speech voice design`                                                                                         |
| **Description**    | Design a custom voice from a text description                                                                 |
| **Authentication** | API Key                                                                                                       |
| **Usage**          | `bl speech voice design --prompt <text> --preview-text <text> --prefix <text> --target-model <model> [flags]` |

#### Flags

| Flag                     | Type   | Required | Description                                                                              |
| ------------------------ | ------ | -------- | ---------------------------------------------------------------------------------------- |
| `--prompt <text>`        | string | yes      | Voice description (up to 500 characters)                                                 |
| `--preview-text <text>`  | string | yes      | Preview text spoken in the design sample (15-200 characters)                             |
| `--prefix <text>`        | string | yes      | Custom voice prefix. Digits and letters only, 1-10 characters                            |
| `--target-model <model>` | string | yes      | Target TTS model for this voice (required). Must match later `speech synthesize --model` |
| `--language-hint <code>` | array  | no       | Language hint (zh/en; at most one; server default: zh)                                   |
| `--sample-rate <hz>`     | number | no       | Preview sample rate: 16000 / 24000 / 48000 (server default: 24000)                       |
| `--format <fmt>`         | string | no       | Preview format: pcm / wav / mp3 (server default: wav)                                    |
| `--out <path>`           | string | no       | Local path for the preview audio (optional; defaults under the audio output dir)         |
| `--api-key <key>`        | string | no       | API key                                                                                  |
| `--base-url <url>`       | string | no       | API base URL                                                                             |

#### Notes

- You must have the right to use the reference audio or described voice. Do not clone or imitate a real person without authorization.
- A voice ID is bound to its target model. Later `speech synthesize --model` or `omni --model` must match the clone --target-model.
- The response includes a one-shot preview_audio (Base64). Querying the voice later may not return preview_audio again. Formal listen tests use `speech synthesize`.

#### Examples

```bash
bl speech voice design --prompt "Calm warm Chinese announcer" --preview-text "Welcome to today's program." --prefix demo --target-model cosyvoice-v3.5-plus --dry-run --output json
```

### `bl speech voice get`

| Field              | Value                                 |
| ------------------ | ------------------------------------- |
| **Name**           | `speech voice get`                    |
| **Description**    | Get details of a custom voice         |
| **Authentication** | API Key                               |
| **Usage**          | `bl speech voice get --id <voice-id>` |

#### Flags

| Flag               | Type   | Required | Description         |
| ------------------ | ------ | -------- | ------------------- |
| `--id <voice-id>`  | string | yes      | Voice ID (required) |
| `--api-key <key>`  | string | no       | API key             |
| `--base-url <url>` | string | no       | API base URL        |

#### Notes

- Status DEPLOYING/OK/UNDEPLOYED is returned as data, not as a CLI failure. Use `speech voice preview` for the reference audio URL when present.

#### Examples

```bash
bl speech voice get --id <voice-id> --output json
```

```bash
bl speech voice get --id <voice-id> --quiet
```

### `bl speech voice list`

| Field              | Value                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **Name**           | `speech voice list`                                                                              |
| **Description**    | List custom voices                                                                               |
| **Authentication** | API Key                                                                                          |
| **Usage**          | `bl speech voice list [--prefix <text>] [--target-model <model>] [--page <n>] [--page-size <n>]` |

#### Flags

| Flag                     | Type   | Required | Description                                                                                                                                                       |
| ------------------------ | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--prefix <text>`        | string | no       | Custom voice prefix. Digits and letters only, 1-10 characters                                                                                                     |
| `--target-model <model>` | string | no       | Protocol switch only (not a filter): any qwen3.x-omni* id selects qwen-voice-enrollment and lists all Omni voices; omit for CosyVoice/Qwen-Audio voice-enrollment |
| `--page <n>`             | number | no       | Page number, 1-based (default: 1). Mapped to API page_index as page - 1                                                                                           |
| `--page-size <n>`        | number | no       | Results per page (default: 10)                                                                                                                                    |
| `--api-key <key>`        | string | no       | API key                                                                                                                                                           |
| `--base-url <url>`       | string | no       | API base URL                                                                                                                                                      |

#### Notes

- Lists one page only (CLI defaults: page=1, page-size=10). CosyVoice/Qwen-Audio status: DEPLOYING / OK / UNDEPLOYED. Omni --target-model only switches protocol (returns all Omni voices; no server-side model filter; no --prefix).

#### Examples

```bash
bl speech voice list
```

```bash
bl speech voice list --prefix demo
```

```bash
bl speech voice list --page 2 --page-size 20
```

```bash
bl speech voice list --target-model qwen3.5-omni-flash --dry-run --output json
```

### `bl speech voice preview`

| Field              | Value                                                    |
| ------------------ | -------------------------------------------------------- |
| **Name**           | `speech voice preview`                                   |
| **Description**    | Fetch the reference audio URL for a cloned voice         |
| **Authentication** | API Key                                                  |
| **Usage**          | `bl speech voice preview --id <voice-id> [--out <path>]` |

#### Flags

| Flag               | Type   | Required | Description                               |
| ------------------ | ------ | -------- | ----------------------------------------- |
| `--id <voice-id>`  | string | yes      | Voice ID (required)                       |
| `--out <path>`     | string | no       | Download the reference audio to this path |
| `--api-key <key>`  | string | no       | API key                                   |
| `--base-url <url>` | string | no       | API base URL                              |

#### Notes

- Returns resource_link from query_voice. This is the enrollment reference audio, not a synthesized preview. Use `speech synthesize` to hear the voice. Design voices may not include resource_link.

#### Examples

```bash
bl speech voice preview --id <voice-id> --output json
```

```bash
bl speech voice preview --id <voice-id> --out reference.wav
```

### `bl speech voice update`

| Field              | Value                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| **Name**           | `speech voice update`                                                                                   |
| **Description**    | Update the reference audio of a cloned voice                                                            |
| **Authentication** | API Key                                                                                                 |
| **Usage**          | `bl speech voice update --id <voice-id> --audio <url-or-path>`                                          |
| **Risk**           | `high`                                                                                                  |
| **Risk message**   | This updates the reference audio for the voice ID. All synthesis that uses this voice will be affected. |

> **Agent safety:** Never add `--yes` automatically. On `type="requires_confirmation"`, stop and ask for explicit user confirmation of the same action and scope.

#### Flags

| Flag                    | Type   | Required | Description                           |
| ----------------------- | ------ | -------- | ------------------------------------- |
| `--id <voice-id>`       | string | yes      | Voice ID (required)                   |
| `--audio <url-or-path>` | string | yes      | New reference audio URL or local file |
| `--yes`                 | switch | no       | Confirm this high-risk operation      |
| `--api-key <key>`       | string | no       | API key                               |
| `--base-url <url>`      | string | no       | API base URL                          |

#### Notes

- You must have the right to use the reference audio or described voice. Do not clone or imitate a real person without authorization.
- A voice ID is bound to its target model. Later `speech synthesize --model` or `omni --model` must match the clone --target-model.
- Only reference audio can be updated. Design voices do not support voice_prompt updates via this command.

#### Examples

```bash
bl speech voice update --id <voice-id> --audio ./new-reference.wav --dry-run --output json
```

```bash
# Only after explicit user confirmation:
bl speech voice update --id <voice-id> --audio ./new-reference.wav --yes
```
