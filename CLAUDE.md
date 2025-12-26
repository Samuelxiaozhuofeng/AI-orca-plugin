<!-- OPENSPEC:START -->

# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:

- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:

- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# CLAUDE.md

## Project Overview

**Orca Note AI Chat Plugin** - Adds AI chat functionality to Orca Note (block-based note-taking app). Supports OpenAI-compatible chat with streaming.

## Build Commands

```bash
npm run dev      # Development with hot reload
npm run build    # Production build → dist/main.js
npm run preview  # Preview production build
```

## Architecture

### Plugin Lifecycle

- **Entry**: `src/main.ts` exports `load(name)` and `unload()` functions
- **Load**: L10N setup → Settings registration → UI registration
- **Unload**: Close panels → Unregister sidetools/menus/panels

### Core Modules

| Module          | Location                          | Purpose                                      |
| --------------- | --------------------------------- | -------------------------------------------- |
| UI Shell        | `src/ui/ai-chat-ui.ts`            | Panel registration, sidetool, toggle logic   |
| Chat Panel      | `src/views/AiChatPanel.tsx`       | Main chat UI (two-column: chat + context)    |
| Context Store   | `src/store/context-store.ts`      | Valtio store for selected blocks/pages/tags  |
| Context Builder | `src/services/context-builder.ts` | Builds text preview from ContextRef items    |
| OpenAI Client   | `src/services/openai-client.ts`   | OpenAI-compatible chat (SSE streaming)       |
| Search Service  | `src/services/search-service.ts`  | AI tools: search/query blocks                |
| Query Builder   | `src/utils/query-builder.ts`      | Builds QueryDescription2 for complex queries |
| Skill System    | `src/services/skill-service.ts`   | User-defined Skills via `#skill` tag         |

### State Management

**Valtio** (via `window.Valtio`):

- `uiStore`: Panel ID tracking, last root block ID
- `contextStore`: Selected context items, preview text
- `skillStore`: Active skill, available skills

### React Pattern

React via `window.React` (host-provided, not bundled):

```typescript
const { createElement, useState } = window.React as any;
const { useSnapshot } = window.Valtio as any;
const { Button } = orca.components;
```

### Orca Plugin API

Global `orca` object:

- `orca.state.*` - Reactive app state
- `orca.invokeBackend(type, ...args)` - Backend calls
- `orca.components.*` - UI components
- `orca.panels.registerPanel()` - Register panels
- `orca.nav.addTo()` / `orca.nav.close()` - Navigation

### Backend API Examples

```typescript
// Get block tree
const tree = await orca.invokeBackend("get-block-tree", blockId);

// Search by text (returns [aliasMatches, contentMatches])
const result = await orca.invokeBackend("search-blocks-by-text", searchText);

// Advanced query with property filters
const queryResult = await orca.invokeBackend("query", {
  q: {
    kind: 100, // SELF_AND
    conditions: [
      {
        kind: 4, // QueryTag
        name: "task",
        properties: [{ name: "priority", op: 9, v: 8 }], // priority >= 8
      },
    ],
  },
  sort: [["modified", "DESC"]],
  pageSize: 50,
});
```

**Important**: Use adapter functions for backend results:

- `unwrapBlocks()` for search results
- `unwrapBackendResult<T>()` for wrapped responses

## File Naming Conventions

- `src/ui/*.ts` - UI registration/coordination
- `src/views/*.tsx` - React components
- `src/store/*-store.ts` - State stores
- `src/services/*.ts` - Business logic
- `src/settings/*.ts` - Settings schemas

## Development Notes

### Styling

- Use `--orca-color-*` CSS variables only
- Prefer `orca.components` over custom components
- Inline styles in `createElement` calls

### Recent Updates

**v1.1.0 (2024-12-20)**: Query system with property filters  
**2024-12-22**: MCP-inspired createBlock (context-independent)  
**2024-12-24**: Markdown support, createPage, insertTag tools  
**2024-12-26**: Skill System (prompt/tools types, `/` trigger)

