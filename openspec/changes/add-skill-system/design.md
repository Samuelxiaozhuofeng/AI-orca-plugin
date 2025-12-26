## Context

Orca Note AI Chat 插件目前使用硬编码的工具集和固定的系统提示词。本设计将 AI 能力外置到用户笔记中，通过 `#skill` 标签让用户自定义 AI 技能。

### Stakeholders
- **用户**：需要创建、管理、调用自定义 AI 技能
- **AI 模型**：需要接收动态注入的技能指令和工具集
- **插件**：需要解析技能定义、构建动态 prompt

### Constraints
- 使用现有 Orca API（`get-blocks-with-tags`、`get-block-tree`）
- 遵循现有代码模式（Valtio store、createElement）
- 保持向后兼容（不选 Skill 时行为不变）
- **最省改动原则**：复用现有 ContextPicker/ContextChips 模式

## Goals / Non-Goals

### Goals
- 用户可在笔记中定义 Skill（工具型/提示词型）
- 输入框 `/` 触发 Skill 选择菜单
- 选中 Skill 后显示为标签卡片
- Skill 指令动态注入到 System Prompt
- 工具型 Skill 可限制可用工具集
- 支持 Skill 变量（V1.1 阶段实现）

### Non-Goals
- Skill 权限管理（如限制工具写入能力）
- Skill 版本控制
- Skill 市场/分享功能
- Skill 嵌套/组合
- 多 Skill 同时激活

---

## 交互设计决策（最省改动方案）

### D-UI-1: 触发规则

**决策**: 复用 `@` 触发模式，`/` 在行首或空格/换行后触发

**规则**:
- 仅在 `pos === 0` 或 `charBefore === ' '` 或 `charBefore === '\n'` 时触发
- 中文 IME composing 期间不触发（检查 `e.nativeEvent?.isComposing`）
- `/` 字符不插入输入框

**理由**: 与现有 `@` 触发逻辑一致，代码可直接复用 `handleKeyDown` 中的模式。

### D-UI-2: 触发后输入体验

**决策**: 直接打开菜单，后续键入作为菜单搜索词

**行为**:
1. 用户按 `/` → 打开 SkillPicker 菜单
2. 菜单获得焦点，用户继续键入 → 过滤 Skill 列表
3. Enter 选中 / Esc 关闭 / 点击外部关闭

**理由**: 与 VS Code、Notion 等主流应用的 `/` 命令行为一致。

### D-UI-3: 选择后输入框行为

**决策**: 清空搜索词，显示 SkillChip，焦点回到输入框

**行为**:
1. 用户选择 Skill → 关闭菜单
2. 输入框清空（搜索词不保留）
3. 显示 SkillChip + 空输入框
4. 焦点自动回到 textarea

**理由**: 简化实现，用户选择 Skill 后通常会重新输入内容。

### D-UI-4: 菜单交互

**决策**: 支持键盘导航和鼠标操作

**支持**:
- ↑↓ 键导航列表
- Enter 选中高亮项
- Esc 关闭菜单
- 鼠标点击选中
- 鼠标悬停无特殊预览（简化实现）

**理由**: 复用 ContextPicker 的浮层模式，添加键盘导航提升效率。

### D-UI-5: 菜单排序

**决策**: 按名称拼音排序，不分组

**规则**:
- 使用 `localeCompare` 排序
- 不区分 tools/prompt 类型（减少复杂度）
- 搜索结果实时过滤

**理由**: 简化实现，后续可按需添加"最近使用"排序。

### D-UI-6: 空状态处理

**决策**: 显示创建引导文案

**内容**:
```
暂无可用技能
在笔记中创建带 #skill 标签的块即可定义技能
```

**理由**: 无需"一键创建"按钮（涉及复杂的块创建流程），文案引导足够。

### D-UI-7: SkillChip 行为

**决策**: 点击 Chip 无动作，仅支持 X 删除

**行为**:
- 点击 Chip 主体：无动作（V1 简化）
- 点击 X 按钮：移除当前 Skill
- 无"切换"按钮（用户可先删除再重新 `/` 选择）

**理由**: 复用 ContextChips 样式，最小化新增交互。

### D-UI-8: 多 Skill 激活

**决策**: 只允许 1 个 Skill，切换时保留输入内容

