# Media processing guide

## Goal

Coordinate **real** media tools. Plans and storyboards are valid deliverables when renderers are missing — but must not be labeled as rendered video.

## FFmpeg adapter

- ID: `media.ffmpeg`
- Resolve binary: `PATH` or `OMNISKILL_FFMPEG` / `OMNISKILL_FFPROBE`
- Probe: `ffmpeg -version`
- Synthetic render: lavfi `color` + `sine` → H.264/AAC MP4
- Verify: file exists + ffprobe/ffmpeg reports a video stream

### CLI

```bash
omniskill tools --probe
omniskill run "Assemble a vertical short-form test clip" --media --approve assemble,verify-av
omniskill artifacts
```

Without ffmpeg, `--media` stages stay **partial** with document artifacts only.

## Presets

| Preset | Size |
|--------|------|
| vertical-short | 1080×1920 (adapter default test uses 720×1280) |
| landscape | 1920×1080 |

## Not yet implemented

- Blender adapter (stub capability `tool.blender`)
- NLE project automation
- Cloud video/image generation APIs
- Subtitle burn-in pipeline beyond stub ops list
- Editing arbitrary user footage end-to-end

## Safety

- Writes under `.omni/artifacts/derived/` by default
- Does not overwrite user source media
- Requires `shell` + `filesystem_write` permissions in adapter context
