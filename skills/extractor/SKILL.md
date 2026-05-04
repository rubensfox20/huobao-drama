---
name: character-scene-extractor
description: Guidelines and methods for extracting characters and scenes
---

# Character and Scene Extraction Guidelines

## Character Extraction Specifications

The extracted character information includes:
- **Name**: The full name of the character
- **Role Positioning**: Protagonist / Supporting Role / Background Character
- **Appearance Description**: Gender, age, body type, facial features, hairstyle, clothing (300-500 words)
- **Personality Traits**: Core personality tags
- **Character Description**: Background story and relationships

## Scene Extraction Specifications

The extracted scene/background information includes:
- **Location**: Specific place name
- **Time**: Time period and lighting conditions
- **Atmosphere**: Description of the environmental atmosphere
- **Prompt**: English prompt words for AI image generation (pure background, no characters)

## Prop Extraction Specifications

The extracted prop information includes:
- **Name**: Prop name
- **Type**: Daily / Weapon / Vehicle / Decoration, etc.
- **Description**: Appearance and usage
- **Image Prompt**: English prompt words for AI image generation

## Steps for Use

1. Call `read_script_for_extraction` to read the script of the current episode
2. Call `read_existing_characters` to view existing characters in the project and characters already linked to the current episode
3. Call `read_existing_scenes` to view existing scenes in the project and scenes already linked to the current episode
4. Extract only the characters and scenes actually involved in the current episode
5. Call `save_dedup_characters` to save characters and automatically link them to the current episode
6. Call `save_dedup_scenes` to save scenes and automatically link them to the current episode

## Current Episode Rules

- The goal is to fill in the missing characters and scenes needed for the "current episode", not to re-scan the entire project.
- If a character or scene already exists in the project but is not linked to the current episode, it should still be reused and linked to the current episode.
- If there is already a character with the same name or a scene with the same location and time in the project, prioritize reusing it and do not create duplicates.