**行为**:
- 输入 `/` 时如已有 Skill，打开菜单供切换
- 选择新 Skill 后替换旧 Skill
- 输入框已有的文本内容保留

**理由**: 多 Skill 叠加涉及复杂的 prompt 合并逻辑，V1 不支持。

### D-UI-9: 变量弹窗时机（V1.1）

**决策**: 发送时检测，缺变量则弹窗拦截

**行为**:
1. 用户点击发送
2. 检测 Skill prompt 中是否有未填 `{变量名}`
3. 如有 → 弹窗要求填写
4. 填写完成 → 替换变量 → 发送
5. 取消弹窗 → 不发送，输入框内容保留

**理由**: 延迟到发送时检测，避免选择 Skill 时弹窗干扰。

### D-UI-10: 变量持久化（V1.1）

**决策**: 本会话内沿用，新会话重置

**规则**:
- 变量值存储在 `skillStore.variables`
- 切换 Skill 不清空（可能有同名变量）
- 关闭 Chat Panel / 新建会话时清空

**理由**: 会话级持久化平衡了便利性和复杂度。

### D-UI-11: 变量缺失提示（V1.1）

**决策**: 发送按钮保持可用，点击后弹窗拦截

**理由**: 禁用按钮需要实时检测变量状态，增加复杂度；弹窗拦截更简单。

### D-UI-12: 工具限制展示

**决策**: 不在 UI 显示，仅后台过滤

**行为**:
- SkillChip 不显示 `tools: N`
- 工具型 Skill 的工具限制在 API 调用时静默过滤
- 消息气泡中可选显示"使用了 XX 技能"（V1.1）

**理由**: 简化 UI，用户更关心结果而非技术细节。

### D-UI-13: 解析失败处理

**决策**: 跳过无效 Skill，不显示在列表中

**规则**:
- 缺少 `类型` 字段 → 跳过
- 解析异常 → 跳过并 console.warn
- 不显示"灰色不可选"（减少视觉噪音）

**理由**: 简化实现，无效 Skill 静默忽略。

### D-UI-14: 消息历史可见性

**决策**: V1 不显示，V1.1 可选添加

**V1 行为**: 消息气泡不显示使用了哪个 Skill
**V1.1 可选**: 在 assistant 消息末尾添加 `[技能: XX]` 标记

**理由**: 减少 V1 范围，核心功能优先。

### D-UI-15: 刷新机制

**决策**: 会话级缓存，无手动刷新按钮

**行为**:
- 新建会话 / 重新打开 Chat Panel → 刷新缓存
- 当前会话内编辑 Skill 不自动刷新
- 如当前 Skill 被删除 → SkillChip 保留，发送时可能报错

**理由**: 简化实现，用户可通过新建会话刷新。

### D-UI-16: 与 ContextPicker 一致性

**决策**: 共用浮层样式，独立触发快捷键

**规则**:
- SkillPicker 复用 ContextPicker 的浮层样式（背景、阴影、圆角）
- 触发键不同：`@` = Context，`/` = Skill
- 两者可共存（ContextChips + SkillChip 同时显示）

### D-UI-17: 冲突处理

**决策**: 非触发位置的 `/` 正常输入

**规则**:
- `/` 在行首/空格后 → 触发菜单
- `/` 在其他位置（如 `1/2`、`/home`）→ 正常插入
- 如需在触发位置输入 `/`：先输入空格再删除（workaround）

**理由**: 与 `@` 触发规则一致，覆盖大部分场景。

---

## 技术决策

### D1: Skill 存储格式

**Decision**: 使用 `#skill` 标签 + 标签 Properties + 子块结构存储 Skill 定义

**实际格式** (基于 Orca 的 Tag Properties 系统):
```
父块: "翻译助手" + #skill 标签
  └─ #skill 标签的 Properties:
       - type: ["prompt"]  (TextChoices 类型，值为 "prompt" 或 "tool")
  └─ 子块1: "你是一个专业翻译..."
  └─ 子块2: "请将用户的内容翻译成目标语言..."
```

**数据结构**:
- **父块内容**: Skill 名称（如 "翻译助手"）
- **#skill 标签**: 附加在父块上
- **标签 Properties**:
  - `type`: TextChoices (PropType 6)，值为 `["prompt"]` 或 `["tool"]`
  - `tools`: TextChoices (可选)，工具型 Skill 的工具列表
