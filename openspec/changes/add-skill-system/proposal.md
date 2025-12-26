# Change: Add Skill System - User-Defined AI Skills in Notes

## Why

当前 AI Chat 插件的工具集是硬编码的，系统提示词很长且固定。用户无法根据自己的需求定制 AI 的能力，也无法创建可复用的 AI 技能模板。

本次变更引入 **Skill 系统**，将 AI 能力"外置"到用户的笔记中，让用户可以像管理笔记一样管理 AI 的技能。这将：
- **降低 Token 消耗**：只在需要时加载特定 Skill 的内容
- **提高对话聚焦度**：AI 只关注当前任务
- **增强可扩展性**：用户可以创建、编辑、分享自定义技能
- **简化系统提示词**：基础 prompt 更轻量

## What Changes

### Core Features

1. **Skill 存储格式**
   - 用户在笔记中创建带 `#skill` 标签的块来定义技能
   - **推荐格式**：使用标签 Properties 定义类型
     ```
     父块: "翻译助手" + #skill 标签
       └─ #skill 标签 Properties: type = ["prompt"]
       └─ 子块: "你是一个专业翻译..."
     ```
   - 支持两种 Skill 类型：
     - **提示词型 Skill（prompt）**：定义角色和指令模板
     - **工具型 Skill（tools）**：指定可用工具集和使用场景
   - Skill 可包含变量占位符（如 `{目标语言}`）- V1.1 阶段实现

2. **斜杠命令触发**
   - 用户在输入框输入 `/` 时弹出 Skill 选择菜单
   - 菜单显示所有可用的 Skill 列表
   - 支持搜索过滤和键盘导航

3. **Skill 标签可视化**
   - 选中 Skill 后，输入框上方显示 SkillChip
   - 点击 X 可移除当前 Skill

4. **变量支持**（V1.1 阶段）
   - Skill 可定义变量（如翻译助手的"目标语言"）
   - 变量在发送时填充

5. **动态 System Prompt 注入**
   - 保留基础 System Prompt 的核心规则
   - 在末尾追加 Skill 的详细指令
   - 工具型 Skill 动态过滤可用工具集

### UI Components

- **SkillPicker**：Skill 选择下拉菜单组件
- **SkillChip**：输入框中的 Skill 标签组件
- **SkillVariableDialog**：变量输入弹窗（V1.1）

### New Files

- `src/services/skill-service.ts` - Skill 解析和加载服务
- `src/store/skill-store.ts` - Skill 状态管理
- `src/views/SkillPicker.tsx` - Skill 选择器组件
- `src/views/SkillChip.tsx` - Skill 标签组件

### Modified Files

- `src/views/ChatInput.tsx` - 集成 `/` 触发和 Skill 标签显示
- `src/views/AiChatPanel.tsx` - 集成 Skill 状态到消息发送流程
- `src/services/ai-tools.ts` - 支持按 Skill 过滤工具 (`filterToolsBySkill`)
- `src/utils/text-utils.ts` - 修复 `safeText` 支持字符串类型的 content

## Implementation Status

### Phase 1: 用户主动选择 ✅
- [x] `skill-store.ts` - 类型定义与状态管理
- [x] `skill-service.ts` - Skill 加载和解析服务
- [x] `SkillPicker.tsx` - Skill 选择器 UI
- [x] `SkillChip.tsx` - Skill 标签组件
- [x] `ChatInput.tsx` - `/` 触发集成
- [x] `AiChatPanel.tsx` - 消息发送集成
- [x] `ai-tools.ts` - `filterToolsBySkill()` 工具过滤

### Phase 2: 变量支持（计划中）
- [ ] 变量声明解析
- [ ] 变量填写弹窗
- [ ] 变量替换

### Phase 3: AI 动态发现与调用（核心目标）⭐

**愿景**：AI 能够根据用户意图自动发现并使用相关 Skill，无需用户手动选择。

**场景示例**：
- 用户："翻译下这个内容" → AI 自动搜索 `#skill`，找到翻译相关的 prompt skill，应用后进行翻译
- 用户："把这个写入到笔记里" → AI 自动搜索 `#skill`，找到写入相关的 tool skill，调用相应工具

**核心功能**：
1. **`searchSkills` 工具** - AI 可搜索可用的 Skills
   ```typescript
   searchSkills({ query?: string, type?: "prompt" | "tools" })
   // 返回: [{ id, name, description, type }]
   ```

2. **`getSkillDetails` 工具** - AI 获取 Skill 完整内容
   ```typescript
   getSkillDetails({ skillId: number })
   // 返回: { id, name, description, type, prompt, tools }
   ```

3. **`useSkillPrompt` 工具** - AI 动态应用 Skill 指令
   ```typescript
   useSkillPrompt({ skillId: number })
   // 效果: 将 Skill 的 prompt 注入到当前对话上下文
   ```

4. **精简 System Prompt** - 只需告诉 AI：
   > "你可以使用 searchSkills 搜索用户定义的技能，根据用户意图自动选择合适的技能来完成任务。"

5. **自动初始化预置 Skills** ✨
   - 首次使用插件时，自动检查笔记库是否存在 `#skill` 标签的块
   - 如果没有，自动创建 "AI Skills" 页面并生成预置 Skills
   - 预置 Skills 包含：翻译助手、内容总结、写入笔记、搜索笔记等
   - 用户可随时修改、删除、添加自定义 Skills

**设计原则**：
- Skills 成为 AI 的"知识库"，AI 按需查阅
- System Prompt 极简化，核心规则 + Skill 发现提示
- 用户定义的 Skills 是 AI 能力的扩展点
- 预置 Skills 降低使用门槛，展示系统能力

### Phase 4: 体验优化（计划中）
- [ ] 消息气泡显示使用的 Skill
- [ ] Skill 使用统计
- [ ] Skill 推荐

## Impact

- **Affected specs**: skill-system (NEW)
- **Affected code**:
  - `src/views/ChatInput.tsx`
  - `src/views/AiChatPanel.tsx`
  - `src/services/ai-tools.ts`
  - `src/utils/text-utils.ts`
  - New files: `skill-service.ts`, `skill-store.ts`, `SkillPicker.tsx`, `SkillChip.tsx`

## Migration

- **向后兼容**：不选择 Skill 时，行为与当前版本一致
- **无数据迁移**：Skill 数据存储在用户笔记中，不涉及插件数据迁移