## AI Tools Reference

The plugin provides AI tools (automatically available during chat):

### 1. searchBlocksByTag

```typescript
searchBlocksByTag(tagName: string, maxResults?: number)
```

### 2. searchBlocksByText

```typescript
searchBlocksByText(searchText: string, maxResults?: number)
```

### 3. queryBlocksByTag

Advanced query with property filters.

```typescript
queryBlocksByTag(tagName: string, options?: {
  properties?: Array<{
    name: string;
    op: ">=" | ">" | "<=" | "<" | "==" | "!=" | "is null" | "not null" | "includes" | "not includes";
    value?: any;
  }>;
  maxResults?: number;
})
```

**Examples**:

- High-priority tasks: `queryBlocksByTag("task", { properties: [{ name: "priority", op: ">=", value: 8 }] })`
- Notes without category: `queryBlocksByTag("note", { properties: [{ name: "category", op: "is null" }] })`

### 4. createBlock

MCP-inspired context-independent block creation.

```typescript
createBlock({
  refBlockId: number, // Reference block ID
  pageName: string, // Or page name (auto-resolves)
  position: "before" | "after" | "firstChild" | "lastChild", // Default: "lastChild"
  content: string, // Block content (supports Markdown)
});
```

**Key Features**:

- Context-independent (works anywhere)
- Dual-path resolution (state → backend fallback)
- Markdown support (bold, italic, links, code)
- Page name support

**Examples**:

- By block ID: `createBlock({ refBlockId: 12345, content: "New task" })`
- By page name: `createBlock({ pageName: "项目方案", content: "新想法" })`
- With Markdown: `createBlock({ refBlockId: 100, content: "**Bold** and [[wiki link]]" })`

### 5. createPage

Create page alias for a block.

```typescript
createPage({
  blockId: number,
  pageName: string,
});
```

### 6. insertTag

Add tag to block with optional properties.

```typescript
insertTag({
  blockId: number,
  tagName: string,
  properties: Array<{ name: string; value: any }>,
});
```

**Examples**:

- Simple: `insertTag({ blockId: 100, tagName: "task" })`
- With properties: `insertTag({ blockId: 100, tagName: "task", properties: [{ name: "priority", value: 8 }] })`

## Skill System

User-defined Skills via `#skill` tag - reusable AI behaviors invoked with `/` trigger.

### Defining a Skill

```
#skill 翻译助手
  - 类型: prompt
  - 描述: 将内容翻译为目标语言
  - 提示词: 你是专业翻译助手。将内容翻译为{目标语言}。
  - 变量: 目标语言
```

```
#skill 任务搜索
  - 类型: tools
  - 描述: 只使用任务相关工具
  - 工具: searchTasks, queryBlocksByTag
  - 提示词: 专注于帮助用户查找和管理任务
```

### Skill Types

| Type     | Behavior                                  |
| -------- | ----------------------------------------- |
| `prompt` | Appends skill prompt to system message    |
| `tools`  | Filters available tools to whitelist only |

### Skill Properties

| Property         | Required | Description                    |
| ---------------- | -------- | ------------------------------ |
| 类型/Type        | Yes      | `prompt` or `tools`            |
| 描述/Description | No       | Shown in picker UI             |
| 提示词/Prompt    | No       | Additional system prompt       |
| 工具/Tools       | No       | Comma-separated tool names     |
| 变量/Variables   | No       | Comma-separated variable names |

### Using Skills

1. Type `/` in chat input (at line start or after space)
2. Select skill from picker
3. Skill chip appears above input
4. Click X to deactivate

### Architecture

| File                            | Purpose                   |
| ------------------------------- | ------------------------- |
| `src/store/skill-store.ts`      | Skill state management    |
| `src/services/skill-service.ts` | Skill loading and parsing |
| `src/views/SkillPicker.tsx`     | Skill selection UI        |
| `src/views/SkillChip.tsx`       | Active skill indicator    |
