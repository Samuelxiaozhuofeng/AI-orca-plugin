# Requirements Document

## Introduction

本功能为 AI 聊天插件提供**全局记忆**管理能力，支持多用户切换。全局记忆用于存储用户的个人信息和偏好（如"我叫张三"、"我是素食主义者，不要推荐含肉的食谱"、"我偏好使用 TypeScript"），这些信息会在每次对话时自动注入，让 AI 能够记住用户的个性化设定。

系统支持**多用户管理**，允许不同的人（如张三、李四）各自维护独立的记忆库。切换用户后，AI 将使用对应用户的记忆进行对话。

**注意**：全局记忆与"角色模板/自定义系统提示词"是不同的概念。角色模板定义 AI 的行为方式（如"翻译官"、"润色专家"），而全局记忆存储的是关于用户本身的信息。

## Glossary

- **Memory Store**: 负责持久化存储用户和记忆数据的状态管理模块
- **User Profile (Persona)**: 用户配置/人设，代表一个真实用户（如张三、李四），每个用户拥有独立的记忆库。注意：这里的"用户"指的是记忆的归属者，而非系统登录用户
- **Memory Item**: 单条记忆条目，包含用户信息/偏好内容、启用状态等属性，归属于特定用户
- **Active User**: 当前选中的用户，用于管理界面中显示和编辑的目标用户
- **Injection Mode**: 记忆注入模式，决定 AI 对话时读取哪些用户的记忆
  - **ALL**: 读取所有用户的启用记忆，格式为 `- [用户名]: 内容`
  - **CURRENT**: 仅读取当前用户的启用记忆，格式为 `- 内容`
- **Memory Injection**: 将启用的记忆内容动态拼接到 System Prompt 的过程

## Requirements

### Requirement 1

**User Story:** As a user, I want to create and manage multiple user profiles, so that different people (e.g., me and my family members) can each have their own memory collections.

#### Acceptance Criteria

1. WHEN the system initializes for the first time THEN the Memory Store SHALL create a default user profile with id "default-user" and name "默认用户"
2. WHEN a user creates a new profile with a name THEN the Memory Store SHALL generate a unique id and persist the profile
3. WHEN a user edits a profile name THEN the Memory Store SHALL update the profile name and persist the change
4. WHEN a user attempts to delete the default profile THEN the Memory Store SHALL reject the deletion and maintain the profile
5. WHEN a user deletes a non-default profile THEN the Memory Store SHALL remove the profile and all associated memories
6. WHEN a user switches to a different profile THEN the Memory Store SHALL update the activeUserId and persist the selection

### Requirement 2

**User Story:** As a user, I want to add personal information and preferences as memory items for my profile, so that the AI can remember things about me across conversations.

#### Acceptance Criteria

1. WHEN a user adds a memory item with content THEN the Memory Store SHALL create a new MemoryItem with unique id, associate it with the active user, set isEnabled to true, record timestamps, and persist it
2. WHEN a user adds a memory item with empty or whitespace-only content THEN the Memory Store SHALL reject the addition and maintain the current state
3. WHEN a memory item is successfully added THEN the Memory Store SHALL assign a unique identifier that does not conflict with existing items

### Requirement 3

**User Story:** As a user, I want to edit and delete my memory items, so that I can keep my personal information up to date.

#### Acceptance Criteria

1. WHEN a user edits a memory item content THEN the Memory Store SHALL update the content and updatedAt timestamp
2. WHEN a user edits a memory item with empty or whitespace-only content THEN the Memory Store SHALL reject the edit and maintain the original content
3. WHEN a user deletes a memory item THEN the Memory Store SHALL remove the item from storage permanently

### Requirement 4

**User Story:** As a user, I want to enable or disable individual memory items, so that I can control which information the AI uses without deleting it.

#### Acceptance Criteria

1. WHEN a user toggles a memory item's enabled state THEN the Memory Store SHALL update the isEnabled field and persist the change
2. WHEN a memory item is disabled THEN the Memory Injection process SHALL exclude it from the system prompt
3. WHEN a memory item is re-enabled THEN the Memory Injection process SHALL include it in the system prompt

