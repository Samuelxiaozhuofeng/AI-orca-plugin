# Implementation Plan

- [x] 1. 基础样式和工具函数





  - [x] 1.1 创建时间问候语函数 `getTimeGreeting`


    - 根据当前小时返回 "早上好"/"下午好"/"晚上好"
    - _Requirements: 3.1_
  - [x] 1.2 编写属性测试：时间问候语


    - **Property 1: Time-based greeting selection**
    - **Validates: Requirements 3.1**
  - [x] 1.3 创建日期格式化函数 `formatDateSeparator`


    - 返回 "今天"/"昨天"/具体日期
    - _Requirements: 4.1_
  - [x] 1.4 创建消息分组函数 `groupMessagesByDate`


    - 将消息按日期分组，返回带分隔符的列表
    - _Requirements: 4.1_
  - [x] 1.5 编写属性测试：消息日期分组


    - **Property 2: Message date grouping**
    - **Validates: Requirements 4.1**
  - [x] 1.6 创建 Token 进度计算函数


    - `calculateTokenPercentage(current, max)` - 计算百分比
    - `getProgressColor(percentage)` - 根据百分比返回颜色
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 1.7 编写属性测试：Token 进度


    - **Property 3: Token progress percentage calculation**
    - **Property 4: Token progress color thresholds**
    - **Validates: Requirements 5.1, 5.2, 5.3**


- [x] 2. Checkpoint - 确保所有测试通过




  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. 斜杠命令菜单优化





  - [x] 3.1 创建命令分类分组函数 `groupCommandsByCategory`


    - 将命令按 format/style/visualization 分组
    - _Requirements: 7.1_
  - [x] 3.2 创建模糊匹配函数 `fuzzyMatch`


    - 支持字符顺序匹配
    - _Requirements: 7.3_
  - [x] 3.3 创建最近命令管理


    - `addRecentCommand(command)` - 添加到最近使用
    - `getRecentCommands()` - 获取最近使用列表
    - 存储到 localStorage
    - _Requirements: 7.2_
  - [x] 3.4 编写属性测试：斜杠命令


    - **Property 5: Slash command category grouping**
    - **Property 6: Recent commands ordering**
    - **Property 7: Fuzzy command matching**
    - **Validates: Requirements 7.1, 7.2, 7.3**
  - [x] 3.5 更新 SlashCommandMenu 组件


    - 添加分类显示
    - 添加最近使用区域
    - 集成模糊搜索
    - _Requirements: 7.1, 7.2, 7.3_


- [x] 4. Checkpoint - 确保所有测试通过




  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. 消息气泡视觉升级





  - [x] 5.1 更新 `messageBubbleStyle` 函数


    - 用户消息：渐变背景
    - AI 消息：柔和阴影，移除边框
    - _Requirements: 1.1, 1.2_

  - [x] 5.2 添加消息入场动画

    - 创建 fade-in + slide-up 动画
    - 应用到 `messageRowStyle`
    - _Requirements: 1.3_


- [x] 6. 打字指示器组件




  - [x] 6.1 创建 TypingIndicator 组件


    - 三个点的跳动动画
    - 替换现有的 LoadingDots
    - _Requirements: 2.1, 2.2_
  - [x] 6.2 集成到 AiChatPanel


    - 在 AI 响应生成时显示
    - 内容开始输出时平滑过渡
    - _Requirements: 2.3_

- [x] 7. 空状态页面增强





  - [x] 7.1 更新 EmptyState 组件


    - 添加时间问候语
    - 添加卡片 hover 动画
    - 添加交错淡入效果
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 8. 消息分组与时间线






  - [x] 8.1 创建 DateSeparator 组件

    - 显示日期分隔线
    - 样式：居中文字 + 两侧横线
    - _Requirements: 4.1_
  - [x] 8.2 更新 AiChatPanel 消息渲染


    - 集成日期分组逻辑
    - 在消息间插入 DateSeparator
    - _Requirements: 4.1_

  - [x] 8.3 创建 ScrollToBottomButton 组件

    - 浮动按钮，滚动时显示
    - 点击平滑滚动到底部
    - _Requirements: 4.2, 4.3_


- [x] 9. Checkpoint - 确保所有测试通过




  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. 输入区域增强





  - [x] 10.1 创建 TokenProgressBar 组件


    - 进度条显示 token 占用
    - 颜色根据阈值变化
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 10.2 集成到 ChatInput


    - 显示在输入框下方
    - 实时更新
    - _Requirements: 5.1_
  - [x] 10.3 添加文件拖拽视觉反馈


    - 拖拽时显示虚线边框
    - 背景高亮
    - 离开时恢复
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 11. 上下文芯片增强





  - [x] 11.1 更新 ContextChips 组件


    - 显示每个芯片的 token 数
    - 显示总 token 数
    - _Requirements: 8.1, 8.2_

  - [x] 11.2 编写属性测试：上下文 Token 求和

    - **Property 8: Context token sum**
    - **Validates: Requirements 8.2**
  - [x] 11.3 添加 hover 预览 tooltip


    - 显示内容摘要
    - _Requirements: 8.3_


- [x] 12. 推理过程优化






  - [x] 12.1 更新 ReasoningBlock 组件


    - 添加步骤进度指示
    - 添加完成摘要
    - 折叠时显示时长和步骤数
    - _Requirements: 9.1, 9.2, 9.3_


- [x] 13. 工具调用状态优化




  - [x] 13.1 更新 ToolStatusIndicator 组件


    - 显示执行时间
    - 失败时显示重试按钮
    - _Requirements: 10.1, 10.2_
  - [x] 13.2 更新 CollapsibleToolCalls 组件


    - 显示并行进度 (x/y 完成)
    - _Requirements: 10.3_
  - [x] 13.3 编写属性测试：工具进度显示


    - **Property 9: Tool progress display**
    - **Validates: Requirements 10.3**

- [x] 14. Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.



- [x] 15. 加载状态优化



  - [x] 15.1 创建 SkeletonMessage 组件


    - 骨架屏样式
    - shimmer 动画
    - _Requirements: 11.1_
  - [x] 15.2 实现乐观更新


    - 发送消息时立即显示
    - 服务器确认后更新状态
    - _Requirements: 11.2_
  - [x] 15.3 添加网络错误重试


    - 显示错误消息
    - 提供重试按钮
    - _Requirements: 11.3_

- [x] 16. 显示设置





  - [x] 16.1 创建 DisplaySettings store


    - fontSize: small/medium/large
    - compactMode: boolean
    - showTimestamps: boolean
    - 持久化到 localStorage
    - _Requirements: 12.1, 12.2, 12.3_
  - [x] 16.2 创建 DisplaySettingsPanel 组件


    - 字体大小选择器
    - 紧凑模式开关
    - 时间戳显示开关
    - _Requirements: 12.1, 12.2, 12.3_
  - [x] 16.3 编写属性测试：显示设置


    - **Property 10: Compact mode spacing reduction**
    - **Property 11: Timestamp visibility toggle**
    - **Validates: Requirements 12.2, 12.3**
  - [x] 16.4 集成到 HeaderMenu


    - 添加显示设置入口
    - 应用设置到消息列表
    - _Requirements: 12.1, 12.2, 12.3_


- [x] 17. Final Checkpoint - 确保所有测试通过




  - Ensure all tests pass, ask the user if questions arise.
