# Codex 任务：createBlock 智能导航优化

## 背景
当前 `createBlock` 工具每次创建块前都会跳转到目标块的页面，导致在同页面创建多个块时面板反复跳转，破坏用户工作上下文。

## 任务目标
优化 `createBlock` 的导航逻辑：
- **如果已在目标页面**：不导航，直接创建块
- **如果不在目标页面**：使用 `replace` 在当前面板替换视图（而非创建新面板）

---

## 实施步骤

### 第 1 步：添加辅助函数

在 `src/services/ai-tools.ts` 文件中，在 `executeTool` 函数之前（约 360 行附近）添加以下函数：

```typescript
/**
 * 获取块的根页面 ID（向上追溯到 parent === null 的块）
 * @param blockId - 要查询的块 ID
 * @returns 根块 ID，如果查找失败返回 undefined
 */
async function getRootBlockId(blockId: number): Promise<number | undefined> {
  try {
    let currentBlock = orca.state.blocks[blockId];

    // 如果 state 中没有，从后端获取
    if (!currentBlock) {
      currentBlock = await orca.invokeBackend("get-block", blockId);
      if (!currentBlock) return undefined;
    }

    // 向上追溯到根块
    while (currentBlock.parent !== null) {
      const parentId = currentBlock.parent;
      let parentBlock = orca.state.blocks[parentId];

      if (!parentBlock) {
        parentBlock = await orca.invokeBackend("get-block", parentId);
        if (!parentBlock) break; // 无法继续追溯
      }

      currentBlock = parentBlock;
    }

    return currentBlock.id;
  } catch (error) {
    console.warn(`[getRootBlockId] Failed to get root block for ${blockId}:`, error);
    return undefined;
  }
}
```

### 第 2 步：替换导航逻辑

定位到 `src/services/ai-tools.ts` 的第 914-917 行（`createBlock` 工具中）：

**旧代码：**
```typescript
// 智能导航：不影响 AI 聊天面板
orca.nav.openInLastPanel("block", { blockId: refBlockId });
await new Promise(resolve => setTimeout(resolve, 100));
```

**新代码：**
```typescript
// === 智能导航：仅在必要时跳转 ===
// 1. 获取目标块的根页面 ID
const targetRootBlockId = await getRootBlockId(refBlockId);

// 2. 获取当前活动面板的根页面 ID
let currentRootBlockId: number | undefined = undefined;
try {
  const activePanelId = orca.state.activePanel;
  const activePanel = orca.nav.findViewPanel(activePanelId, orca.state.panels);

  if (activePanel && activePanel.view === "block" && activePanel.viewArgs?.blockId) {
    const currentBlockId = activePanel.viewArgs.blockId;
    currentRootBlockId = await getRootBlockId(currentBlockId);
  }
} catch (error) {
  console.warn("[createBlock] Failed to get current panel's root block:", error);
}

// 3. 智能导航决策
const needsNavigation = !targetRootBlockId || !currentRootBlockId || (targetRootBlockId !== currentRootBlockId);

if (needsNavigation) {
  // 需要导航：使用 replace 在当前面板替换视图，避免创建新面板
  console.log(`[createBlock] Navigating to block ${refBlockId} (root: ${targetRootBlockId})`);
  orca.nav.replace("block", { blockId: refBlockId });
  await new Promise(resolve => setTimeout(resolve, 100));
} else {
  // 已经在目标页面，无需导航
  console.log(`[createBlock] Already on target page (root: ${targetRootBlockId}), skipping navigation`);
}
// === 智能导航结束 ===
```

---

## 验证要点

修改后，请验证：
1. ✅ `getRootBlockId` 函数已添加到 `executeTool` 之前
2. ✅ 第 914-917 行的旧导航代码已完全替换
3. ✅ 新代码中使用了 `orca.nav.replace` 而非 `orca.nav.openInLastPanel`
4. ✅ 添加了详细的日志输出（`console.log`）
5. ✅ 错误处理逻辑完整（`try-catch` 包裹活动面板获取）

---

## 预期效果示例

**场景：** 用户在 "项目计划" 页面，要求 AI 翻译页面中的两个段落并插入中文

### 优化前
```
→ 翻译段落1，createBlock({ refBlockId: 100, content: "中文1" })
  → 跳转到 block 100 详细页面
→ 翻译段落2，createBlock({ refBlockId: 200, content: "中文2" })
  → 跳转到 block 200 详细页面
结果：面板在不同 block 间跳来跳去
```

### 优化后
```
→ 翻译段落1，createBlock({ refBlockId: 100, content: "中文1" })
  → 检测：已在 "项目计划" 页面 ✓
  → 日志：[createBlock] Already on target page (root: 12345), skipping navigation
  → 直接创建块，不跳转
→ 翻译段落2，createBlock({ refBlockId: 200, content: "中文2" })
  → 检测：已在 "项目计划" 页面 ✓
  → 日志：[createBlock] Already on target page (root: 12345), skipping navigation
  → 直接创建块，不跳转
结果：保持在 "项目计划" 页面，所有操作在同一页面完成
```

---

## 关键 API 说明

| API | 说明 |
|-----|------|
| `orca.nav.replace(view, viewArgs, panelId?)` | 在面板中替换视图，不记录历史，不创建新面板 |
| `orca.nav.findViewPanel(id, panels)` | 在面板树中查找指定 ID 的 ViewPanel |
| `orca.state.activePanel` | 当前活动面板的 ID |
| `block.parent` | 块的父块 ID（`null` 表示根块） |

---

## 完整文档参考
详细分析和设计思路请查看：`CREATEBLOCK-OPTIMIZATION-V2.md`
