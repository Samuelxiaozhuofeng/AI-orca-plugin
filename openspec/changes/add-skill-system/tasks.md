# Skill System - Implementation Tasks

## Phase 1: V1 Core (核心功能)

### 1.1 类型定义与状态管理
- [x] 1.1.1 创建 `src/store/skill-store.ts`
  - 定义 `SkillMeta` 接口（id, name, description, type）
  - 定义 `Skill` 接口（含 prompt, tools）
  - 实现 `skillStore` (Valtio proxy)
  - 实现 `setActiveSkill()`, `clearSkill()`

### 1.2 Skill 解析服务
- [x] 1.2.1 创建 `src/services/skill-service.ts`
- [x] 1.2.2 实现 `loadAllSkills()`: 加载所有 Skill
  - 调用 `searchBlocksByTag("skill")` 获取 Skill 块
  - 对每个块调用 `get-block-tree` 获取子块
  - 解析并返回 `Skill[]`
- [x] 1.2.3 实现 `parseSkillFromTree()`: 解析单个 Skill
  - 关键字匹配（大小写不敏感）：类型/Type, 描述/Description, 提示词/Prompt, 工具/Tools
  - 分隔符容错：`:` 和 `：`
  - 逗号容错：`,` 和 `，`
  - 无效 Skill → console.warn 并跳过
- [x] 1.2.4 实现 `normalizeToolName()`: 工具名规范化
  - 建立别名映射表（camelCase → snake_case）
  - 处理未知工具名警告

### 1.3 Skill 选择器 UI
- [x] 1.3.1 创建 `src/views/SkillPicker.tsx`
  - 复用 ContextPicker 浮层样式
  - 显示 Skill 列表（名称 + 描述）
  - 搜索过滤功能
  - 空状态提示
- [x] 1.3.2 实现键盘导航
  - ↑↓ 导航
  - Enter 选中
  - Esc 关闭
- [x] 1.3.3 实现 Skill 选中逻辑
  - 点击/Enter → setActiveSkill()
  - 关闭菜单
  - 焦点回到输入框

### 1.4 Skill 标签组件
- [x] 1.4.1 创建 `src/views/SkillChip.tsx`
  - 复用 ContextChips 样式
  - 显示 Skill 名称 + X 按钮
  - 点击 X → clearSkill()

### 1.5 ChatInput 集成
- [x] 1.5.1 修改 `src/views/ChatInput.tsx`
  - 添加 `/` 触发检测（复用 `@` 触发模式）
  - 阻止触发位置的 `/` 插入
  - 添加 `[skillPickerOpen, setSkillPickerOpen]` 状态
- [x] 1.5.2 渲染 SkillPicker
  - 传入 anchorRef
  - 处理 onClose
- [x] 1.5.3 渲染 SkillChip
  - 在 ContextChips 旁显示
  - 读取 `skillStore.activeSkill`

### 1.6 消息发送集成
- [x] 1.6.1 修改 `src/views/AiChatPanel.tsx` 的 `handleSend()`
  - 读取 `skillStore.activeSkill`
  - 构建 Skill prompt 追加内容
  - 计算 `activeTools` 过滤结果
- [x] 1.6.2 修改 `buildConversationMessages()` 调用
  - 传入拼接后的 systemPrompt
- [x] 1.6.3 修改所有 `streamChatWithRetry()` 调用
  - 使用 `activeTools` 替代 `TOOLS`

### 1.7 工具过滤
- [x] 1.7.1 在 `src/services/ai-tools.ts` 添加 `filterToolsBySkill()`
  - 工具名规范化
  - 白名单过滤
  - 全部无效 → 回退到全部工具

### 1.8 已发现的问题（待修复）
- [ ] 1.8.1 `get-block-tree` 返回的数据结构调试
  - `searchBlocksByTag` 返回的块不包含 `tags` 字段
  - 需要确认 `tree` 对象中 `tags` 的实际结构
  - 需要确认 `tags[].properties` 的格式
- [ ] 1.8.2 `safeText` 对不同 `content` 格式的支持
  - 已修复：支持 `content` 为字符串的情况
  - 待确认：`content` 为数组时的解析是否正确

### 1.9 实现细节记录

**文件清单**:
- `src/store/skill-store.ts` - Skill 状态管理
- `src/services/skill-service.ts` - Skill 加载和解析
- `src/views/SkillPicker.tsx` - Skill 选择器 UI
- `src/views/SkillChip.tsx` - Skill 标签组件
- `src/views/ChatInput.tsx` - 集成 `/` 触发
- `src/views/AiChatPanel.tsx` - 消息发送集成
- `src/services/ai-tools.ts` - `filterToolsBySkill()` 函数
- `src/utils/text-utils.ts` - `safeText()` 修复

