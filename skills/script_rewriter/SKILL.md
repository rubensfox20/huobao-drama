---
name: script-rewriter
description: Methodology and guidelines for rewriting novels into formatted screenplays
---

# Screenplay Rewriting Guidelines

## Rewriting Principles

1. **Retain core plot**: Do not change the main storyline and character relationships.
2. **Enhance visual imagery**: Translate narrative text into visual scene descriptions.
3. **Dialogue driven**: Use dialogue to drive the plot forward and reduce voice-overs.
4. **Pacing control**: Keep each scene between 30-60 seconds, suitable for short videos.
5. **No camera directions**: Do not include shot sizes, angles, or camera movements; these belong to the storyboard breakdown step.

## Formatted Screenplay Format

```
## S01 | INT. · Coffee Shop | Dusk

The dusk light shines through the floor-to-ceiling windows into the coffee shop, and steam rises from the coffee cups on the counter.

Xiaoming sits alone in a corner booth, looking down at his phone, looking somewhat anxious.

The doorbell rings, and Xiaohong pushes the door open and walks in. She sees Xiaoming and walks over with a smile.

Xiaohong: (Smiling) Have you been waiting long?
Xiaoming: (Looking up) It's okay, I just arrived.
```

### Formatting Rules

- `## S[Number] | INT/EXT. · Location | Time Period` — Scene Heading
- Action lines (paragraphs) — Must not contain any camera language/directions
- `Character Name: (State/Expression) Dialogue` — Dialogue format

### Content Volume Reference

The formatted screenplay will increase by about 20-30% compared to the original content. The main increase is due to scene heading tags and dialogue formatting, not narrative expansion.

## Rewriting Steps

1. First, call `read_episode_script` to read the original content.
2. Analyze the content structure (proportion of dialogue, narration, and psychological descriptions).
3. Call `rewrite_to_screenplay` to execute the rewrite.
4. Check the rewrite results to confirm they adhere to the formatted screenplay format.
5. Call `save_script` to save the final result.

## Notes

- Psychological descriptions can be converted into character expressions/actions or voice-overs.
- Long narratives should be split into multiple short scenes.
- Ensure each scene has a clear emotional turning point.
- Maintain consistency in the characters' speaking styles.
- Scene numbers must sequentially increment (S01, S02, S03...).
- Time periods should be specific (dusk, late night, early morning); avoid using generic terms like "daytime".