- **子块内容**: 全部拼接作为 prompt 内容

**向后兼容格式** (子块定义方式):
```
- 翻译助手 #skill
  - 类型: prompt
  - 描述: 将内容翻译成目标语言
  - 提示词: 你是一个专业翻译...
```

**解析规则**:
1. 优先读取 `#skill` 标签的 Properties 获取类型
2. 如果标签没有 Properties，尝试从子块解析 `类型: xxx`
3. 如果都没有找到类型，默认为 `prompt` 类型
4. 所有非元数据子块（非类型/描述/工具定义）内容拼接为 prompt
5. 关键字匹配（大小写不敏感）：`类型`/`Type`、`描述`/`Description`、`工具`/`Tools`
6. 分隔符容错：`:` 和 `：` 都识别
7. 逗号容错：`,` 和 `，` 都识别

### D2: Skill 加载策略

**Decision**: 一次性加载完整 Skill（放弃惰性加载）

**理由**:
- 惰性加载需要两次 API 调用（元数据 + 完整内容）
- `get-block-tree` 返回完整子块，无法只取元数据
- 一次性加载简化实现，Skill 数量通常不多（<50）

**实际实现**:
```typescript
async function loadAllSkills(): Promise<Skill[]> {
  const blocks = await searchBlocksByTag("skill", 100);
  const skills: Skill[] = [];

  for (const block of blocks) {
    // 获取块树以读取完整的 tags 信息和子块
    const tree = await orca.invokeBackend("get-block-tree", block.id);

    // 使用 tree 作为根块（包含完整的 tags 和 properties）
    const rootBlock = tree || block;
    const skill = parseSkillFromTree(rootBlock, tree);

    if (skill) skills.push(skill);
  }
  return skills;
}
```

**关键发现**:
- `searchBlocksByTag` 返回的块不包含完整的 `tags` 信息
- 需要用 `get-block-tree` 返回的 `tree` 对象作为根块解析
- `tree` 包含 `tags` 数组，每个 tag 有 `name` 和 `properties`
- `tree.children` 包含子块内容

### D3: System Prompt 注入

**Decision**: 保留核心规则 + 追加 Skill 指令

**关键变更**:
- **不使用简化 Prompt**：保留 `{maxToolRounds}`、写入约束等核心规则
- 在默认 Prompt 末尾追加 Skill 指令

**拼接格式**:
```
{DEFAULT_SYSTEM_PROMPT}

---
## 当前激活技能: {skillName}
{skillDescription}

{skillPrompt}
```

**理由**: 避免丢失全局规则导致模型行为异常。

### D4: 工具集过滤

**Decision**: 工具名称规范化 + 别名映射

**问题**: 现有工具名有两种风格：
- camelCase: `queryBlocksByTag`, `searchBlocksByTag`
- snake_case: `get_tag_schema`, `query_blocks`

**解决方案**:
```typescript
const TOOL_ALIASES: Record<string, string> = {
  "get_tag_schema": "get_tag_schema",
  "getTagSchema": "get_tag_schema",
  "query_blocks": "query_blocks",
  "queryBlocks": "query_blocks",
  // ... 其他别名
};

function normalizeToolName(name: string): string {
  return TOOL_ALIASES[name] ?? name;
}
```

**过滤逻辑**:
```typescript
function filterToolsBySkill(skill: Skill | null): OpenAITool[] {
  if (!skill || skill.type !== 'tools' || !skill.tools?.length) {
    return TOOLS;
  }
  const normalizedNames = new Set(skill.tools.map(normalizeToolName));
  return TOOLS.filter(t => normalizedNames.has(t.function.name));
}
```

### D5: 多轮工具调用一致性

**Decision**: 在 `handleSend` 开头计算一次 `activeTools`，全程复用

**实现**:
```typescript
async function handleSend(content: string) {
  // 计算当前 Skill 的工具集（一次性）
  const activeTools = filterToolsBySkill(skillStore.activeSkill);

  // 所有 streamChatWithRetry 调用都使用 activeTools
  for await (const chunk of streamChatWithRetry({
    ...config,
    tools: activeTools,  // 而非 TOOLS
  }, ...)) { ... }
}
```

### D6: 状态管理

**Decision**: 新建 `skill-store.ts`

