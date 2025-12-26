# AI 对话全局自定义记忆与多用户管理功能方案

## 1. 背景与目标

为了提升 AI 助手的个性化体验，用户需要能够让 AI “记住”一些全局性的信息（如用户偏好、职业背景、特定指令等）。同时，为了支持不同场景或不同使用者的需求，系统需要支持“多用户/多角色”管理，每个角色拥有独立的记忆库。

本方案旨在实现一个集成的、可视化的记忆管理系统，直接嵌入在聊天面板中，提供便捷的用户切换和精细化的记忆管理功能。

## 2. 核心功能

1.  **多用户/角色管理**
    *   创建、编辑、删除用户（角色）。
    *   快速切换当前活跃用户。
    *   每个用户拥有独立的记忆数据。

2.  **全局记忆管理**
    *   **列表展示**：清晰展示当前用户的记忆条目。
    *   **增删改查**：支持添加、编辑、删除记忆。
    *   **启用/禁用**：每条记忆可单独控制开关，灵活调整生效内容。
    *   **搜索过滤**：支持关键词搜索，快速定位记忆。

3.  **智能注入**
    *   在与 AI 对话时，系统自动读取当前活跃用户下所有**已启用**的记忆。
    *   将记忆内容动态注入到 System Prompt 中，确保 AI 在对话中遵循这些设定。

## 3. 数据结构设计

我们将使用一个新的 Store (`memory-store`) 来管理相关数据。

### 3.1 类型定义

```typescript
// 用户/角色定义
export interface UserProfile {
  id: string;          // 唯一标识
  name: string;        // 显示名称 (如 "默认用户", "Python专家")
  avatar?: string;     // (可选) 头像图标或颜色
  isDefault?: boolean; // 是否为系统默认用户 (不可删除)
  createdAt: number;
}

// 记忆条目定义
export interface MemoryItem {
  id: string;          // 唯一标识
  userId: string;      // 所属用户 ID
  content: string;     // 记忆内容
  isEnabled: boolean;  // 开关状态
  createdAt: number;
  updatedAt: number;
}

// 存储结构
export interface MemoryStoreData {
  version: number;
  users: UserProfile[];
  memories: MemoryItem[];
  activeUserId: string; // 当前选中的用户 ID
}
```

### 3.2 默认数据

系统初始化时，将自动创建一个默认用户：
*   Name: "默认用户"
*   ID: "default-user"

## 4. UI/UX 设计

### 4.1 入口
在 `AiChatPanel` 的顶部菜单（HeaderMenu）中添加 **"记忆管理 (Memory Manager)"** 选项。

### 4.2 管理界面 (MemoryManager)
该界面将覆盖当前的聊天列表区域（或作为模态层），布局参考如下：

*   **顶部：用户控制区**
    *   **用户选择器**：下拉菜单显示所有用户，支持点击切换。
    *   **用户操作**：
        *   [+] 按钮：新建用户。
        *   [Edit] 图标：重命名当前用户。
        *   [Delete] 图标：删除当前用户（需二次确认，默认用户不可删）。
    *   **统计**：显示当前用户的记忆条数。

*   **中部：工具栏**
    *   **搜索框**：输入关键词过滤下方的记忆列表。
    *   **添加按钮**：绿色醒目按钮 "+ 添加记忆"。

*   **下部：记忆列表区**
    *   **空状态**：当无数据时，显示图标和“暂无记忆，开始添加您的第一条记忆吧”提示。
    *   **列表项**：
        *   左侧：记忆内容摘要（支持多行显示）。
        *   右侧：
            *   [Switch]：启用/禁用开关。
            *   [Edit]：编辑内容。
            *   [Delete]：删除条目。

### 4.3 交互流程
1.  用户点击菜单 -> 进入记忆管理界面。
2.  用户选择/创建角色（如“代码助手”）。
3.  用户添加记忆（如“偏好使用 TypeScript”、“回答要简洁”）。
4.  用户点击“返回”或关闭 -> 回到聊天界面。
5.  发送消息时，AI 自动应用“代码助手”的记忆设定。

## 5. 技术实施方案

### 5.1 文件清单

1.  `src/store/memory-store.ts`: 核心数据逻辑，负责持久化和状态管理。
2.  `src/views/MemoryManager.tsx`: 新增的 React 组件，实现管理界面。
3.  `src/views/AiChatPanel.tsx`: 集成 MemoryManager，处理视图切换和消息注入逻辑。
4.  `src/views/HeaderMenu.tsx`: 添加菜单入口。
5.  `src/services/message-builder.ts`: 更新消息构建逻辑，支持注入自定义记忆字符串。

### 5.2 关键逻辑：消息注入

在 `AiChatPanel.tsx` 的 `handleSend` 方法中：

```typescript
// 1. 获取 MemoryStore
const memoryState = memoryStore.getState();
const activeUser = memoryState.users.find(u => u.id === memoryState.activeUserId);

// 2. 筛选有效记忆
const activeMemories = memoryState.memories.filter(
  m => m.userId === activeUser.id && m.isEnabled
);

// 3. 拼接文本
const customMemoryText = activeMemories
  .map(m => `- ${m.content}`)
  .join("\n");

// 4. 传递给 MessageBuilder
const messages = buildConversationMessages({
  // ...
  customMemory: customMemoryText
});
```

## 6. 后续扩展计划 (Future)

*   **记忆导入/导出**：支持 JSON 格式导入导出记忆库。
*   **自动记忆**：允许 AI 在对话中自动提炼关键信息并请求保存为记忆。
*   **预设模板**：提供常用的角色模板（如“翻译官”、“润色专家”）供一键添加。
