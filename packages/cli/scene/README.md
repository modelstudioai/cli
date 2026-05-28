# Pipeline Workflow Demos

This directory contains copyable pipeline JSON/YAML files for common `bl pipeline` workflows:

| File                                                             | Pattern                                                                                         | Runtime input                                |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `chat-basic.json`                                                | Single `text/chat` step using JSON Pointer `$input`                                             | optional, defaults inline                    |
| `chained-text.json`                                              | Two `text/chat` steps using `$from` and explicit `dependsOn`                                    | `inputs/creative-brief.json`                 |
| `chained-text.yaml`                                              | YAML equivalent of the chained text workflow                                                    | `inputs/creative-brief.json`                 |
| `image-generate.json`                                            | Single `image/generate` step producing downloaded image artifacts                               | `inputs/image.json`                          |
| `image-gen/image-gen-workflow.json`                              | `vision/describe` style-aligned prompt preparation -> `image/generate`, inspired by `image-gen` | `image-gen/inputs.json`                      |
| `image-to-video.json`                                            | `image/generate` URL artifact passed into `video/generate`                                      | `inputs/image-to-video.json`                 |
| `logic-nodes.json`                                               | Local `logic/switch` -> `logic/assert` -> `logic/select` routing and convergence                | `inputs/logic-nodes.json`                    |
| `image2video/lego/lego-build-sequence.json`                      | `image/edit` reference image -> `image/edit` build-step image -> `video/generate`               | none                                         |
| `image2video/virtual-tryon/virtual-tryon-workflow.json`          | Garment analysis -> try-on image -> try-on video                                                | `image2video/virtual-tryon/inputs.json`      |
| `image2video/nine-grid-storyboard.json`                          | 9-grid storyboard image edit -> image-to-video                                                  | none                                         |
| `commerce/cool-background/cool-background-workflow.json`         | 3 parallel `image/edit` branches for product background variants                                | `commerce/cool-background/inputs.json`       |
| `commerce/dress-on-model/dress-on-model-workflow.json`           | Garment analysis -> prompt generation -> on-model product images                                | `commerce/dress-on-model/inputs.json`        |
| `commerce/flatlay/flatlay-workflow.json`                         | Outfit analysis -> flat-lay prompt -> product flat-lay images                                   | `commerce/flatlay/inputs.json`               |
| `commerce/scatter-flatlay/scatter-flatlay-workflow.json`         | Layout + outfit analysis -> scatter flat-lay product image                                      | `commerce/scatter-flatlay/inputs.json`       |
| `commerce/amazon-listing/amazon-listing-workflow.json`           | Product analysis -> 6 prompts -> 6 Amazon listing images                                        | `commerce/amazon-listing/inputs.json`        |
| `commerce/audio-meeting-summary/workflow.json`                   | Media guard -> ASR -> language detection -> meeting summary/report                              | `commerce/audio-meeting-summary/inputs.json` |
| `commerce/poster-i18n/poster-i18n-workflow.json`                 | Poster analysis -> zh/ja/ko localization prompts -> localized posters                           | `commerce/poster-i18n/inputs.json`           |
| `commerce/valentine-marketing/valentine-marketing-workflow.json` | Product analysis -> 4 platform-specific marketing posters                                       | `commerce/valentine-marketing/inputs.json`   |
| `commerce/six-view-product/six-view-workflow.json`               | Product analysis -> serial multi-view product image set                                         | `commerce/six-view-product/inputs.json`      |

From a development checkout, use the package script:

```sh
for workflow in \
  scene/chat-basic.json \
  scene/chained-text.json \
  scene/chained-text.yaml \
  scene/image-generate.json \
  scene/image-gen/image-gen-workflow.json \
  scene/image-to-video.json \
  scene/logic-nodes.json \
  scene/image2video/lego/lego-build-sequence.json \
  scene/image2video/virtual-tryon/virtual-tryon-workflow.json \
  scene/image2video/nine-grid-storyboard.json \
  scene/commerce/cool-background/cool-background-workflow.json \
  scene/commerce/dress-on-model/dress-on-model-workflow.json \
  scene/commerce/flatlay/flatlay-workflow.json \
  scene/commerce/scatter-flatlay/scatter-flatlay-workflow.json \
  scene/commerce/amazon-listing/amazon-listing-workflow.json \
  scene/commerce/audio-meeting-summary/workflow.json \
  scene/commerce/poster-i18n/poster-i18n-workflow.json \
  scene/commerce/valentine-marketing/valentine-marketing-workflow.json \
  scene/commerce/six-view-product/six-view-workflow.json
do
  pnpm -F bailian-cli dev pipeline validate "$workflow"
done
```

