# createBlock 优化方案 v2.0 - 智能导航优化

## 问题描述

### 当前行为
在 `src/services/ai-tools.ts` 的 `createBlock` 工具中（863-947行），每次创建块之前都会执行：
```typescript
// 智能导航：不影响 AI 聊天面板
orca.nav.openInLastPanel("block", { blockId: refBlockId });
await new Promise(resolve => setTimeout(resolve, 100));
```

这导致了以下问题：

**场景示例：**
用户在 "项目计划" 页面中，要求 AI 翻译两个段落并在原位置插入翻译：
- AI 翻译第1段，调用 `createBlock({ refBlockId: 100, ... })`
  - → 打开 block 100 的页面
  - → 插入中文翻译
- AI 翻译第2段，调用 `createBlock({ refBlockId: 200, ... })`
  - → 打开 block 200 的页面（跳转！）
  - → 插入中文翻译

**问题：**
1. 面板会在不同 block 之间跳来跳去
2. 用户本来在 "项目计划" 页面，结果可能跳到某个子块的详细视图
3. 破坏了用户的工作上下文

### 期望行为
如果用户已经在目标页面（包含 refBlock 的页面），应该：
1. **不进行任何导航**
2. 直接在当前页面中创建块
3. 保持用户的工作上下文

只有在完全不在目标页面时，才需要导航（且应该使用 `replace` 而非 `openInLastPanel`）。

---

## 优化方案

### 核心逻辑

1. **获取目标块的根页面**
   - 通过 `refBlock` 向上追溯到根块（`parent === null` 的块）
   - 根块 ID 代表该页面

2. **检测当前活动面板的页面**
   - 获取当前活动面板：`orca.state.activePanel`
   - 获取该面板的视图：`orca.nav.findViewPanel(activePanelId, orca.state.panels)`
   - 检查视图类型和 blockId：
     - 如果是 `view === "block"`，获取其 `viewArgs.blockId`
     - 通过该 blockId 向上追溯到根块

3. **智能导航决策**
   ```
   IF 当前活动面板的根页面 === 目标块的根页面:
       不执行任何导航，直接创建块
   ELSE:
       使用 orca.nav.replace("block", { blockId: refBlockId }) 替换当前视图
       等待 100ms
   ```

### 具体实现

#### 1. 添加辅助函数 `getRootBlockId`

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

#### 2. 修改 `createBlock` 工具的导航逻辑

在 `ai-tools.ts` 的 914-917 行，替换为：

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

## 实施步骤

### 第 1 步：添加 getRootBlockId 函数
在 `src/services/ai-tools.ts` 顶部（`executeTool` 函数之前）添加 `getRootBlockId` 辅助函数。

### 第 2 步：修改 createBlock 的导航逻辑
定位到 `createBlock` 工具的第 914-917 行：
```typescript
// 旧代码：
orca.nav.openInLastPanel("block", { blockId: refBlockId });
await new Promise(resolve => setTimeout(resolve, 100));
```

替换为上述"智能导航"代码块。

### 第 3 步：测试验证
测试场景：
1. **同页面多次创建**：在 "项目计划" 页面，要求 AI 在两个段落后插入内容
   - 预期：不跳转，直接在当前页面创建
2. **跨页面创建**：在 "项目计划" 页面，要求 AI 在另一个页面 "会议记录" 中创建块
   - 预期：使用 `replace` 跳转到 "会议记录"，然后创建
3. **初次创建**：关闭所有 block 视图，只有 AI 聊天面板，要求创建块
   - 预期：使用 `replace` 在当前活动面板打开目标页面

---

## 预期效果

### 优化前
```
用户在 Page A
→ AI 调用 createBlock(block_in_Page_A_1)
  → 打开 block_in_Page_A_1 的详细页面（可能跳转）
  → 创建块
→ AI 调用 createBlock(block_in_Page_A_2)
  → 打开 block_in_Page_A_2 的详细页面（跳转！）
  → 创建块
结果：面板在不同 block 视图间跳来跳去
```

### 优化后
```
用户在 Page A
→ AI 调用 createBlock(block_in_Page_A_1)
  → 检测：已在 Page A ✓
  → 不导航，直接创建块
→ AI 调用 createBlock(block_in_Page_A_2)
  → 检测：已在 Page A ✓
  → 不导航，直接创建块
结果：保持在 Page A，所有操作在同一页面完成
```

---

## 附加优化建议

### 1. 使用 `replace` 而非 `openInLastPanel`
- `openInLastPanel` 会创建新面板或跳到"最后使用的面板"
- `replace` 在当前活动面板原地替换视图，不影响面板布局

### 2. 日志改进
添加详细日志以便调试：
```typescript
console.log(`[createBlock] Target block: ${refBlockId}, root: ${targetRootBlockId}`);
console.log(`[createBlock] Current panel root: ${currentRootBlockId}`);
console.log(`[createBlock] Needs navigation: ${needsNavigation}`);
```

### 3. 错误处理
如果无法获取根块 ID，保持当前行为（使用 `replace` 导航）：
```typescript
const needsNavigation = !targetRootBlockId || !currentRootBlockId || (targetRootBlockId !== currentRootBlockId);
```

---

## 关键代码位置

| 文件 | 行号 | 说明 |
|------|------|------|
| `src/services/ai-tools.ts` | 863-947 | `createBlock` 工具实现 |
| `src/services/ai-tools.ts` | 914-917 | **需要替换的导航逻辑** |
| `src/orca.d.ts` | 1027-1031 | `nav.replace` API 文档 |
| `src/orca.d.ts` | 1046 | `nav.openInLastPanel` API 文档 |

---

## 总结

此优化方案通过"页面级上下文感知"，避免了不必要的面板跳转：
1. **检测当前页面**：获取活动面板的根页面 ID
2. **检测目标页面**：获取目标块的根页面 ID
3. **智能决策**：同页面 → 不导航；跨页面 → 使用 `replace` 导航
4. **用户体验提升**：同页面多次创建时，保持在当前页面，不跳转

此设计符合"最小惊讶原则"：用户在某个页面工作时，AI 应该在该页面中创建内容，而不是频繁跳转到子块的详细视图。
