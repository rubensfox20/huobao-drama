---
name: generate-character-image
description: A dedicated tool for extracting the full cast of characters from novel content. It accurately identifies every person in the text, deconstructing them into identity tags, descriptions, visual specs (clothing/physique/features), and personality traits, while simultaneously outputting a comprehensive social relationship map.
---

### 核心要求
* 负责生成工业级标准化的**角色三视图**和**面部特写**参考图。
* 输出必须严格遵循结构化布局、等比例空间分配及严谨的解剖学朝向逻辑，确保所有视图在单张画布内完整呈现
* 严禁任何视角重叠或肢体残缺。

### 要求规则

1. **等比例画面布局（横向从左至右，4等分区域 25%×4）**：
* **位置 1 (左一)：面部特写 (Facial Close-up)**。**强制要求：五官必须完全正对镜头（Full Frontal View）**，严禁任何倾斜角度，展示精准的眼距、瞳色与发际线。
* **位置 2 (左二)：正视图 (Full Body Front View)**。人物从头顶到脚尖完整显示，面部、躯干、脚尖必须全部完全正对镜头。
* **位置 3 (右二)：侧视图 (Full Body Side View)**。人物从头顶到脚尖完整显示。**强制要求：面部朝向、胸部朝向、双脚脚尖朝向必须 100% 统一指向左侧**，严禁头、脚朝向不一致。
* **位置 4 (右一)：后视图 (Full Body Back View)**。人物从头顶到脚尖完整显示，背面正对镜头，展示完整的后脑发型与足跟。

2. **视图完整性与空间约束 (Visual Integrity)**：
* **严禁裁剪**：每个视图的人物必须完全包含在各自的 25% 宽度内，头顶、脚尖及服饰边缘必须与画布边界保持安全间距。
* **单张画布**：所有视图必须在同一张图像中呈现，视图间保持清晰的物理空隙。

3. **骨骼与角色一致性 (Character Consistency)**：
* **100% 克隆**：所有视图必须共享同一套骨骼比例、下颚几何形状。禁止改变年龄、禁止增加无关的美化。
* **静态姿态**：人物保持中性站立姿态，无任何夸张动作。

4. **艺术标准与背景 (Artistic Style & Background)**：
* **背景**：固定使用**纯净浅灰纯色背景 (Solid Light Grey Background)**，严禁渐变、严禁阴影、严禁纹理。
* **光效**：均匀的影棚级软光，保持画面清透。