# Tasks: 优化工具调用UI与字体排版

## Phase 1: 工具状态显示优化

### 1.1 创建工具显示配置系统
- [x] 创建 `src/utils/tool-display-config.ts`
  - 定义 `ToolDisplayConfig` 接口（icon, loadingText, category）
  - 为所有工具（createBlock, searchBlocksByTag 等）定义配置
  - 导出 `getToolDisplayConfig(toolName)` 工具函数
  - 导出 `generateResultSummary(toolName, result)` 摘要生成函数

### 1.2 创建工具状态指示器组件
- [x] 创建 `src/components/ToolStatusIndicator.tsx`
  - 接收 props: `toolName`, `status: 'loading' | 'success' | 'failed' | 'cancelled'`, `result?`, `args?`
  - 根据工具类型渲染不同的图标和动画
  - 实现四种状态的视觉切换（Gemini review: 新增 failed, cancelled）
  - 点击展开详情功能（Gemini review: 触屏友好）

### 1.3 添加工具状态动画
- [x] 更新 `src/styles/chat-animations.ts`
  - 添加 `@keyframes sparkle`（✨ 闪烁动画，用于创建类工具）
  - 添加 `@keyframes pulse`（🔍 脉动动画，用于搜索类工具）
  - 添加 `@keyframes flip`（📖 翻页动画，用于查询类工具，简化为20deg）
  - 添加 `@keyframes shimmer`（备用闪烁动画）
  - 添加 CSS 动画类（`.tool-animation-*`）

### 1.4 重构工具调用显示逻辑
- [x] 更新 `src/views/MessageItem.tsx`
  - 重构 `ToolCallItem` 组件为 `ToolCallWithResult`：
    - 使用 `ToolStatusIndicator` 显示加载状态
    - 统一工具调用和结果显示
  - 重构 `ToolResultItem` 组件：
    - 使用 `ToolStatusIndicator` 替代技术性卡片
    - 显示简洁的结果摘要
  - 新增 `toolResults` props 支持（可选）

### 1.5 更新样式定义
- [x] 更新 `src/styles/ai-chat-styles.ts`
  - 添加 `toolStatusPillStyle`（工具状态指示器样式，Pill形状）
  - 添加 `toolStatusIconStyle`（工具图标样式）
  - 添加 `toolStatusTextStyle`（状态文本样式）
  - 添加 `toolStatusExpandButtonStyle`（展开按钮样式）
  - 添加 `toolStatusDetailsStyle`（详情面板样式）
  - 添加 `toolStatusErrorStyle`（错误显示样式）
  - 添加 `toolStatusRetryButtonStyle`（重试按钮样式）
  - 保留 `toolCardStyle`、`toolHeaderStyle`、`toolBodyStyle`（向后兼容）

## Phase 2: 字体排版优化

### 2.1 更新字体系统
- [x] 更新 `src/styles/ai-chat-styles.ts` 中的 `markdownContainerStyle`
  - Assistant 消息字体从衬线改为无衬线
  - 字体栈：`-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`
  - 字号从 16px 调整为 15px
  - 行高从 1.6 调整为 1.5
  - 添加 letter-spacing: 0.01em（Gemini review: 精致感）

### 2.2 优化消息布局密度
- [x] 更新 `messageBubbleStyle`
  - Assistant 消息内边距从 `16px 20px` 调整为 `14px 18px`
  - User 消息内边距从 `12px 16px` 调整为 `10px 14px`

- [x] 更新 `messageRowStyle`
  - 消息间距从 `marginBottom: 16px` 调整为 `12px`

### 2.3 优化代码块和内容元素
- [x] 更新代码块样式
  - `codeBlockPreStyle` 字号从 13px 调整为 12px
  - 行高保持 1.5

- [x] 更新段落和列表样式
  - `paragraphStyle` 行高从 1.8 调整为 1.6
  - `listItemStyle` 行高从 1.8 调整为 1.6

### 2.4 测试与微调
- [x] 构建成功验证
  - `npm run build` 通过，无错误
  - 模块数量：45 modules transformed
  - 输出大小：174.87 kB (gzip: 47.72 kB)

- [ ] 创建测试对话场景
  - 长文本对话（验证可读性）
  - 代码块密集对话（验证代码显示）
  - 工具调用密集对话（验证工具UI）

- [ ] 微调细节
  - 根据实际效果调整字号和间距
  - 确保不同屏幕尺寸下的表现
  - 验证与 Orca 主题的兼容性

## Validation

### 功能验证
- [x] 所有工具类型都有正确的图标和动画
  - 创建类工具（createBlock, createPage, insertTag）：✨ sparkle
  - 搜索类工具（searchBlocksByTag, etc）：🔍 pulse
  - 查询类工具（getPage, getTodayJournal, etc）：📖 flip
- [x] 工具状态转换流畅（loading → success → result summary）
- [x] 点击展开可以查看技术细节（参数、完整结果）
- [x] 不影响现有工具调用功能（构建通过）

### 视觉验证
- [ ] 字体在不同操作系统下渲染正常
- [ ] 信息密度提升明显（对比前后截图）
- [ ] 可读性没有降低（主观评估和用户测试）
- [ ] 动画性能良好（无卡顿）

### 兼容性验证
- [x] 深色/浅色主题兼容（使用 Orca CSS 变量）
- [ ] 不同浏览器兼容（Chromium 内核）
- [x] 现有消息格式向后兼容（保留原有样式定义）
