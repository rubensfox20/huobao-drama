---
name: ai-video-prompt-writer
description: >
  Use this skill whenever a user wants to create AI-generated video content through a
  two-stage prompt pipeline: (1) a Design Concept Sheet prompt and (2) a Storyboard prompt.
  Trigger this skill when the user mentions: AI video, design sheet, storyboard prompts,
  GPT Image, Seedance, AI film, character design, cinematic prompts, campaign board,
  production design sheet, or asks you to write prompts for AI image/video generation.
  Also trigger when a user uploads a design sheet image and wants storyboard prompts written.
  This skill covers both Stage 1 (Design Sheet prompt generation) and Stage 2 (Storyboard
  prompt generation), as well as modifications to either stage.
---

# AI Video Prompt Writer

This skill helps users create high-quality prompts for AI video production using a two-stage pipeline:

1. **Stage 1 - Design Concept Sheet**: A single image prompt that generates a professional preproduction board (characters, environments, style references, color palette, mood)
2. **Stage 2 - Storyboard**: A single image prompt that generates a cinematic storyboard grid, using an uploaded Design Sheet as the visual reference

The user then animates the storyboard using Seedance or another AI video model.

---

## Stage 1: Design Sheet Prompt

### When to use
The user describes an idea - a film concept, product campaign, influencer video, music video, etc. - and wants a prompt to generate a Design Concept Sheet.

### What a Design Sheet prompt must include

**1. Layout Section**
Always describe the layout explicitly. Standard structure:
- Left column: title/logo, logline or campaign slogan, hero poster image
- Top row: full-body character turnaround shots (front, 3/4, profile, back, key poses) OR influencer/model turnaround
- Top right: props, products, accessories, technical specs, or key objects
- Middle row: cinematic action or lifestyle scenes
- Bottom row: environments/locations, mood references, color palette swatches, typography references

**2. Characters / Subjects**
- Describe each character or subject with specific visual detail: ethnicity, build, hair, expression, wardrobe, and any special elements (armor, wings, props)
- For campaigns: describe the model/influencer and the product in detail
- Emphasize: **"must remain visually consistent across all panels"**

**3. Story Tone / Campaign Concept**
- 1-2 sentences describing the emotional or narrative core

**4. Style Block**
Always end with a comma-separated style list. Tailor to the project type:

*Cinematic Film:*
```
photorealistic, shot on 35mm film, cinematic lighting, slightly desaturated colors,
minimalist editorial layout, high-end Hollywood production photography, organized grid composition
```

*Luxury Commercial / Influencer:*
```
ultra photorealistic, shot on 35mm film, cinematic shallow depth of field, natural film grain,
soft cinematic lighting, clean luxury commercial photography, Kodak Portra color tones,
slightly desaturated modern color grade, editorial magazine aesthetic, organized grid composition
```

*Sci-Fi / Action:*
```
photorealistic, shot on 35mm film, cinematic lighting, slightly desaturated colors,
high contrast dramatic lighting, minimalist editorial layout, organized grid composition
```

### Modifications
If the user wants to change the Design Sheet prompt, identify what they want to adjust:
- **Color palette** -> update the style block and add explicit palette instructions
- **Style/aesthetic** -> swap or add style descriptors
- **Character** -> rewrite the character description section
- **Story/concept** -> update logline and tone section
- **Layout** -> revise the layout section

---

## Stage 2: Storyboard Prompt

### When to use
The user has a completed Design Sheet (uploaded as an image) and wants a storyboard prompt. Always reference the uploaded image.

### What a Storyboard prompt must include

**1. Image Reference Instruction**
Always open with:
> "Use the uploaded image(s) as a reference for the [characters / influencer / model / product], [wardrobe / packaging], lighting, environments, color grading, mood, and overall cinematic style. Keep [them / him / her / the character] visually consistent across all panels."

**2. World & Environment**
Describe the setting, atmosphere, and tone in 2-3 sentences. Be specific about lighting, weather, time of day, and emotional register.

**3. Characters / Subject + Costume Lock**
Name each character and give a 1-line description. Then define a strict costume lock for each character - a complete head-to-toe description of exactly what they are wearing for the entire storyboard. Be specific: every garment, accessory, helmet state, footwear, and any worn equipment.

Always include this line in every storyboard prompt:
> "Every character's costume and appearance must remain exactly identical across all panels. Do not add, remove, or alter any clothing item, accessory, helmet, or equipment between panels unless a wardrobe change is explicitly listed below."

If the story requires a wardrobe change at any point, list it explicitly after the costume lock:
> "WARDROBE CHANGE: [Character name] - from panel [N] onward: [full new outfit description]."

Every panel description must explicitly state what the character is wearing if there is any chance of ambiguity. Leave nothing to the image model to decide.

