# Implementation Plan

- [x] 1. Create Memory Store core module





  - [x] 1.1 Create `src/store/memory-store.ts` with type definitions


    - Define InjectionMode, UserProfile, MemoryItem, MemoryStoreData types
    - Define MemoryStoreActions interface
    - Create DEFAULT_STATE constant with default user
    - Implement generateId() utility function
    - _Requirements: 1.1, 7.2, 10.3_

  - [ ] 1.2 Implement user management functions
    - Implement createUser() with name validation and unique ID generation
    - Implement updateUser() with name validation
    - Implement deleteUser() with default user protection and cascade deletion
    - Implement setActiveUser()
    - Implement getActiveUser()
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6_
  - [ ]* 1.3 Write property test for user ID uniqueness
    - **Property 1: User ID Uniqueness**
    - **Validates: Requirements 1.2**
  - [ ]* 1.4 Write property test for user deletion cascade
    - **Property 3: User Deletion Cascade**

    - **Validates: Requirements 1.5**
  - [ ] 1.5 Implement memory management functions
    - Implement addMemory() with content validation
    - Implement updateMemory() with content validation
    - Implement deleteMemory()
    - Implement toggleMemory()
    - Implement getMemoriesForUser()
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1_
  - [ ]* 1.6 Write property test for memory creation integrity
    - **Property 5: Memory Creation Integrity**
    - **Validates: Requirements 2.1, 2.3**
  - [ ]* 1.7 Write property test for whitespace content rejection
    - **Property 6: Whitespace Content Rejection**
    - **Validates: Requirements 2.2, 3.2**
  - [ ]* 1.8 Write property test for memory toggle inversion
    - **Property 9: Memory Toggle Inversion**
    - **Validates: Requirements 4.1**

- [-] 2. Implement injection mode and memory text generation




  - [x] 2.1 Implement injection mode functions


    - Implement setInjectionMode()
    - Implement getEnabledMemories() based on injection mode
    - Implement getMemoryText() with ALL/CURRENT formatting
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.3_
  - [ ]* 2.2 Write property test for enabled memory filtering
    - **Property 10: Enabled Memory Filtering**
    - **Validates: Requirements 4.2, 4.3**
  - [ ]* 2.3 Write property test for injection mode ALL behavior
    - **Property 12: Injection Mode ALL Behavior**
    - **Validates: Requirements 6.2, 6.4**
  - [ ]* 2.4 Write property test for injection mode CURRENT behavior
    - **Property 13: Injection Mode CURRENT Behavior**
    - **Validates: Requirements 6.3, 6.5**

- [x] 3. Implement persistence layer






  - [x] 3.1 Implement save and load functions

    - Implement save() using orca.state.set()
    - Implement load() with error handling and default state fallback
    - Add auto-save on state changes
    - _Requirements: 10.1, 10.2, 10.3, 11.1, 11.2_
  - [ ]* 3.2 Write property test for data round-trip consistency
    - **Property 15: Data Round-Trip Consistency**
    - **Validates: Requirements 11.1, 11.2, 11.3**


- [x] 4. Checkpoint - Ensure all store tests pass




  - Ensure all tests pass, ask the user if questions arise.


- [x] 5. Create Memory Manager UI component




  - [x] 5.1 Create `src/views/MemoryManager.tsx` base structure


    - Create component with onBack prop
    - Implement header with back button and title
    - Set up internal state (searchKeyword, editingMemoryId, etc.)
    - _Requirements: 8.1, 8.3_
  - [x] 5.2 Implement user control section

    - Create UserSelector dropdown component
    - Create user action buttons (add, edit, delete)
    - Implement delete confirmation dialog
    - Display memory statistics
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 9.1_
  - [x] 5.3 Implement injection mode selector

    - Create ALL/CURRENT toggle or dropdown
    - Connect to memoryStore.setInjectionMode()
    - _Requirements: 7.1, 7.3_
  - [x] 5.4 Implement toolbar with search and add button

    - Create search input with real-time filtering
    - Create "添加记忆" button
    - _Requirements: 5.1, 5.2_
  - [ ]* 5.5 Write property test for search filter correctness
    - **Property 11: Search Filter Correctness**
    - **Validates: Requirements 5.1**
  - [x] 5.6 Implement memory list with CRUD operations

    - Create MemoryItem component with toggle, edit, delete actions
    - Implement inline editing mode
    - Implement empty state display
    - _Requirements: 2.1, 3.1, 3.3, 4.1, 9.2_

- [x] 6. Integrate Memory Manager into chat panel





  - [x] 6.1 Update HeaderMenu to add memory manager entry


    - Add onOpenMemoryManager prop
    - Add "记忆管理" menu item with icon
    - _Requirements: 8.1_
  - [x] 6.2 Update AiChatPanel for view switching


    - Add viewMode state ('chat' | 'memory-manager')
    - Implement handleOpenMemoryManager and handleCloseMemoryManager
    - Conditionally render MemoryManager or chat view
    - _Requirements: 8.2, 8.3_

- [x] 7. Integrate memory injection into message building





  - [x] 7.1 Update MessageBuilder to support custom memory


    - Add customMemory parameter to ConversationBuildParams
    - Update buildSystemContent() to include memory text
    - _Requirements: 6.1_
  - [x] 7.2 Update AiChatPanel handleSend to inject memories


    - Call memoryStore.getMemoryText() before sending
    - Pass memory text to buildConversationMessages()
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_


- [x] 8. Final Checkpoint - Ensure all tests pass




  - Ensure all tests pass, ask the user if questions arise.
