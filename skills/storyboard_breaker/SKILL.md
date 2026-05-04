---
name: storyboard-breaker
description: Professional guidelines for storyboard breakdown
---

# Storyboard Breakdown Guidelines

## Breakdown Principles

Each shot should focus on a **single action**, and descriptions must be detailed and specific. The duration of each shot should be 10-15 seconds.

## Shot Elements

1. **Shot Title**: 3-5 words summarizing the core content (e.g., "Waking up from a nightmare").
2. **Time**: Specific time of day + lighting description.
3. **Location**: Complete scene description + spatial layout + environmental details.
4. **Shot Size**: Wide shot / Full shot / Medium shot / Close-up / Extreme close-up.
5. **Angle**: Eye level / High angle / Low angle / Side view / Back view.
6. **Camera Movement**: Static / Push in / Pull out / Pan / Track / Crane.
7. **Action**: Who + exactly what they are doing + body language details + facial expression.
8. **Dialogue**: Complete dialogue for the shot.
9. **Visual Result**: Immediate consequence of the action + visual details.
10. **Atmosphere**: Lighting + color tone + sound + overall atmosphere.
11. **Duration**: 10-15 seconds per shot.
12. **Static Image Prompt**: `image_prompt`, used for generating the first frame/last frame/shot images.
13. **Video Prompt**: `video_prompt`, descriptions for video generation divided into 3-second segments (required).
14. **BGM Prompt**: `bgm_prompt`, describing the appropriate background music style for the shot.
15. **Sound Effect Prompt**: `sound_effect`, describing key environmental/action sounds in the shot.
16. **Scene Association**: Must provide `scene_id` if it matches an existing scene.
17. **Character Association**: Provide `character_ids`, linking 0 or more characters involved in the current shot.

## Video Prompt Format

Each shot must include a `video_prompt` field, used to drive AI video generation:

```
0-3s: <location>Coffee shop</location>, medium shot, <role>Xiaoming</role> looks down at his phone, anxious expression.
<n>3-6s: <location>Coffee shop</location>, wide shot, doorbell rings, <role>Xiaohong</role> pushes the door and walks in.
<n>6-9s: <location>Coffee shop</location>, medium shot, <role>Xiaohong</role> walks towards Xiaoming smiling, sits down.
```

Tag descriptions:
- `<location>Location</location>` — Scene marker
- `<role>Character Name</role>` — Character marker
- `<voice>Character Name</voice>` — Voice-over/narration marker
- `<n>` — Time segment separator

## Steps for Use

1. Call `read_storyboard_context` to read the script, characters, scenes, and summaries of existing storyboards.
2. Complete the shot breakdown based on the script first, ensuring the total duration and narrative continuity are reasonable.
3. Fill in the complete fields for each shot: `title / shot_type / angle / movement / location / time / character_ids / action / dialogue / description / result / atmosphere / image_prompt / video_prompt / bgm_prompt / sound_effect / duration / scene_id`.
4. Call `save_storyboards` to save the complete storyboards at once.
5. If adjustments are needed, call `update_storyboard` to modify specific shots.

## Scene Association Rules

- Prioritize using `scenes` returned by `read_storyboard_context`.
- When `location + time` can be clearly matched, the correct `scene_id` must be filled in.
- Do not make up non-existent scene IDs.
- If the script content obviously falls within an existing scene, do not create a duplicate scene description.

## Character Linking Rules

- `character_ids` must be selected from the character list returned by `read_storyboard_context`.
- A shot can have no characters, or it can be linked to multiple characters.
- Any character clearly appearing, seen, acting, or speaking in the shot should be linked.
- Empty arrays can be passed for pure environment shots, empty shots, or object shots.

## Quality Requirements

- `description` should be human-readable, and `video_prompt` should be suitable for model generation. They should not replace each other.
- `image_prompt` should highlight single-frame composition, character appearance, environment, and lighting.
- `video_prompt` should emphasize the progression of time, action changes, and camera language.
- `bgm_prompt` and `sound_effect` can use concise phrases, but shouldn't be too vague like just "tense" or "sad".
- If there is narration/voice-over, write it uniformly in `dialogue` using the format `Narrator: Content` (or `Voice-over: Content`).
