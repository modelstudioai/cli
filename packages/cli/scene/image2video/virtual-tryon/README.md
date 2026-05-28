# Virtual Try-On Pipeline

Convert a garment photo (`scene/image2video/dress.png` by default) into a model
virtual try-on photo and a short try-on video.

## Steps

1. `analyze-garment` (`vision/describe`) — describe the garment in Chinese.
2. `tryon-image` (`image/edit`) — render a model wearing the garment with a
   spring garden background (9:16).
3. `tryon-video` (`video/generate`) — animate the try-on image into a 1080P /
   9:16 / 5s video and download it locally.

The garment description from step 1 is concatenated into the prompts of
steps 2 and 3 to keep style/material consistent.

## Run

```sh
pnpm -F bailian-cli dev pipeline validate scene/image2video/virtual-tryon/virtual-tryon-workflow.json
pnpm -F bailian-cli dev pipeline run scene/image2video/virtual-tryon/virtual-tryon-workflow.json \
  --input-file scene/image2video/virtual-tryon/inputs.json  --verbose
```

## Inputs

| Key            | Required | Default                                                   | Notes                                   |
| -------------- | -------- | --------------------------------------------------------- | --------------------------------------- |
| `garmentImage` | Yes      | —                                                         | Local path or URL of the garment image. |
| `modelPrompt`  | No       | spring garden on-model prompt                             | Override the model scene prompt.        |
| `videoPrompt`  | No       | gentle spin in garden prompt                              | Override the video animation prompt.    |
| `outDir`       | No       | `scene/image2video/virtual-tryon/outputs`                 | Folder for the try-on image.            |
| `videoPath`    | No       | `scene/image2video/virtual-tryon/outputs/dress-tryon.mp4` | Saved video path.                       |

## Outputs

- `outputs/dress-model.png` — model try-on photo with background.
- `outputs/dress-tryon.mp4` — 1080P / 9:16 / 5s try-on video.
