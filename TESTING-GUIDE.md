# Query Enhancement Testing Guide

## 准备工作

### 1. 构建插件

```bash
cd "d:\orca插件\AI plugin"
npm run build
```

### 2. 部署插件

将 `dist/` 目录复制到 Orca 插件目录，或使用你的部署脚本。

### 3. 重启 Orca Note

确保新版本插件已加载。

---

## 测试用例

### 测试 1: 搜索所有任务

**用户输入**：

```
显示所有任务
```

**预期 AI 行为**：

- 调用工具：`searchTasks`
- 参数：`{ completed: undefined }` (不传 completed 参数)

**预期结果**：

- 返回所有任务块（包括已完成和未完成）
- 每个结果显示为可点击链接
- 格式：`1. [任务标题](orca-block:123)\n任务内容...`

---

### 测试 2: 搜索未完成任务

**用户输入**：

```
找出所有未完成的任务
```

**预期 AI 行为**：

- 调用工具：`searchTasks`
- 参数：`{ completed: false }`

**预期结果**：

- 只返回未完成的任务
- 结果前缀显示 "Found X incomplete task(s):"

---

### 测试 3: 搜索已完成任务

**用户输入**：

```
显示已完成的任务
```

**预期 AI 行为**：

- 调用工具：`searchTasks`
- 参数：`{ completed: true }`

**预期结果**：

- 只返回已完成的任务
- 结果前缀显示 "Found X completed task(s):"

---

### 测试 4: 搜索昨天的日记

**用户输入**：

```
显示昨天的日记
```

**预期 AI 行为**：

- 调用工具：`searchJournalEntries`
- 参数：`{ startOffset: -1, endOffset: -1 }`

**预期结果**：

- 返回昨天的日记条目
- 显示 "Found X journal entries from -1 to -1 days:"

---

### 测试 5: 搜索过去一周的日记

**用户输入**：

```
显示过去一周的日记
```

**预期 AI 行为**：

- 调用工具：`searchJournalEntries`
- 参数：`{ startOffset: -7, endOffset: 0 }`

**预期结果**：

- 返回过去 7 天的所有日记条目
- 按修改时间降序排列

---

### 测试 6: 搜索今天的日记

**用户输入**：

```
显示今天的日记
```

**预期 AI 行为**：

- 调用工具：`searchJournalEntries`
- 参数：`{ startOffset: 0, endOffset: 0 }`

**预期结果**：

- 返回今天的日记条目

---

### 测试 7: OR 查询 - 多个标签

**用户输入**：

```
找到标记为 urgent 或 important 的笔记
```

**预期 AI 行为**：

- 调用工具：`query_blocks`
- 参数：

```json
{
  "conditions": [
    { "type": "tag", "name": "urgent" },
    { "type": "tag", "name": "important" }
  ],
  "combineMode": "or"
}
```

**预期结果**：

- 返回带有 `urgent` 或 `important` 标签的所有笔记
- 显示 "Found X block(s) matching OR query:"

---

### 测试 8: AND 查询 - 标签 + 文本

**用户输入**：

```
找到标记为 project 并且包含 deadline 的笔记
```

**预期 AI 行为**：

- 调用工具：`query_blocks`
- 参数：

```json
{
  "conditions": [
    { "type": "tag", "name": "project" },
    { "type": "text", "text": "deadline" }
  ],
  "combineMode": "and"
}
```

**预期结果**：

- 返回同时满足两个条件的笔记
- 显示 "Found X block(s) matching AND query:"

---

### 测试 9: 复合查询 - 任务 + 文本

**用户输入**：

```
找到包含"紧急"的未完成任务
```

**预期 AI 行为**：

- 调用工具：`query_blocks`
- 参数：

```json
{
  "conditions": [
    { "type": "task", "completed": false },
    { "type": "text", "text": "紧急" }
  ],
  "combineMode": "and"
}
```

**预期结果**：

- 返回包含"紧急"的未完成任务

---

### 测试 10: 向后兼容 - 标签搜索

**用户输入**：

```
找到标记为 work 的笔记
```

**预期 AI 行为**：

- 调用工具：`searchBlocksByTag`（现有工具）
- 参数：`{ tagName: "work" }`

**预期结果**：

- 使用现有工具正常工作
- 证明向后兼容性

---

### 测试 11: 向后兼容 - 文本搜索

**用户输入**：

```
搜索包含"会议"的笔记
```

**预期 AI 行为**：

- 调用工具：`searchBlocksByText`（现有工具）
- 参数：`{ searchText: "会议" }`

**预期结果**：

- 使用现有工具正常工作

---

### 测试 12: 向后兼容 - 属性过滤

**用户输入**：

```
找到 priority 大于等于 8 的 task
```

**预期 AI 行为**：

- 调用工具：`queryBlocksByTag`（现有工具）
- 参数：

```json
{
  "tagName": "task",
  "properties": [{ "name": "priority", "op": ">=", "value": 8 }]
}
```

**预期结果**：

- 使用现有工具正常工作
- 返回带有属性值的结果

---

## 调试技巧

### 1. 查看控制台日志

打开 Orca 的开发者工具（如果支持），查看以下日志：

```
[Tool] searchTasks: { completed: false, maxResults: 50 }
[searchTasks] Called with: { completed: false, options: {}, maxResults: 50 }
[searchTasks] Query description: {"q":{"kind":100,"conditions":[{"kind":11,"completed":false}]},...}
```

### 2. 检查工具调用

AI 应该在响应中显示它调用了哪个工具。例如：

```
🔧 Using tool: searchTasks
```

### 3. 验证查询结构

如果查询失败，检查日志中的 `Query description` 是否正确：

- 任务查询应该有 `kind: 11`
- 日记查询应该有 `kind: 3`
- OR 查询应该有 `kind: 101`
- CHAIN_AND 查询应该有 `kind: 106`

---

## 常见问题

### Q: AI 没有调用新工具？

**A**: 确保：

1. 插件已重新构建并部署
2. Orca 已重启
3. 用户输入明确表达了意图（例如，明确说"任务"而不是"笔记"）

### Q: 查询返回空结果？

**A**: 检查：

1. 数据库中是否有对应的块（任务、日记等）
2. 日期偏移是否正确（负数表示过去）
3. 标签名称是否正确

### Q: 工具调用失败？

**A**: 查看：

1. 控制台错误日志
2. 后端 API 是否返回错误
3. 查询描述格式是否正确

---

## 性能测试

### 测试大量结果

**用户输入**：

```
显示所有任务，最多 50 个
```

**预期**：

- 应该限制在 50 个结果以内
- 响应时间应该在合理范围内（< 3 秒）

---

## 边界情况测试

### 测试 1: 空结果

```
找到标记为 nonexistent_tag 的笔记
```

**预期**：AI 应该友好地告知没有找到结果

### 测试 2: 无效日期范围

```
显示未来 7 天的日记
```

**预期**：应该返回空结果（因为未来还没有日记）

### 测试 3: 复杂嵌套查询

```
找到在 project 标签下的包含 deadline 的未完成任务
```

**预期**：AI 可能使用 `query_blocks` 与 `chain_and` 模式

---

## 成功标准

✅ 所有 12 个基本测试用例通过
✅ 向后兼容性测试通过
✅ 控制台无错误日志
✅ 查询响应时间 < 3 秒
✅ 结果格式正确（可点击链接）
✅ 边界情况处理得当

---

## 报告问题

如果发现问题，请记录：

1. 用户输入
2. AI 调用的工具和参数
3. 实际结果 vs 预期结果
4. 控制台错误日志
5. Orca 版本和插件版本
