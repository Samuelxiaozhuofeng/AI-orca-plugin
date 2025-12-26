# Requirements Document

## Introduction

本功能为 AI Chat 插件添加对话模式系统，支持三种核心模式：
- **Agent 模式**: AI 自主执行工具调用，无需确认
- **Supervised 模式**: AI 可以调用工具，但每次需要用户确认
- **Ask 模式**: AI 仅回答问题，不执行任何操作

## Glossary

- **Chat Mode（对话模式）**: 定义 AI 在对话中的行为方式
- **Agent Mode（Agent 模式）**: AI 自动执行工具调用，无需用户确认
- **Supervised Mode（Supervised 模式）**: AI 可以调用工具，但需要用户逐一确认
- **Ask Mode（Ask 模式）**: AI 仅回答问题、不调用任何工具
- **Tool Call（工具调用）**: AI 调用系统提供的功能（如搜索笔记、创建块等）
- **Pending Tool Call（待确认工具调用）**: 在 Supervised 模式下，等待用户确认的工具调用

## Requirements

### Requirement 1: 三种对话模式

**User Story:** As a user, I want to choose between Agent, Supervised, and Ask modes, so that I can control AI's autonomy level.

#### Acceptance Criteria

1. WHEN the user opens the chat panel THEN the system SHALL display the current chat mode indicator in the input area
2. WHEN the user clicks the mode selector THEN the system SHALL show a dropdown menu with three mode options: Agent, Supervised, Ask
3. WHEN the user selects a different mode THEN the system SHALL immediately switch to the selected mode and update the UI indicator
4. WHEN in Agent mode THEN the system SHALL execute tool calls automatically without user confirmation
5. WHEN in Supervised mode THEN the system SHALL pause before each tool call and require user confirmation
6. WHEN in Ask mode THEN the system SHALL not send tool definitions to AI and respond with text only

### Requirement 2: Agent 模式行为

**User Story:** As a user, I want Agent mode to execute operations automatically, so that I can work efficiently without interruptions.

#### Acceptance Criteria

1. WHEN in Agent mode and AI requests a tool call THEN the system SHALL execute the tool immediately
2. WHEN in Agent mode THEN the system SHALL display tool execution results inline in the chat
3. WHEN in Agent mode and a tool call fails THEN the system SHALL display the error and allow AI to continue

### Requirement 3: Supervised 模式行为

**User Story:** As a user, I want Supervised mode to ask for my approval before executing operations, so that I maintain control over what AI does.

#### Acceptance Criteria

1. WHEN in Supervised mode and AI requests a tool call THEN the system SHALL pause and display a confirmation UI
2. WHEN displaying the confirmation UI THEN the system SHALL show the tool name and key parameters
3. WHEN the user approves a pending tool call THEN the system SHALL execute the tool and continue
4. WHEN the user rejects a pending tool call THEN the system SHALL skip the tool and inform AI of the rejection
5. WHEN multiple tool calls are pending THEN the system SHALL allow batch approve or reject actions

### Requirement 4: Ask 模式行为

**User Story:** As a user, I want Ask mode to provide answers without executing any operations, so that I can safely get information.

#### Acceptance Criteria

1. WHEN in Ask mode THEN the system SHALL not include tool definitions in the API request
2. WHEN in Ask mode THEN the system SHALL modify the system prompt to instruct AI to only answer questions
3. WHEN in Ask mode THEN the system SHALL still allow user to provide context via @ mentions

### Requirement 5: 模式状态持久化

**User Story:** As a user, I want my mode preference to be remembered, so that I don't have to reconfigure it every time.

#### Acceptance Criteria

1. WHEN the user changes the chat mode THEN the system SHALL persist the setting to storage
2. WHEN the chat panel loads THEN the system SHALL restore the previously saved mode setting
3. WHEN no saved setting exists THEN the system SHALL default to Agent mode

### Requirement 6: 模式视觉指示

**User Story:** As a user, I want clear visual feedback about the current mode, so that I always know how AI will behave.

#### Acceptance Criteria

1. WHEN in Agent mode THEN the system SHALL display a robot icon with a lightning indicator
2. WHEN in Supervised mode THEN the system SHALL display a robot icon with a shield indicator
3. WHEN in Ask mode THEN the system SHALL display a chat bubble icon
4. WHEN hovering over the mode indicator THEN the system SHALL show a tooltip explaining the current mode

### Requirement 7: 工具调用确认 UI

**User Story:** As a user, I want a clear confirmation UI for tool calls in Supervised mode, so that I can quickly approve or reject operations.

#### Acceptance Criteria

1. WHEN a tool call requires confirmation THEN the system SHALL display an inline confirmation card in the chat
2. WHEN displaying the confirmation card THEN the system SHALL show the tool name in human-readable format
3. WHEN displaying the confirmation card THEN the system SHALL show key parameters in readable format
4. WHEN the user clicks approve THEN the system SHALL execute the tool and show the result
5. WHEN the user clicks reject THEN the system SHALL display a skipped indicator and continue