### Requirement 5

**User Story:** As a user, I want to search my memory items by keyword, so that I can quickly find specific memories in a large collection.

#### Acceptance Criteria

1. WHEN a user enters a search keyword THEN the Memory Manager UI SHALL display only memory items whose content contains the keyword (case-insensitive matching)
2. WHEN the search keyword is empty THEN the Memory Manager UI SHALL display all memory items for the active user

### Requirement 6

**User Story:** As a user, I want my enabled memories to be automatically included in AI conversations, so that the AI responds according to my preferences and knows about me.

#### Acceptance Criteria

1. WHEN a user sends a message THEN the Message Builder SHALL retrieve enabled memory items based on the current injection mode setting
2. WHEN injection mode is set to "ALL" THEN the Message Builder SHALL retrieve enabled memories from all user profiles
3. WHEN injection mode is set to "CURRENT" THEN the Message Builder SHALL retrieve enabled memories only from the active user profile
4. WHEN building the system prompt in ALL mode THEN the Message Builder SHALL format each memory as `- [用户名称]: 记忆内容` (e.g., `- [张三]: 我对花生过敏`)
5. WHEN building the system prompt in CURRENT mode THEN the Message Builder SHALL format each memory as `- 记忆内容` (without user name prefix)
6. WHEN no memories are enabled (in the applicable scope) THEN the Message Builder SHALL build the system prompt without memory content

### Requirement 7

**User Story:** As a user, I want to choose whether the AI uses memories from all profiles or just the current profile, so that I can control the scope of information the AI has access to.

#### Acceptance Criteria

1. WHEN the Memory Manager view is displayed THEN the UI SHALL show a toggle or selector for injection mode (ALL vs CURRENT)
2. WHEN the system initializes THEN the Memory Store SHALL default the injection mode to "ALL"
3. WHEN a user changes the injection mode THEN the Memory Store SHALL persist the setting

### Requirement 8

**User Story:** As a user, I want to access the memory management interface from the chat panel, so that I can easily manage my memories without leaving the chat context.

#### Acceptance Criteria

1. WHEN a user clicks the header menu THEN the Header Menu SHALL display a "记忆管理" (Memory Manager) option
2. WHEN a user selects "记忆管理" THEN the AI Chat Panel SHALL display the Memory Manager view in place of the chat messages
3. WHEN a user clicks the back button in the Memory Manager THEN the AI Chat Panel SHALL return to the chat messages view

### Requirement 9

**User Story:** As a user, I want to see the status of my memories and current profile in the management interface, so that I know which profile is active and how many memories are enabled.

#### Acceptance Criteria

1. WHEN the Memory Manager view is displayed THEN the UI SHALL show the active user name, total memory count, and enabled memory count
2. WHEN no memories exist for the active user THEN the Memory Manager SHALL display an empty state with guidance text encouraging the user to add their first memory

### Requirement 10

**User Story:** As a user, I want my memory data to persist across sessions, so that I don't lose my personal information when I close the application.

#### Acceptance Criteria

1. WHEN memory data changes (add, edit, delete, toggle, user switch, mode change) THEN the Memory Store SHALL persist the updated data to Orca's storage system
2. WHEN the plugin initializes THEN the Memory Store SHALL load previously saved data from storage
3. WHEN loading data fails or no data exists THEN the Memory Store SHALL initialize with default state (default user profile, empty memories, injection mode "ALL")

### Requirement 11

**User Story:** As a user, I want the memory data to be serialized and deserialized correctly, so that my data integrity is maintained across sessions.

#### Acceptance Criteria

1. WHEN serializing memory data THEN the Memory Store SHALL convert the complete state (users, memories, activeUserId, injectionMode) to JSON format
2. WHEN deserializing memory data THEN the Memory Store SHALL parse JSON and restore the complete state with all properties
3. WHEN serializing then deserializing memory data THEN the Memory Store SHALL produce an equivalent state object (round-trip consistency)
