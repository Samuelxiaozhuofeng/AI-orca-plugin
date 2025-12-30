# 自定义块渲染器 (Custom Block Renderer)

本文档描述如何在 Orca 中创建自定义块渲染器，以 AI 对话块为例。

## 概述

自定义块渲染器允许插件定义新的块类型，并控制其在编辑器中的显示和行为。

## 核心文件

- `src/ui/ai-chat-renderer.ts` - 块渲染器注册
- `src/components/AiChatBlockRenderer.tsx` - 块渲染组件

## 注册块渲染器

```typescript
orca.renderers.registerBlock(
  type: string,        // 块类型标识符，如 "aichat.conversation"
  isEditable: boolean, // 是否可编辑（影响缩进、移动等操作）
  renderer: Component, // React 渲染组件
  assetFields?: string[], // 资源字段（用于导入导出）
  useChildren?: boolean   // 是否使用子块
);
```

### 参数说明

| 参数 | 类型 | 说明 |
|------|------|------|
| `type` | string | 块类型唯一标识符 |
| `isEditable` | boolean | `true` = 允许 Tab 缩进、拖拽等操作；`false` = 只读块 |
| `assetFields` | string[] | 包含资源引用的属性名数组 |
| `useChildren` | boolean | ⚠️ 无效参数 - Orca 不支持自定义块有子块 |

### 示例

```typescript
orca.renderers.registerBlock(
  "aichat.conversation",
  true,  // 可编辑，允许缩进
  AiChatBlockRenderer,
  []     // 无资源字段
  // 不需要 useChildren，自定义块不支持子块
);
```

## 块渲染组件

使用 `orca.components.BlockShell` 包装块内容：

```typescript
return createElement(BlockShell, {
  panelId,
  blockId,
  rndId,
  mirrorId,
  blockLevel,
  indentLevel,
  renderingMode,
  reprClassName: "my-block-repr",
  contentClassName: "my-block-content",
  contentAttrs: { contentEditable: false },
  contentJsx,      // 块内容 JSX
  childrenJsx,     // 子块 JSX
  droppable: true, // 允许拖拽到此块
});
```

### BlockShell 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `droppable` | boolean | 是否允许拖拽其他块到此块下 |
| `contentAttrs` | object | 内容区域的 HTML 属性 |
| `reprClassName` | string | 块表示层的 CSS 类名 |

## 注册转换器

转换器用于复制、搜索等功能：

```typescript
// 纯文本格式（用于搜索）
orca.converters.registerBlock("plain", "aichat.conversation", converter);

// HTML 格式（用于复制）
orca.converters.registerBlock("html", "aichat.conversation", converter);

// Markdown 格式
orca.converters.registerBlock("markdown", "aichat.conversation", converter);
```

## 样式注入

块渲染器需要独立管理样式，避免依赖其他组件：

```typescript
function injectBlockStyles(): void {
  const STYLE_ID = "my-block-styles";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = cssContent;
    document.head.appendChild(style);
  }
}
```

## 常见问题

### 无法 Tab 缩进

确保 `isEditable` 设置为 `true`。

### 无法将其他块缩进到自定义块下

**这是 Orca 框架的限制** - 自定义块类型不支持有子块。即使设置了 `useChildren: true`，其他块也无法通过 Tab 缩进到自定义块下。

### 样式丢失

块渲染器的样式应该在 `registerAiChatRenderer()` 中注入，而不是依赖面板组件。

## 完整示例

参考 `src/ui/ai-chat-renderer.ts` 和 `src/components/AiChatBlockRenderer.tsx`。