```typescript
import { proxy } from 'valtio';

export interface SkillMeta {
  id: number;
  name: string;
  description: string;
  type: 'tools' | 'prompt';
}

export interface Skill extends SkillMeta {
  prompt: string;
  tools?: string[];  // 仅 type='tools' 时有值
  variables?: string[];  // 变量名列表
}

export const skillStore = proxy({
  skills: [] as Skill[],
  skillsLoaded: false,
  activeSkill: null as Skill | null,
  variables: {} as Record<string, string>,
});

export function setActiveSkill(skill: Skill | null) {
  skillStore.activeSkill = skill;
}

export function clearSkill() {
  skillStore.activeSkill = null;
  skillStore.variables = {};
}

export function setVariable(name: string, value: string) {
  skillStore.variables[name] = value;
}
```

---

## 技术风险规避

### R1: 解析容错

**风险**: 用户格式多样导致解析失败

**规避措施**:
1. 关键字大小写不敏感
2. 中英文冒号都识别：`/:：/`
3. 中英文逗号都识别：`/,，/`
4. 首行作为 Skill 名称，`#skill` 标签剔除
5. 多行 prompt 支持：拼接同一子块的所有文本

### R2: 变量语法冲突

**风险**: `{变量}` 与代码/JSON 冲突

**规避措施**:
1. 仅替换 Skill prompt 中的变量，不替换用户输入
2. 变量名仅允许中英文和下划线：`/^[\w\u4e00-\u9fa5]+$/`
3. 未声明的 `{xxx}` 不替换（保留原样）

### R3: 缓存竞态

**风险**: 并发请求覆盖状态

**规避措施**:
1. 使用 `mounted` 标志避免组件卸载后更新状态
2. 加载时设置 `skillsLoading = true`，阻止重复请求
3. 选择 Skill 时直接使用已加载的数据（无需二次请求）

### R4: 工具名不匹配

**风险**: 用户写错工具名导致过滤失败

**规避措施**:
1. 工具名规范化 + 别名映射
2. 无法识别的工具名 → console.warn 提示
3. 如果所有工具名都无效 → 回退到全部工具

### R5: 全局规则丢失

**风险**: 简化 Prompt 丢失 `{maxToolRounds}` 等替换

**规避措施**:
- **不简化默认 Prompt**，仅追加 Skill 指令
- 复用现有 `systemPrompt.split("{maxToolRounds}").join(...)` 逻辑

---

## File Structure

```
src/
├── services/
│   └── skill-service.ts          # Skill 加载/解析
├── store/
│   └── skill-store.ts            # Skill 状态管理
├── views/
│   ├── SkillPicker.tsx           # Skill 选择菜单
│   └── SkillChip.tsx             # 输入框内的 Skill 标签
└── utils/
    └── skill-parser.ts           # Skill 定义解析（可合并到 service）
```

---

## 分阶段实现

### V1: 核心功能
- Skill 加载/解析
- `/` 触发 SkillPicker
- SkillChip 显示/删除
- 工具型 Skill 过滤
- prompt 追加注入

### V1.1: 变量支持
- 变量声明解析
- 发送时变量检测
- 变量填写弹窗
- 变量替换

### V1.2: 体验优化
- 消息气泡显示使用的 Skill
- 刷新 Skill 列表按钮
- Skill 使用频率排序

### V2: AI 动态发现与调用（核心目标）⭐

**愿景转变**：从"用户选择 Skill"到"AI 自动发现并使用 Skill"

#### 设计理念

当前 V1 的模式是**用户主动**：用户通过 `/` 触发选择器，手动选择要使用的 Skill。
V2 的目标是**AI 自动**：AI 根据用户意图，自动搜索、匹配、调用相关的 Skill。

**核心价值**：
1. **System Prompt 极简化** - 核心规则 + "你可以使用 searchSkills 发现用户定义的技能"
2. **Skills 成为 AI 的知识库** - AI 按需查阅，而非预先加载
3. **用户定义能力扩展点** - 用户通过 `#skill` 标签扩展 AI 的能力边界

#### 新增 AI 工具

##### 1. `searchSkills` - 搜索可用技能

