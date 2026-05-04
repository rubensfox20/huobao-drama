---
name: voice-assigner
description: Character voice allocation principles and voice library
---

# Voice Allocation Guidelines

## Allocation Principles

1. **Gender Matching**: Use male voices for male characters, and female voices for female characters.
2. **Age Matching**: Use different voices corresponding to youth/young adult/middle-aged/elderly.
3. **Personality Matching**:
   - Lively and outgoing → Bright and energetic voice
   - Calm and introverted → Deep and steady voice
   - Gentle and considerate → Soft and sweet voice
   - Majestic and domineering → Rich and powerful voice
4. **Role Positioning**: Use highly recognizable voices for protagonists, and neutral voices for supporting roles.

## Steps for Use

1. Call `list_voices` to view the list of available voices.
2. Call `get_characters` to get information for all characters.
3. Analyze the characteristics of each character, such as personality, age, and gender.
4. Call `assign_voice` to allocate an appropriate voice to each character.
5. Summarize the allocation results for the user.
