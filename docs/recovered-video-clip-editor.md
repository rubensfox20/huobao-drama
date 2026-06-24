# Recovered Video Clip Editor Notes

Source branch: `origin/feature-video-clip-jiangzj`

This branch contains a legacy Vue video clip editor under `web/src/views/clip/`.
The current project is a Nuxt 3 + TypeScript app under `frontend/`, so the legacy
files were not restored directly into the app tree.

## Useful Recovered Behavior

- Import multiple video assets.
- Import multiple audio assets.
- Detect media duration from browser media metadata.
- Keep an asset library separate from the timeline.
- Drag assets into video/audio tracks.
- Move timeline clips by dragging.
- Trim clips using left/right handles.
- Edit selected clip properties: name, start time, end time, volume.
- Add and remove empty audio tracks.
- Zoom timeline with a pixels-per-second scale.
- Preview current timeline time with HTML video/audio APIs.

## Legacy Route

The old route was:

```text
/clip/editor
```

## Migration Notes For Current Project

- Reuse the behavior, not the old folder layout.
- Implement inside `frontend/app/` if this feature is brought back.
- Avoid Element Plus from the legacy implementation; the current frontend uses
  pure CSS and Nuxt/Vue components.
- Backend export should use the current media services in `backend/src/services/`.
- Existing FFmpeg-related helpers can be reused:
  - `backend/src/services/media-duration.ts`
  - `backend/src/services/media-frames.ts`
  - merge/video generation services where applicable

## Deferred Features From Legacy Notes

- Video transitions.
- Audio fade in/out.
- Subtitle track.
- Filter effects.
- Keyframes.
- FFmpeg export integration.
- Undo/redo.
- Keyboard shortcuts.
- Waveform display.
- Thumbnail previews.