```typescript
{
  name: "searchSkills",
  description: "搜索用户定义的技能（#skill 标签）。当用户请求涉及特定领域（如翻译、写作、数据分析）时，可搜索是否有相关技能可用。",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索关键词，匹配技能名称和描述"
      },
      type: {
        type: "string",
        enum: ["prompt", "tools"],
        description: "筛选技能类型：prompt（提示词型）或 tools（工具型）"
      }
    }
  }
}
```

**返回格式**：
```json
{
  "skills": [
    { "id": 123, "name": "翻译助手", "description": "专业翻译...", "type": "prompt" },
    { "id": 456, "name": "写入助手", "description": "写入笔记...", "type": "tools" }
  ],
  "total": 2
}
```

##### 2. `getSkillDetails` - 获取技能详情

```typescript
{
  name: "getSkillDetails",
  description: "获取指定技能的完整内容，包括提示词、工具列表等。",
  parameters: {
    type: "object",
    properties: {
      skillId: {
        type: "number",
        description: "技能 ID（从 searchSkills 结果获取）"
      }
    },
    required: ["skillId"]
  }
}
```

**返回格式**：
```json
{
  "id": 123,
  "name": "翻译助手",
  "description": "专业翻译服务",
  "type": "prompt",
  "prompt": "你是一个专业的翻译助手。请将用户提供的内容翻译成目标语言，保持原意，语句通顺自然。",
  "variables": ["目标语言"]
}
```

##### 3. `applySkillPrompt` - 应用技能指令

```typescript
{
  name: "applySkillPrompt",
  description: "将技能的提示词应用到当前任务。调用后，你应按照技能定义的指令行事。",
  parameters: {
    type: "object",
    properties: {
      skillId: {
        type: "number",
        description: "要应用的技能 ID"
      },
      variables: {
        type: "object",
        description: "变量键值对，用于替换技能提示词中的 {变量名}"
      }
    },
    required: ["skillId"]
  }
}
```

**返回格式**：
```json
{
  "success": true,
  "skillName": "翻译助手",
  "appliedPrompt": "你是一个专业的翻译助手。请将用户提供的内容翻译成西班牙语，保持原意，语句通顺自然。"
}
```

**效果**：AI 读取 prompt 后，在后续回复中遵循该指令。

#### System Prompt 演进

**V1 模式**（当前）：完整的规则 + 当前激活的 Skill prompt

**V2 模式**（目标）：精简核心规则 + Skill 发现提示

```
你是 Orca Note 的 AI 助手。

## 核心能力
- 你可以使用提供的工具搜索和操作用户的笔记
- 你可以使用 searchSkills 发现用户定义的技能（#skill 标签）

## 技能系统
当用户请求涉及特定领域时（如翻译、写作、数据处理），你应该：
1. 使用 searchSkills 搜索相关技能
2. 使用 getSkillDetails 获取技能详情
3. 使用 applySkillPrompt 应用技能指令
4. 按照技能定义的方式完成任务

## 工具调用规则
- 最多进行 {maxToolRounds} 轮工具调用
- 写入操作需要用户确认
```

#### 工作流程示例

**场景：用户请求翻译**

```
用户: "请把这段内容翻译成西班牙语：Hello World"

AI 思考: 用户需要翻译，让我检查是否有翻译相关的技能

AI 调用: searchSkills({ query: "翻译" })
结果: [{ id: 123, name: "翻译助手", type: "prompt" }]

AI 调用: getSkillDetails({ skillId: 123 })
结果: { prompt: "你是专业翻译..." }

AI 调用: applySkillPrompt({ skillId: 123, variables: { "目标语言": "西班牙语" } })
结果: { appliedPrompt: "你是专业翻译...翻译成西班牙语..." }

AI 回复: 根据翻译技能的指令，我将为您翻译：
"Hola Mundo"
```

**场景：用户请求写入笔记**

```
用户: "把这个总结写入到'项目笔记'页面"

AI 思考: 用户需要写入笔记，让我检查是否有写入相关的技能

AI 调用: searchSkills({ query: "写入", type: "tools" })
结果: [{ id: 456, name: "笔记写入", type: "tools", tools: ["createBlock"] }]

AI 思考: 找到写入技能，直接使用 createBlock 工具

AI 调用: createBlock({ pageName: "项目笔记", content: "总结内容..." })
```

#### 实现策略

##### 方案 A：完全动态（推荐）