**关键发现**:
- Orca 的 `#skill` 标签可以有 Properties（使用 TextChoices 类型）
- `data-type="prompt"` 在 HTML 中可见，需要从 API 返回的数据中读取
- 子块内容全部作为 prompt，无需 `提示词:` 前缀

---

## Phase 2: V1.1 Variables (变量支持)

### 2.1 变量解析
- [ ] 2.1.1 扩展 `parseSkillFromTree()` 解析变量声明
  - 解析 `变量/Variables` 字段
  - 存入 `Skill.variables: string[]`

### 2.2 变量状态管理
- [ ] 2.2.1 扩展 `skill-store.ts`
  - 添加 `variables: Record<string, string>`
  - 实现 `setVariable(name, value)`
  - 实现 `getMissingVariables(skill): string[]`

### 2.3 变量检测与弹窗
- [ ] 2.3.1 创建 `src/views/SkillVariableDialog.tsx`
  - 显示缺失变量列表
  - 输入框填写
  - 确认/取消按钮
- [ ] 2.3.2 修改 `handleSend()` 添加变量检测
  - 发送前检测缺失变量
  - 显示弹窗
  - 填写完成后继续发送

### 2.4 变量替换
- [ ] 2.4.1 实现 `replaceVariables(prompt, variables): string`
  - 替换 `{变量名}` 为实际值
  - 未声明的 `{xxx}` 保留原样

---

## Phase 3: V2 AI Dynamic Discovery (AI 动态发现与调用) ⭐

**核心目标**：让 AI 能够根据用户意图自动发现并使用相关 Skill，无需用户手动选择。

### 3.1 新增 AI 工具 - searchSkills
- [x] 3.1.1 在 `src/services/ai-tools.ts` 添加 `searchSkills` 工具定义
  - 参数: `query?: string`, `type?: "prompt" | "tools"`
  - 返回: `{ skills: SkillMeta[], total: number }`
- [x] 3.1.2 实现 `executeSearchSkills()` 函数
  - 调用 `ensureSkillsLoaded()` 确保缓存
  - 根据 query 过滤 skill.name 和 skill.description
  - 根据 type 过滤 skill.type
- [x] 3.1.3 注册到 TOOLS 数组和 executeTool switch

### 3.2 新增 AI 工具 - getSkillDetails
- [x] 3.2.1 在 `src/services/ai-tools.ts` 添加 `getSkillDetails` 工具定义
  - 参数: `skillId: number` (required)
  - 返回: 完整的 Skill 对象（含 prompt, tools, variables）
- [x] 3.2.2 实现 `executeGetSkillDetails()` 函数
  - 从缓存查找 skill by id
  - 未找到返回错误信息
- [x] 3.2.3 注册到 TOOLS 数组和 executeTool switch

### 3.3 新增 AI 工具 - applySkillPrompt（可选）
- [ ] 3.3.1 在 `src/services/ai-tools.ts` 添加 `applySkillPrompt` 工具定义
  - 参数: `skillId: number`, `variables?: Record<string, string>`
  - 返回: `{ success, skillName, appliedPrompt }`
- [ ] 3.3.2 实现 `executeApplySkillPrompt()` 函数
  - 查找 skill，替换变量，返回最终 prompt
  - 复用 `replaceVariables()` 函数
- [ ] 3.3.3 注册到 TOOLS 数组和 executeTool switch

**注意**：`applySkillPrompt` 是可选的，因为 AI 可以直接从 `getSkillDetails` 获取 prompt 并自行应用。

### 3.4 精简 System Prompt
- [ ] 3.4.1 创建 `src/constants/system-prompts.ts`
  - V1_SYSTEM_PROMPT: 当前完整版本
  - V2_SYSTEM_PROMPT: 精简版本 + Skill 发现提示
- [ ] 3.4.2 在设置中添加 System Prompt 版本选项
  - 允许用户选择 V1（完整）或 V2（精简 + Skill 发现）
- [ ] 3.4.3 修改 `handleSend()` 根据设置选择 prompt 版本

### 3.5 测试与验证
- [ ] 3.5.1 手动测试：AI 搜索 Skills
  - 创建测试 Skill（翻译助手）
  - 发送"翻译这段内容"
  - 验证 AI 调用 searchSkills
- [ ] 3.5.2 手动测试：AI 获取并应用 Skill
  - 验证 AI 调用 getSkillDetails
  - 验证 AI 按 Skill 指令完成任务
- [ ] 3.5.3 性能测试：Skill 缓存
  - 验证首次加载后缓存生效
  - 验证多次调用不重复请求

