# AI 工具测试用例

在 Orca Note 中打开 AI Chat 面板，逐个测试以下提示词。

## 1. 搜索类工具

### searchBlocksByTag
```
搜索 #TODO 标签的笔记
```
预期：返回带 TODO 标签的笔记列表

### searchBlocksByTag (countOnly)
```
我有多少条 #TODO 笔记
```
预期：AI 使用 countOnly:true，返回 `📊 统计结果：找到 X 条`

### searchBlocksByTag (briefMode)
```
列出所有 #book 标签的笔记标题
```
预期：AI 使用 briefMode:true，返回简洁列表

### searchBlocksByTag (分页)
```
搜索 #笔记 标签，从第51条开始
```
预期：AI 使用 offset:50，返回第51条之后的结果

### searchBlocksByText
```
搜索包含"会议"的笔记
```
预期：返回包含"会议"文字的笔记

### searchBlocksByReference
```
有多少笔记引用了[[番剧]]
```
预期：AI 使用 countOnly:true，返回统计数量

### searchBlocksByReference (分页)
```
列出引用[[番剧]]的笔记，显示第51-100条
```
预期：AI 使用 offset:50，返回分页结果

---

## 2. 读取类工具

### getTodayJournal
```
今天的日记写了什么
```
预期：返回今日日记内容

### getRecentJournals
```
最近3天的日记
```
预期：返回最近3天的日记列表

### getPage
```
读取"工作计划"页面的内容
```
预期：返回指定页面的完整内容

### get_tag_schema
```
book 标签有哪些属性
```
预期：返回 book 标签的属性定义

---

## 3. 写入类工具

### createBlock
```
在今日日记下添加一条：测试笔记 - 工具调用测试
```
预期：在今日日记下创建新笔记

### insertTag
```
给刚才创建的笔记加上 #test 标签
```
预期：为指定笔记添加标签

### createPage
```
把刚才的笔记设为页面，名称叫"测试页面"
```
预期：将笔记提升为页面

---

## 4. 高级查询工具

### query_blocks_by_tag
```
找所有 book 标签且 status 是 reading 的笔记
```
预期：返回符合条件的笔记

### query_blocks
```
找最近7天日记中未完成的任务
```
预期：返回日记中的未完成任务

---

## 检查要点

1. **Console 日志**：打开开发者工具 (Ctrl+Shift+I)，观察：
   - `[Tool] xxx found X results`
   - `countOnly=true` / `briefMode=true` / `offset=X`
   - 无 `Retrying with fallback format` 频繁出现

2. **返回格式**：
   - countOnly 模式：`📊 统计结果：找到 X 条...`
   - briefMode 模式：简洁的标题+摘要列表
   - 分页模式：`📄 显示第 X-Y 条（可能还有更多...）`

3. **上限警告**：结果达到50条时应显示：
   - `⚠️ 注意：结果已达到上限...`
