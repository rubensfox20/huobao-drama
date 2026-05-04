---
name: grid-image-generator
description: Image prompt generation guidelines — Prompt specifications for characters, scenes, and grid layouts
---

# Image Prompt Generation Guidelines

This SKILL corresponds to the `grid_prompt_generator` Agent, supporting the generation of three types of image prompts:

1. **Character image prompts** — Character appearance and temperament
2. **Scene image prompts** — Scene atmosphere and lighting
3. **Grid layout prompts** — Multi-shot grid collage

See the `reference/` directory for detailed templates.

---

## Character Image Prompts

Reference: `reference/character-prompt.md`

### Template Structure
```
[appearance], [personality/temperament], [role], [cinematic portrait], [high quality], [consistent art style], [no text, no watermark]
```

### Generation Rules
- Based on `appearance` (appearance description) at its core
- `personality` determines the base tone of the temperament (introverted / flamboyant / mysterious, etc.)
- `role` determines the clothing and prop style
- Must include `cinematic portrait` + `consistent art style`
- Avoid text, signatures, and watermarks

---

## Scene Image Prompts

Reference: `reference/scene-prompt.md`

### Template Structure
```
[location], [time period], [lighting atmosphere], [scene description], [cinematic scene], [high quality], [consistent art style], [no text, no watermark]
```

### Generation Rules
- Based on `location` (place)
- `time` determines the light tone (day / night / dusk)
- Scene atmosphere words: atmospheric, moody, warm, cold, etc.
- Must include `cinematic scene` + `consistent art style`
- Avoid text, signatures, and watermarks

---

## Grid Layout Prompts

Reference: `reference/shot-prompt.md`

### Three Modes

#### First Frame Mode (first_frame)
Each panel = the opening scene of a shot, but it must strictly generate the total number of panels specified by the user: `rows x cols`.

```
[rows x cols grid layout], exactly [rows*cols] visible panels, consistent art style, [style description],
Panel 1: [shot 1 opening scene],
Panel 2: [shot 2 opening scene],
Panel 3: [shot 3 opening scene],
...
Panel N: [opening scene],
high quality, cinematic lighting, no merged panels, no missing panels, no text, no watermark
```

#### First and Last Frame Mode (first_last)
Maintains the rhythm of the first and last frames, but must still strictly generate the total number of panels specified by the user: `rows x cols`. Sneakily changing it to `Nx2` is not allowed.

```
[rows x cols grid layout], exactly [rows*cols] visible panels, consistent art style, [style description],
Panel 1: [opening beat],
Panel 2: [closing beat],
Panel 3: [opening beat],
Panel 4: [closing beat],
...
high quality, cinematic, continuous motion implied, no merged panels, no missing panels, no text
```

#### Multi-Reference Mode (multi_ref)
All panels are different angles/composition references of the same shot, but must still strictly generate the total number of panels specified by the user: `rows x cols`.

```
[rows x cols grid layout], exactly [rows*cols] visible panels, same scene different angles, [style description],
[main scene description],
Panel 1: wide shot establishing,
Panel 2: medium shot character focus,
Panel 3: close-up detail,
Panel 4: dramatic angle,
...
consistent lighting and color palette, no merged panels, no missing panels, no text
```

### General Rules
1. Prompts must use **English**
2. Must explicitly state the user-specified `rows x cols grid layout`
3. Must include `consistent art style` to maintain a unified style
4. Must explicitly require `exactly N visible panels`
5. Must explicitly require `no merged panels, no missing panels`
6. Avoid descriptions of dividing lines between panels
7. Size recommendation: 960x540 per panel, total image = 960×cols × 540×rows
8. When there is a reference image mapping, uniformly use `Image 1 / Image 2 / ...` to refer to the reference image. Do not mix it with `Panel 1 / Panel 2 / ...`