### 3.6 文档更新
- [ ] 3.6.1 更新 CLAUDE.md
  - 添加 searchSkills, getSkillDetails 工具说明
  - 添加 V2 模式使用说明
- [ ] 3.6.2 更新 README
  - 添加 Skill 系统使用指南

### 3.7 自动初始化预置 Skills ✨
- [x] 3.7.1 创建 `src/constants/default-skills.ts`
  - 定义 `DefaultSkillDefinition` 接口
  - 定义 `DEFAULT_SKILLS` 常量数组
  - 包含 5 个预置技能：翻译助手、内容总结、写作润色、笔记整理、知识检索
- [x] 3.7.2 创建 `src/services/skill-initializer.ts`
  - 实现 `ensureDefaultSkills()` 检测函数
  - 实现 `createDefaultSkillsPage()` 创建函数
  - 使用 createBlock + insertTag API 创建 skill 块结构
- [x] 3.7.3 集成到插件加载流程
  - 在 `src/main.ts` 的 `load()` 函数中调用 `ensureDefaultSkills()`
  - 或在 `AiChatPanel` 首次渲染时调用
- [x] 3.7.4 添加用户通知
  - 创建成功后显示 `orca.notify("info", "已为您创建 AI 技能模板")`
  - 创建失败时显示错误提示但不阻止使用
- [ ] 3.7.5 扩展设置选项
  - 添加 `autoCreateDefaultSkills: boolean` 设置（默认 true）
  - 添加 `defaultSkillsPageName: string` 设置（默认 "AI Skills"）
  - 添加"重置默认技能"按钮（可选）

---

## Phase 4: V2.1 Polish (体验优化)

### 4.1 消息气泡标记
- [ ] 4.1.1 在 assistant 消息末尾添加 Skill 标记
  - 格式: `[技能: XX]`
  - 可选开关

### 4.2 刷新机制
- [ ] 4.2.1 添加"刷新 Skill 列表"按钮
  - 在 SkillPicker 顶部
  - 点击重新加载

### 4.3 使用频率排序
- [ ] 4.3.1 记录 Skill 使用次数
  - 存储在 localStorage
  - 按使用频率排序

### 4.4 Skill 推荐
- [ ] 4.4.1 根据对话内容推荐相关 Skill
  - 分析用户消息关键词
  - 在 SkillPicker 中高亮推荐

---

## Testing

### Unit Tests
- [ ] T1 `tests/skill-parser.test.ts`
  - 测试 prompt-type Skill 解析
  - 测试 tools-type Skill 解析
  - 测试中英文标点容错
  - 测试无效 Skill 跳过

### Integration Tests
- [ ] T2 手动测试清单 (Phase 1)
  - 创建测试 Skill（两种类型）
  - `/` 触发菜单
  - 选择 Skill → 显示 Chip
  - 发送消息 → 验证 prompt 注入
  - 工具型 → 验证工具过滤

- [ ] T3 手动测试清单 (Phase 3 - AI 动态发现)
  - 创建翻译 Skill
  - 发送"翻译这段内容"（不手动选择 Skill）
  - 验证 AI 调用 searchSkills
  - 验证 AI 调用 getSkillDetails
  - 验证 AI 按 Skill 指令完成翻译

---

## Dependencies

```
Phase 1 (用户选择): 已完成 ✅
1.1 → 1.2 → 1.3, 1.4 (可并行)
1.3, 1.4 → 1.5
1.2, 1.5 → 1.6
1.2 → 1.7

Phase 2 (变量支持):
2.1 → 2.2 → 2.3, 2.4

Phase 3 (AI 动态发现): ⭐ 核心目标
3.1, 3.2 可并行
3.1, 3.2 → 3.3 (可选)
3.1, 3.2 → 3.4
3.4 → 3.5
3.7 可独立进行（自动初始化）

Phase 2 depends on Phase 1 完成
Phase 3 depends on Phase 1 完成（可与 Phase 2 并行）
Phase 4 depends on Phase 1 完成（可与 Phase 2, 3 并行）
```

## Parallelizable Work

- Phase 2, 3, 4 可并行开发（都基于 Phase 1）
- 3.1 (searchSkills) 和 3.2 (getSkillDetails) 可并行开发
- 3.7 (自动初始化) 可独立开发，不依赖其他 Phase 3 任务
- T1, T2, T3 可并行进行

## Priority Order (推荐实现顺序)

1. **Phase 3.7** - 自动初始化预置 Skills（立即可见的用户价值）
2. **Phase 3.1-3.2** - searchSkills + getSkillDetails（AI 动态发现核心）
3. **Phase 3.4** - 精简 System Prompt
4. **Phase 2** - 变量支持（增强 Skill 灵活性）
5. **Phase 4** - 体验优化（锦上添花）