**Face covering rule - applies to any wearable that covers the face:**
- Every panel description AND every corresponding video prompt must explicitly state whether the face covering is ON or OFF
- Never assume the image model will carry this detail forward from one panel to the next
- For exterior panels where face coverings are required: write "wearing [respirator/mask/helmet] over nose and mouth"
- For interior panels where face coverings are removed: write "respirator/mask pulled down around neck, face fully visible"

**4. Scene Context**
1-3 sentences describing what the scene is about at a high level.

**5. Style Block**
Match the style block from Stage 1, adapted for motion storyboards:
```
photorealistic, shot on 35mm film, cinematic lighting, [add atmosphere details],
realistic [action / lifestyle / commercial] cinematography
```

**6. Storyboard Structure**
The default is a single cinematic 4x3 storyboard grid with 12 panels, but the host product may adapt rows, columns, and panel count dynamically to match story rhythm, duration, genre, and user limits.

Each panel should include:
- Panel number
- Shot name
- 1-2 sentence description of the specific action, framing, and emotional beat

**Panel Caption Instruction - always include this line in every storyboard prompt:**
> "Below each panel, print the panel number and location header in the format: '01. EXT. LOCATION - DAY/NIGHT' followed on the next line by a single short caption of no more than 6 words describing the action. Example: '05. INT. CORRIDOR - NIGHT / She sees it for the first time.' Use monospace or typewriter-style font for all captions."

### Panel Writing Guidelines
- **Vary shot sizes**: mix wides, mediums, close-ups, inserts, and over-the-shoulder shots
- **Build narrative arc**: establish -> develop tension -> peak action -> resolution
- **Use cinematic language**: "medium-wide cinematic shot", "side-angle action shot", "extreme close-up insert"
- **Ground each panel**: specific action + specific emotion or detail

**STILL IMAGE RULE - critical for image generators:**
Every panel description must only contain actions and states that can be captured in a single frozen photograph.

Valid: walking, running, crouching, pointing, holding, pushing, looking, reaching, standing, sitting, embracing, falling, fighting, crying, laughing, staring, carrying, climbing

Invalid: nodding, shaking head, agreeing, deciding, realizing, turning around, beginning to do something, finishing something, reacting to something, noticing something off-screen

When an invalid action is needed, translate it into its visible physical equivalent.

### Scene Types & Panel Templates

**Action / Confrontation:**
Wide establishing -> character entrances -> reaction close-ups -> action buildup -> dynamic collision -> combat sequence -> insert damage detail -> final blow -> defeat shot -> hero ending shot

**Emotional / Drama:**
Establishing location -> character entrance -> preparation close-up -> performance begins -> emotional escalation -> psychological moment -> wide performance -> surreal beat -> introspective close-up -> breakdown -> confrontation -> quiet resolution

**Day-in-Life / Commercial:**
Morning wake-up -> routine -> product close-up -> product use -> departure -> activity -> social moment -> mid-day energy -> afternoon walk -> evening return -> night routine -> final peaceful shot

**Fashion / Red Carpet:**
Getting ready wide -> mirror preparation -> outfit detail -> dressed reveal -> departure close-up -> arrival exterior -> entrance walk -> crowd/event wide -> interaction shot -> photographer moment -> close-up portrait -> final brand shot

### Modifications to Storyboard
- **Change scene type** -> rewrite Scene Context and swap panel template
- **Add/remove panels** -> adjust grid
- **Shift tone** -> update World & Environment and style block
- **Feature product/character more** -> add insert shots or rewrite specific panels

---

## Output Format

### Stage 1 Output
Present the prompt in a clean code block, ready to paste into GPT Image 2 or similar:

```
DESIGN SHEET PROMPT - [Project Title]
[full prompt text]
```

### Stage 2 Output
Present as three blocks:

**Block 1 - Storyboard Image Prompt:**
```
STORYBOARD PROMPT - [Project Title]
[full prompt text]
```

Each panel in the prompt should include its caption instruction in the format:
`01. EXT./INT. LOCATION - DAY/NIGHT / [6-word max action caption]`

**Block 2 - AI Video Prompts:**
After the storyboard prompt, generate individual video prompts - one per panel - for Seedance or any AI video model.

Rules for video prompts:
- Each prompt is 1-3 sentences maximum describing the visual action
- Write in plain present tense
- Include subject, action, shot framing, environment, and key visual detail
- Do NOT use cinematic jargon like "cut to"
- Do NOT reference other panels or use narrative language like "meanwhile"
- Dialogue is optional and should be sparse

Format each video prompt as:
```
Shot [N]: [description]
```

---

## Tips for Quality Prompts

- Consistency language is critical
- More specific is better
- Name characters
- Style blocks are cumulative
- For products, always describe packaging in detail
