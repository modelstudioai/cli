# Video post-processing (ffmpeg)

> Hand-maintained. Lives in `assets/` (not auto-generated from `catalog.ts`).
> Entry point: [SKILL.md → Video post-processing](../SKILL.md#video-post-processing).

`bl video *` produces short clips (about 2–10s each). For **concatenation**,
**mixing audio**, or **long-form assembly**, use **ffmpeg** after generating the
clips with `bl` and narration with `bl speech synthesize`.

## Concatenate clips

```bash
printf "file 'clip1.mp4'\nfile 'clip2.mp4'\n" > list.txt
ffmpeg -f concat -safe 0 -i list.txt -c copy output.mp4
```

## Add a narration / background audio track

```bash
# Generate narration first
bl speech synthesize --text "..." --download narration.mp3

# Mux video + audio (shortest stream wins)
ffmpeg -i output.mp4 -i narration.mp3 -c:v copy -c:a aac -shortest final.mp4
```

## Typical pipeline

1. `bl video generate` / `bl video ref` → one or more clips.
2. `bl speech synthesize` → narration audio (optional).
3. `ffmpeg -f concat` → stitch clips.
4. `ffmpeg ... -shortest` → overlay narration / BGM.
