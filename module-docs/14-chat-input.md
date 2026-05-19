# ChatInput 组件模块

## 模块概述

`ChatInput` 是 AI 聊天面板的核心输入组件，提供消息输入、上下文选择和模型切换功能。

## 文件结构

```
src/views/
├── ChatInput.tsx              # 主组件 (~175行)
└── chat-input/
    ├── index.ts               # 模块导出
    ├── chat-input-styles.ts   # 共享样式常量
    ├── ModelSelectorButton.tsx # 模型选择触发按钮
    └── ModelSelectorMenu.tsx   # 模型选择菜单
```

## 组件职责

### ChatInput (主组件)

- 整合输入区域的所有子组件
- 管理文本输入状态
- 处理发送逻辑和快捷键
- 触发 Context Picker

### ModelSelectorButton

- 显示当前选中的模型名称
- 点击打开模型选择菜单
- 使用 ContextMenu 包装

### ModelSelectorMenu

- 模型列表过滤搜索
- 按分组显示模型 (Built-in, Custom, Other)
- 添加自定义模型功能
- 支持从 API 获取模型并自动合并到列表

### chat-input-styles

- 所有组件的样式常量
- 支持动态样式函数 (如 `inputWrapperStyle(isFocused)`)

## Props 接口

```typescript
type ChatInputProps = {
  onSend: (message: string) => void;
  disabled?: boolean;
  currentPageId: DbId | null;
  currentPageTitle: string;
  modelOptions: AiModelOption[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  onAddModel?: (model: string) => void | Promise<void>;
};
```

## 使用示例

```typescript
import ChatInput from "./views/ChatInput";

createElement(ChatInput, {
  onSend: handleSendMessage,
  disabled: isLoading,
  currentPageId: pageId,
  currentPageTitle: pageTitle,
  modelOptions: availableModels,
  selectedModel: currentModel,
  onModelChange: setCurrentModel,
  onAddModel: handleAddCustomModel,
});
```

## 重构历史

- **2024-12**: 从 491 行单文件拆分为模块化结构
  - 抽取 ModelSelectorMenu (~220 行) 为独立组件
  - 抽取 ModelSelectorButton (~70 行) 为独立组件
  - 抽取共享样式为 chat-input-styles.ts
  - 主组件简化至 ~175 行
