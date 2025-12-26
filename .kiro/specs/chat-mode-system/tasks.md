# Implementation Plan

- [x] 1. Create ChatModeStore





  - [x] 1.1 Create chat-mode-store.ts with state and actions


    - Define ChatMode type and PendingToolCall interface
    - Implement setMode, addPendingToolCall, removePendingToolCall actions
    - Implement approve/reject actions for single and batch operations
    - _Requirements: 1.3, 1.4, 1.5, 3.3, 3.4, 3.5_
  - [ ]* 1.2 Write property test for mode selection
    - **Property 1: Mode selection updates store**
    - **Validates: Requirements 1.3**
  - [x] 1.3 Implement storage persistence

    - Add loadFromStorage and saveToStorage methods
    - Use localStorage with key 'ai-chat-mode'
    - Default to 'agent' mode when no saved setting
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ]* 1.4 Write property test for persistence round-trip
    - **Property 9: Mode persistence**
    - **Property 10: Mode restoration**
    - **Validates: Requirements 5.1, 5.2**


- [x] 2. Create ModeSelectorButton component




  - [x] 2.1 Create ModeSelectorButton.tsx in chat-input folder


    - Display current mode icon (⚡ Agent, 🛡️ Supervised, 💬 Ask)
    - Show mode name and chevron indicator
    - Use ContextMenu for dropdown
    - _Requirements: 1.1, 1.2, 6.1, 6.2, 6.3_

  - [x] 2.2 Implement mode selection menu

    - Three options with icons and descriptions
    - Highlight current selection
    - Call store.setMode on selection
    - _Requirements: 1.2, 1.3_
  - [x] 2.3 Add tooltip for mode indicator


    - Show mode description on hover
    - _Requirements: 6.4_


- [x] 3. Integrate ModeSelectorButton into ChatInput




  - [x] 3.1 Import and add ModeSelectorButton to ChatInput toolbar


    - Place next to InjectionModeSelector
    - _Requirements: 1.1_
  - [x] 3.2 Initialize store on component mount

    - Call loadFromStorage when chat panel opens
    - _Requirements: 5.2_


- [x] 4. Checkpoint - Ensure all tests pass




  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Modify message-builder for Ask mode






  - [x] 5.1 Update buildMessages to check chat mode

    - When mode is 'ask', exclude tools from API request
    - When mode is 'ask', append instruction to system prompt
    - _Requirements: 1.6, 4.1, 4.2_
  - [ ]* 5.2 Write property test for Ask mode API request
    - **Property 4: Ask mode excludes tools**
    - **Property 5: Ask mode prompt modification**
    - **Validates: Requirements 1.6, 4.1, 4.2**

- [x] 6. Modify chat-stream-handler for mode-based tool handling






  - [x] 6.1 Update tool call handling logic

    - Agent mode: execute immediately (current behavior)
    - Supervised mode: add to pendingToolCalls, pause execution
    - Ask mode: should not receive tool calls (handled by message-builder)
    - _Requirements: 1.4, 1.5, 2.1, 3.1_
  - [ ]* 6.2 Write property test for tool call routing
    - **Property 2: Agent mode auto-execution**
    - **Property 3: Supervised mode queues for confirmation**
    - **Validates: Requirements 1.4, 1.5, 2.1, 3.1**


- [x] 7. Create ToolConfirmationCard component





  - [x] 7.1 Create ToolConfirmationCard.tsx

    - Display tool name in human-readable format
    - Display key parameters in readable format
    - Approve and Reject buttons
    - _Requirements: 7.1, 7.2, 7.3_
  - [ ]* 7.2 Write property test for tool name formatting
    - **Property 11: Tool name formatting**
    - **Validates: Requirements 7.2**

  - [x] 7.3 Implement approve/reject handlers

    - Call store.approveToolCall or store.rejectToolCall
    - Update UI to show result or skipped status
    - _Requirements: 7.4, 7.5_
  - [ ]* 7.4 Write property test for approval/rejection
    - **Property 6: Approval triggers execution**
    - **Property 7: Rejection skips tool**
    - **Validates: Requirements 3.3, 3.4, 7.4, 7.5**

- [x] 8. Integrate ToolConfirmationCard into MessageItem





  - [x] 8.1 Render ToolConfirmationCard for pending tool calls


    - Check if message has pending tool calls in Supervised mode
    - Render confirmation cards inline
    - _Requirements: 7.1_

  - [x] 8.2 Add batch approve/reject UI

    - When multiple tool calls pending, show batch action buttons
    - _Requirements: 3.5_
  - [ ]* 8.3 Write property test for batch operations
    - **Property 8: Batch operations consistency**
    - **Validates: Requirements 3.5**

- [x] 9. Handle mode switch edge cases

  - [x] 9.1 Handle pending calls when switching modes

    - Switch to Agent: auto-approve all pending
    - Switch to Ask: auto-reject all pending
    - _Requirements: 1.3_


- [x] 10. Final Checkpoint - Ensure all tests pass




  - Ensure all tests pass, ask the user if questions arise.
