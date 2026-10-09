/**
 * Conversation Branching Service
 * 
 * 对话分支功能，允许从任意消息处创建分支，探索不同的回答方向
 */

import type { Message, MessageBranch } from "./session-service";

// ───────────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────────

export interface BranchInfo {
  id: string;
  name: string;
  createdAt: number;
  messageCount: number;
  isActive: boolean;
  parentMessageId?: string;
}

// ───────────────────────────────────────────────────────────────────────────────
// Utilities
// ───────────────────────────────────────────────────────────────────────────────

/**
 * 生成唯一的分支 ID
 */
export function generateBranchId(): string {
  return `branch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 生成默认分支名称
 */
export function generateBranchName(index: number): string {
  return `分支 ${index + 1}`;
}

// ───────────────────────────────────────────────────────────────────────────────
// Branch Operations
// ───────────────────────────────────────────────────────────────────────────────

/**
 * 从指定消息处创建分支
 * @param messages 当前消息列表
 * @param messageId 分支点的消息 ID
 * @param branchName 分支名称（可选）
 * @returns 更新后的消息列表和新分支 ID
 */
export function createBranch(
  messages: Message[],
  messageId: string,
  branchName?: string
): { messages: Message[]; branchId: string } {
  const messageIndex = messages.findIndex(m => m.id === messageId);
  if (messageIndex === -1) {
    throw new Error(`Message not found: ${messageId}`);
  }

  const branchId = generateBranchId();
  const targetMessage = messages[messageIndex];

  // 获取分支点之后的消息（这些将成为当前分支的内容）
  const messagesAfter = messages.slice(messageIndex + 1);

  // 如果目标消息还没有分支，创建第一个分支保存当前内容
  const existingBranches = targetMessage.branches || [];
  
  // 如果还没有分支，先把当前后续消息保存为"主分支"
  let newBranches: MessageBranch[] = [...existingBranches];
  if (existingBranches.length === 0 && messagesAfter.length > 0) {
    newBranches.push({
      id: "main",
      name: "主分支",
      createdAt: targetMessage.createdAt,
      messages: messagesAfter.map(m => ({ ...m, branchId: "main", parentMessageId: messageId })),
    });
  }

  // 创建新的空分支
  newBranches.push({
    id: branchId,
    name: branchName || generateBranchName(newBranches.length),
    createdAt: Date.now(),
    messages: [],
  });

  // 更新目标消息的分支信息
  const updatedMessages = messages.slice(0, messageIndex + 1).map((m, i) => {
    if (i === messageIndex) {
      return {
        ...m,
        branches: newBranches,
        activeBranchId: branchId,
      };
    }
    return m;
  });

  return { messages: updatedMessages, branchId };
}

/**
 * 切换到指定分支
 * @param messages 当前消息列表（只包含到分支点的消息）
 * @param messageId 分支点的消息 ID
 * @param branchId 目标分支 ID
 * @returns 切换后的完整消息列表
 */
export function switchBranch(
  messages: Message[],
  messageId: string,
  branchId: string
): Message[] {
  const messageIndex = messages.findIndex(m => m.id === messageId);
  if (messageIndex === -1) {
    throw new Error(`Message not found: ${messageId}`);
  }

  const targetMessage = messages[messageIndex];
  const branches = targetMessage.branches;

  if (!branches || branches.length === 0) {
    return messages;
  }

  const targetBranch = branches.find(b => b.id === branchId);
  if (!targetBranch) {
    throw new Error(`Branch not found: ${branchId}`);
  }

  // 获取分支点之前的消息（包括分支点），记下分支点现在显示的是目标分支
  const messagesBefore = messages
    .slice(0, messageIndex + 1)
    .map((m, i) => (i === messageIndex ? { ...m, activeBranchId: branchId } : m));

  // 将分支消息追加到后面
  const branchMessages = targetBranch.messages.map(m => ({
    ...m,
    branchId,
    parentMessageId: messageId,
  }));

  return [...messagesBefore, ...branchMessages];
}

/**
 * 保存当前分支的消息到分支数据中
 * @param messages 当前消息列表
 * @param branchPointId 分支点消息 ID
 * @param currentBranchId 当前分支 ID
 * @returns 更新后的消息列表
 */
export function saveBranchMessages(
  messages: Message[],
  branchPointId: string,
  currentBranchId: string
): Message[] {
  const branchPointIndex = messages.findIndex(m => m.id === branchPointId);
  if (branchPointIndex === -1) {
    return messages;
  }

  const branchPoint = messages[branchPointIndex];
  const branches = branchPoint.branches;

  if (!branches) {
    return messages;
  }

  // 获取分支点之后的消息
  const messagesAfterBranchPoint = messages.slice(branchPointIndex + 1);

  // 更新对应分支的消息
  const updatedBranches = branches.map(branch => {
    if (branch.id === currentBranchId) {
      return {
        ...branch,
        messages: messagesAfterBranchPoint.map(m => ({
          ...m,
          branchId: currentBranchId,
          parentMessageId: branchPointId,
        })),
      };
    }
    return branch;
  });

  // 返回更新后的消息列表
  return messages.slice(0, branchPointIndex + 1).map((m, i) => {
    if (i === branchPointIndex) {
      return {
        ...m,
        branches: updatedBranches,
      };
    }
    return m;
  });
}

/**
 * 离开分支点前，把当前所在分支的内容存回它的分支数据（切换 / 新建分支都会把分支点之后的消息换掉）。
 * 当前分支按分支点记的 activeBranchId；旧数据没记的，按分支点后第一条消息出自哪个分支认。
 * 都认不出（旧版本在新分支里聊的内容）就另存成一个「找回的消息」分支，不丢也不卡住。
 */
export function stashCurrentBranch(messages: Message[], branchPointId: string): Message[] {
  const index = messages.findIndex(m => m.id === branchPointId);
  const point = messages[index];
  const branches = point?.branches;
  if (!branches || branches.length === 0) return messages;

  const after = messages[index + 1];
  const leaving =
    branches.find(b => b.id === point.activeBranchId) ??
    (after && branches.find(b => b.messages.some(m => m.id === after.id)));
  if (leaving) return saveBranchMessages(messages, branchPointId, leaving.id);
  if (!after) return messages;

  const recovered: MessageBranch = { id: generateBranchId(), name: "找回的消息", createdAt: Date.now(), messages: [] };
  const withRecovered = messages.map((m, i) => (i === index ? { ...m, branches: [...branches, recovered] } : m));
  return saveBranchMessages(withRecovered, branchPointId, recovered.id);
}

/**
 * 删除分支
 * @param messages 消息列表
 * @param branchPointId 分支点消息 ID
 * @param branchId 要删除的分支 ID
 * @returns 更新后的消息列表
 */
export function deleteBranch(
  messages: Message[],
  branchPointId: string,
  branchId: string
): Message[] {
  const branchPointIndex = messages.findIndex(m => m.id === branchPointId);
  if (branchPointIndex === -1) {
    return messages;
  }

  const branchPoint = messages[branchPointIndex];
  const branches = branchPoint.branches;

  if (!branches || branches.length <= 1) {
    // 不能删除最后一个分支
    return messages;
  }

  const updatedBranches = branches.filter(b => b.id !== branchId);

  return messages.map((m, i) => {
    if (i === branchPointIndex) {
      return {
        ...m,
        branches: updatedBranches,
      };
    }
    return m;
  });
}

/**
 * 重命名分支
 */
export function renameBranch(
  messages: Message[],
  branchPointId: string,
  branchId: string,
  newName: string
): Message[] {
  const branchPointIndex = messages.findIndex(m => m.id === branchPointId);
  if (branchPointIndex === -1) {
    return messages;
  }

  const branchPoint = messages[branchPointIndex];
  const branches = branchPoint.branches;

  if (!branches) {
    return messages;
  }

  const updatedBranches = branches.map(branch => {
    if (branch.id === branchId) {
      return { ...branch, name: newName };
    }
    return branch;
  });

  return messages.map((m, i) => {
    if (i === branchPointIndex) {
      return {
        ...m,
        branches: updatedBranches,
      };
    }
    return m;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Query Functions
// ─────────────────────────────────────────────────────────────────────────────