- AI 工具返回 Skill 内容，AI 自行理解并应用
- 不需要修改对话上下文结构
- 更灵活，符合 MCP 设计理念

##### 方案 B：混合模式

- 保留 V1 的用户选择机制
- 添加 AI 动态发现作为补充
- 用户选择优先于 AI 自动选择

**推荐方案 A**：完全动态模式更符合长期愿景，且实现更简洁。

#### 技术要点

1. **工具返回格式**：Skill prompt 作为字符串返回，AI 自行解读并遵循
2. **无状态设计**：`applySkillPrompt` 不修改 store，只返回 prompt 内容
3. **工具型 Skill**：仅返回可用工具列表，不实际过滤（AI 自行决定使用哪些）
4. **缓存策略**：首次调用 searchSkills 时加载并缓存 Skill 列表

---

### V2.1: 自动初始化预置 Skills ✨

#### 设计理念

**问题**：如果用户没有创建任何 `#skill`，AI 动态发现功能就没有价值。

**解决方案**：首次使用插件时，自动创建预置 Skills，降低使用门槛。

#### 触发条件

```typescript
async function ensureDefaultSkills(): Promise<void> {
  // 1. 检查是否已有任何 skill
  const existingSkills = await searchBlocksByTag("skill", 1);

  if (existingSkills.length > 0) {
    // 已有 skill，跳过初始化
    return;
  }

  // 2. 创建 "AI Skills" 页面和预置 skills
  await createDefaultSkillsPage();

  // 3. 通知用户
  orca.notify("info", "已为您创建 AI 技能模板，可在笔记中自定义");
}
```

**触发时机**：
- 插件加载时（`load()` 函数中）
- 或首次打开 AI Chat Panel 时

#### 预置 Skills 内容

```
AI Skills（页面，作为根块）
│
├── 翻译助手 #skill
│   └── 请将用户提供的内容翻译为目标语言。保持原意，语句通顺自然。
│       如果用户未指定目标语言，请先询问。
│
├── 内容总结 #skill
│   └── 请总结以下内容的要点：
│       1. 提取核心观点（3-5 个）
│       2. 使用简洁的语言
│       3. 保留关键数据和结论
│
├── 写作润色 #skill
│   └── 请优化以下文字的表达：
│       1. 改进语句通顺度
│       2. 修正语法错误
│       3. 提升专业性和可读性
│       4. 保持原意不变
│
├── 笔记整理 #skill (type: tools)
│   └── 类型: tools
│   └── 工具: createBlock, insertTag, createPage
│   └── 提示词: 专注于帮助用户整理和写入笔记内容。
│       在写入前，确认用户想要的位置和格式。
│
└── 知识检索 #skill (type: tools)
    └── 类型: tools
    └── 工具: searchBlocksByTag, searchBlocksByText, queryBlocksByTag, getPage
    └── 提示词: 专注于帮助用户搜索和查找笔记内容。
        优先使用精确搜索，必要时使用模糊搜索。
```

#### 数据结构设计

预置 Skills 定义为常量，便于维护和国际化：

```typescript
// src/constants/default-skills.ts

export interface DefaultSkillDefinition {
  name: string;
  type: "prompt" | "tools";
  description?: string;
  prompt: string;
  tools?: string[];
}

export const DEFAULT_SKILLS: DefaultSkillDefinition[] = [
  {
    name: "翻译助手",
    type: "prompt",
    description: "将内容翻译为目标语言",
    prompt: `请将用户提供的内容翻译为目标语言。保持原意，语句通顺自然。
如果用户未指定目标语言，请先询问。`,
  },
  {
    name: "内容总结",
    type: "prompt",
    description: "提取内容要点",
    prompt: `请总结以下内容的要点：
1. 提取核心观点（3-5 个）
2. 使用简洁的语言
3. 保留关键数据和结论`,
  },
  {
    name: "写作润色",
    type: "prompt",
    description: "优化文字表达",
    prompt: `请优化以下文字的表达：
