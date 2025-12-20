# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **Orca Note AI Chat Plugin** - a plugin for Orca Note (a block-based note-taking application) that adds AI chat functionality. The plugin has UI + context building, and now supports OpenAI-compatible chat (including streaming + Stop).

## Build Commands

```bash
# Development with hot reload
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

The build outputs to `dist/main.js` as a single-file plugin.

## Architecture

### Plugin Lifecycle
- **Entry**: `src/main.ts` exports `load(name)` and `unload()` functions
- **Load sequence**: L10N setup → Settings schema registration → UI registration
- **Unload sequence**: Close panels → Unregister sidetools/menus/panels

### Core Modules

| Module | Location | Purpose |
|--------|----------|---------|
| UI Shell | `src/ui/ai-chat-ui.ts` | Panel registration, sidetool, toggle/open/close logic |
| Chat Panel | `src/views/AiChatPanel.tsx` | Main chat UI with two-column layout (chat + context) |
| Context Pane | `src/views/AiChatContextPane.tsx` | Right column for selected context display |
| Context Store | `src/store/context-store.ts` | Valtio proxy store for selected blocks/pages/tags |
| Context Builder | `src/services/context-builder.ts` | Builds text preview from ContextRef items |
| OpenAI Client | `src/services/openai-client.ts` | OpenAI-compatible chat completions (SSE streaming) |
| Settings | `src/settings/ai-chat-settings.ts` | OpenAI-compatible API settings schema |
| Context Menu | `src/ui/ai-chat-context-menu.ts` | Block/tag right-click menu entries |
| **Search Service** | `src/services/search-service.ts` | AI tool functions: searchBlocksByTag, searchBlocksByText, **queryBlocksByTag** (advanced query with property filters) |
| **Query Builder** | `src/utils/query-builder.ts` | Builds QueryDescription2 for complex queries |
| **Query Converters** | `src/utils/query-converters.ts` | Type conversion and operator mapping for query parameters |
| **Query Types** | `src/utils/query-types.ts` | TypeScript type definitions for query system |

### State Management

Uses **Valtio** (available via `window.Valtio`) for reactive state:
- `uiStore`: Panel ID tracking, last root block ID
- `contextStore`: Selected context items, preview text, building state

### React Pattern

React is accessed via `window.React` (host provides it). Components use `createElement` directly without JSX in `.tsx` files because the plugin doesn't bundle React.

```typescript
const { createElement, useState } = window.React as any;
const { useSnapshot } = window.Valtio as any;
const { Button } = orca.components;
```

### Orca Plugin API

The global `orca` object provides all plugin APIs. Key patterns:
- `orca.state.*` - Reactive application state (panels, blocks, locale)
- `orca.invokeBackend(type, ...args)` - Backend calls (get-block-tree, get-blocks, etc.)
- `orca.components.*` - UI components (Button, CompositionTextArea, Menu, etc.)
- `orca.panels.registerPanel()` - Register custom panel views
- `orca.editorSidetools.registerEditorSidetool()` - Add sidebar tools
- `orca.nav.addTo()` / `orca.nav.close()` - Panel navigation

### Context System (Current Focus)

Context types (`ContextRef`):
- `block`: Single block by ID
- `page`: Entire page by root block ID
- `tag`: All blocks with a specific tag

Context flow:
1. User selects blocks/pages via right-click menu → `ai-chat-context-menu.ts`
2. `contextStore.selected` updated → triggers reactivity
3. `context-builder.ts` builds text preview using backend APIs
4. Preview displayed in `AiChatContextPane.tsx`

## File Naming Conventions

- UI registration/coordination: `src/ui/*.ts`
- React components: `src/views/*.tsx`
- State stores: `src/store/*-store.ts`
- Business logic services: `src/services/*.ts`
- Settings schemas: `src/settings/*.ts`
- Type definitions: `src/orca.d.ts`

## Development Notes

### Styling
- Use only `--orca-color-*` CSS variables for theme compatibility
- Prefer `orca.components` over custom components
- Inline styles in `createElement` calls

### Backend API Calls
```typescript
// Get block tree (includes children structure)
const tree = await orca.invokeBackend("get-block-tree", blockId);

// Get multiple blocks by IDs
const blocks = await orca.invokeBackend("get-blocks", blockIds);

// Get blocks with specific tags
const taggedBlocks = await orca.invokeBackend("get-blocks-with-tags", [tagName]);

// Search blocks by text (returns [aliasMatches, contentMatches])
const result = await orca.invokeBackend("search-blocks-by-text", searchText);

// Advanced query with property filters (NEW in v1.1.0)
const queryResult = await orca.invokeBackend("query", {
  q: {
    kind: 100, // SELF_AND
    conditions: [
      {
        kind: 4, // QueryTag
        name: "task",
        properties: [
          { name: "priority", op: 9, v: 8 } // priority >= 8
        ]
      }
    ]
  },
  sort: [["modified", "DESC"]],
  pageSize: 50
});
```

**Important**: Backend APIs return different data formats. Always use adapter functions:
- `unwrapBlocks()` for search results (handles `[aliasMatches, contentMatches]` tuples)
- `unwrapBackendResult<T>()` for wrapped responses (handles `[status, data]` pairs)
- See `TROUBLESHOOTING.md` for common pitfalls and solutions

### Panel Tree Traversal
Use `findViewPanelById` from `src/utils/panel-tree.ts` to locate panels in the nested panel structure.

## Current Development Status

Per `progress.md`, completed steps:
1. UI Shell (EditorSidetool, panel toggle)
2. Chat Panel (mock conversation, dual-column layout)
3. Settings (OpenAI-compatible schema)
4. Context system (block/page/tag selection, preview)
5. **Query system (Phase 1)**: Advanced query with property filters ✅

### Recent Updates (v1.1.0 - 2024-12-20)

**Query Blocks Feature - Phase 1 Completed**:
- ✅ Advanced query tool `queryBlocksByTag` with property filters
- ✅ Type conversion system for query parameters
- ✅ Query builder for QueryDescription2 format
- ✅ AI tool integration (AI can automatically filter by properties)
- ✅ Support for 10+ comparison operators (>=, >, <=, <, ==, !=, is null, etc.)

See `CHANGELOG-QUERY-BLOCKS.md` for detailed changes.

**UI/UX Enhancements by Gemini**:
- ✅ Code block with copy button
- ✅ Message hover actions
- ✅ Tool call visualization cards

Remaining:
6. Query system (Phase 2-4): Complex combinations, time ranges, advanced features
7. (Optional) Session persistence (`setData/getData`)
8. Polish (keyboard shortcuts, export, prompt templates)

## AI Tools Reference

The plugin provides the following AI tools (automatically available to AI during chat):

### 1. searchBlocksByTag
Simple tag-based search.
```typescript
searchBlocksByTag(tagName: string, maxResults?: number)
```

### 2. searchBlocksByText
Full-text search across all blocks.
```typescript
searchBlocksByText(searchText: string, maxResults?: number)
```

### 3. queryBlocksByTag (NEW)
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
- Find high-priority tasks: `queryBlocksByTag("task", { properties: [{ name: "priority", op: ">=", value: 8 }] })`
- Find notes without category: `queryBlocksByTag("note", { properties: [{ name: "category", op: "is null" }] })`
- Find specific author: `queryBlocksByTag("article", { properties: [{ name: "author", op: "==", value: "张三" }] })`