When the package binary is installed or linked, use the same workflow paths with `bl`:

```sh
bl pipeline validate scene/chat-basic.json
bl pipeline validate scene/commerce/amazon-listing/amazon-listing-workflow.json
```

Use dry-run before invoking demos whose planned inputs are fully known before execution:

```sh
pnpm -F bailian-cli dev pipeline run scene/chat-basic.json --dry-run
pnpm -F bailian-cli dev pipeline run scene/image-generate.json --input-file scene/inputs/image.json --dry-run
pnpm -F bailian-cli dev pipeline run scene/image-gen/image-gen-workflow.json --input-file scene/image-gen/inputs.json --dry-run
pnpm -F bailian-cli dev pipeline run scene/logic-nodes.json --input-file scene/inputs/logic-nodes.json --dry-run
pnpm -F bailian-cli dev pipeline run scene/image2video/lego/lego-build-sequence.json --dry-run
```

Installed command equivalents:

```sh
bl pipeline run scene/chat-basic.json --dry-run
bl pipeline run scene/image-generate.json --input-file scene/inputs/image.json --dry-run
bl pipeline run scene/image-gen/image-gen-workflow.json --input-file scene/image-gen/inputs.json --dry-run
bl pipeline run scene/logic-nodes.json --input-file scene/inputs/logic-nodes.json --dry-run
bl pipeline run scene/image2video/lego/lego-build-sequence.json --dry-run
```

Run the text demos with real adapter execution:

```sh
pnpm -F bailian-cli dev pipeline run scene/chat-basic.json
pnpm -F bailian-cli dev pipeline run scene/chat-basic.json --input-file scene/inputs/chat.json
pnpm -F bailian-cli dev pipeline run scene/chained-text.json --input-file scene/inputs/creative-brief.json
```

Installed command equivalents:

```sh
bl pipeline run scene/chat-basic.json
bl pipeline run scene/chat-basic.json --input-file scene/inputs/chat.json
bl pipeline run scene/chained-text.json --input-file scene/inputs/creative-brief.json
```

Run the media demos when your `bl` CLI credentials and output permissions are ready:

```sh
pnpm -F bailian-cli dev pipeline run scene/image-generate.json --input-file scene/inputs/image.json
pnpm -F bailian-cli dev pipeline run scene/image-gen/image-gen-workflow.json --input-file scene/image-gen/inputs.json
pnpm -F bailian-cli dev pipeline run scene/image-to-video.json --input-file scene/inputs/image-to-video.json
pnpm -F bailian-cli dev pipeline run scene/image2video/lego/lego-build-sequence.json
```

Installed command equivalents:

```sh
bl pipeline run scene/image-generate.json --input-file scene/inputs/image.json
bl pipeline run scene/image-gen/image-gen-workflow.json --input-file scene/image-gen/inputs.json
bl pipeline run scene/image-to-video.json --input-file scene/inputs/image-to-video.json
bl pipeline run scene/image2video/lego/lego-build-sequence.json
```

Override the default chat prompt when you want a custom runtime input with `--input-file scene/inputs/chat.json` or `--input '{"message":"..."}'`.

The image-gen-inspired demo maps the `image-gen` app's core flow to pipeline nodes: the user prompt and style reference image become runtime input. The workflow runs two steps — `vision/describe` receives the style reference image plus the user intent and prepares a style-aligned text-to-image prompt using the same core instruction as `image-gen`; then `image/generate` creates the final media artifact with explicit model, size, prompt extension, output directory, and output prefix. It intentionally does not model `image-gen`'s Web UI, local key store, history, or Skill system.

Intermediate image steps (Lego demo, image-to-video demo) omit `out-dir` so `bl` returns only URLs without downloading files. Downstream steps consume these URLs through `$from` with `/artifacts/0/url`. Final steps that need local files specify `out-dir` and `out-prefix` to trigger downloads.

Convention: omit `out-dir` for short-lived intermediate media consumed immediately by the next step; add `out-dir` for final artifacts you want to keep locally.

For automation, add `--output json` to any successful command to reserve stdout for parseable JSON:

```sh
pnpm -F bailian-cli dev pipeline validate scene/chat-basic.json --output json
pnpm -F bailian-cli dev pipeline run scene/chat-basic.json --output json
```

For live pipeline progress that another process can consume, use JSONL lifecycle events:

```sh
pnpm -F bailian-cli dev pipeline run scene/chat-basic.json --events jsonl
```

Use `--quiet` to suppress non-error progress on stderr while keeping the selected stdout contract:

```sh
pnpm -F bailian-cli dev pipeline run scene/chat-basic.json --quiet
```