1. 改进语句通顺度
2. 修正语法错误
3. 提升专业性和可读性
4. 保持原意不变`,
  },
  {
    name: "笔记整理",
    type: "tools",
    description: "整理和写入笔记",
    prompt: "专注于帮助用户整理和写入笔记内容。在写入前，确认用户想要的位置和格式。",
    tools: ["createBlock", "insertTag", "createPage"],
  },
  {
    name: "知识检索",
    type: "tools",
    description: "搜索和查找笔记",
    prompt: "专注于帮助用户搜索和查找笔记内容。优先使用精确搜索，必要时使用模糊搜索。",
    tools: ["searchBlocksByTag", "searchBlocksByText", "queryBlocksByTag", "getPage"],
  },
];

export const DEFAULT_SKILLS_PAGE_NAME = "AI Skills";
```

#### 创建流程

```typescript
// src/services/skill-initializer.ts

import { DEFAULT_SKILLS, DEFAULT_SKILLS_PAGE_NAME } from "../constants/default-skills";

export async function createDefaultSkillsPage(): Promise<void> {
  // 1. 在日记或根位置创建 "AI Skills" 页面
  //    使用 createBlock + createPage 组合
  const rootBlockId = await findOrCreateRootBlock();

  const pageBlock = await createBlock({
    refBlockId: rootBlockId,
    position: "lastChild",
    content: DEFAULT_SKILLS_PAGE_NAME,
  });

  await createPage({
    blockId: pageBlock.id,
    pageName: DEFAULT_SKILLS_PAGE_NAME,
  });

  // 2. 为每个预置 Skill 创建块
  for (const skill of DEFAULT_SKILLS) {
    // 创建 skill 根块
    const skillBlock = await createBlock({
      refBlockId: pageBlock.id,
      position: "lastChild",
      content: skill.name,
    });

    // 添加 #skill 标签（带 type property）
    await insertTag({
      blockId: skillBlock.id,
      tagName: "skill",
      properties: [
        { name: "type", value: skill.type },
      ],
    });

    // 创建子块（prompt 内容）
    if (skill.type === "tools" && skill.tools) {
      // 工具型：先创建工具列表
      await createBlock({
        refBlockId: skillBlock.id,
        position: "lastChild",
        content: `工具: ${skill.tools.join(", ")}`,
      });
    }

    // 创建 prompt 子块
    await createBlock({
      refBlockId: skillBlock.id,
      position: "lastChild",
      content: skill.prompt,
    });
  }

  console.log(`[skill-initializer] Created default skills page with ${DEFAULT_SKILLS.length} skills`);
}
```

#### 用户体验流程

```
┌─────────────────────────────────────────────────────────────┐
│  首次使用插件                                                 │
├─────────────────────────────────────────────────────────────┤
│  1. 用户安装插件并打开 AI Chat                                │
│  2. 插件检测到没有任何 #skill                                 │
│  3. 自动创建 "AI Skills" 页面 + 5 个预置技能                  │
│  4. 显示提示: "已为您创建 AI 技能模板，可在笔记中自定义"        │
│  5. 用户可以:                                                 │
│     - 直接使用预置技能（AI 自动发现）                          │
│     - 修改预置技能内容                                        │
│     - 删除不需要的技能                                        │
│     - 添加自己的新技能                                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  后续使用                                                    │
├─────────────────────────────────────────────────────────────┤
│  1. 用户: "帮我翻译这段话"                                    │
│  2. AI: searchSkills({ query: "翻译" })                      │
│  3. AI: 找到 "翻译助手" skill                                 │
│  4. AI: getSkillDetails({ skillId: xxx })                    │
│  5. AI: 按照 skill 的 prompt 指令进行翻译                     │
│  6. AI: "请问您想翻译成什么语言？"                            │
└─────────────────────────────────────────────────────────────┘
```

#### 配置选项

```typescript
// src/settings/ai-chat-settings.ts 扩展

interface AiChatSettings {
  // ... 现有设置

  /** 是否自动创建预置 Skills（默认 true） */
  autoCreateDefaultSkills: boolean;

  /** 预置 Skills 页面名称（默认 "AI Skills"） */
  defaultSkillsPageName: string;
}
```

#### 边界情况处理

1. **用户手动删除了所有 skills**
   - 不会重新创建（只在首次检测时创建）
   - 可通过设置中的"重置默认技能"按钮手动触发

2. **用户修改了预置 skills**
   - 修改后的内容保留，不会被覆盖

3. **多设备同步**
   - Skills 存储在笔记中，自动同步
   - 每个设备都会检测，但只要有 skill 就不会重复创建

4. **创建失败**
   - 捕获错误，显示提示
   - 不阻止插件正常使用
