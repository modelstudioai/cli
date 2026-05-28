# Audio Meeting Summary Pipeline

Convert a media file URL or local media path into a structured meeting transcript and optional translated summary.

## Steps

1. `guard` (`script/js`) checks whether `fileUrl` was provided.
2. `to-array` (`script/js`) normalizes the media path into the array shape expected by ASR.
3. `asr` (`speech/recognize`) extracts transcript text with `fun-asr`.
4. `detect-lang` (`text/chat`) detects the transcript language.
5. `summarize` (`text/chat`) formats speaker turns and applies the user's translation request when present.
6. `final` (`logic/select`) returns either the summary or the empty-input fallback.
7. `report` (`script/js`) writes the final text report.

## Run

```sh
pnpm -F bailian-cli dev pipeline validate scene/commerce/audio-meeting-summary/workflow.json
pnpm -F bailian-cli dev pipeline run scene/commerce/audio-meeting-summary/workflow.json \
  --input-file scene/commerce/audio-meeting-summary/inputs.json
```

Use `--dry-run --output json` to inspect the resolved plan without invoking ASR or chat calls:

```sh
pnpm -F bailian-cli dev pipeline run scene/commerce/audio-meeting-summary/workflow.json \
  --input-file scene/commerce/audio-meeting-summary/inputs.json \
  --dry-run \
  --output json
```

## Inputs

| Key       | Required | Default | Notes                                                                  |
| --------- | -------- | ------- | ---------------------------------------------------------------------- |
| `fileUrl` | No       | `""`    | Video/audio URL or local media path. Empty input uses fallback output. |
| `query`   | No       | `""`    | User request, for example a target language for translation.           |

## Output

The `report` step writes `scene/commerce/audio-meeting-summary/outputs/result.txt`.
