# Specification: Typography - Chat Interface Font System

## ADDED Requirements

### Requirement: Modern Sans-Serif Font Stack

The AI Chat Panel message content MUST use a modern sans-serif font system to improve information density and reading efficiency.

**ID:** TYPO-FONT-001
**Priority:** High

**Rationale**: While serif fonts are elegant, they are less efficient for long conversations and high-density content scenarios.

#### Scenario: Assistant 消息使用无衬线字体

- **GIVEN** AI 回复了一条消息
- **WHEN** 消息渲染在聊天面板中
- **THEN** 消息正文MUST使用以下字体栈（按优先级）：
  1. `-apple-system` (macOS/iOS)
  2. `BlinkMacSystemFont` (Chrome on macOS)
  3. `"Segoe UI"` (Windows)
  4. `"Noto Sans CJK SC"` (跨平台中文)
  5. `"Microsoft YaHei"` (Windows 后备)
  6. `sans-serif` (通用后备)
- **AND** MUST NOT使用衬线字体（如 "Noto Serif CJK SC", Georgia）

#### Scenario: 代码块使用等宽字体

- **GIVEN** 消息中包含代码块
- **THEN** 代码块MUST使用等宽字体栈：`"JetBrains Mono", Consolas, monospace`
- **AND** 代码块字体MUST NOT受正文字体变更影响

---

### Requirement: Optimized Font Size and Line Height

By fine-tuning font size and line height, the system MUST increase screen information density while maintaining readability.

**ID:** TYPO-SIZE-001
**Priority:** High

#### Scenario: Assistant 消息字号优化

- **GIVEN** AI 回复消息
- **THEN** 正文字号MUST为 **15px**（from 16px）
- **AND** 行高MUST为 **1.5**（from 1.6）
- **AND** 字号MUST NOT低于 14px（WCAG 可读性标准）
- **AND** 行高MUST NOT低于 1.4（避免行间拥挤）

#### Scenario: 代码块字号优化

- **GIVEN** 消息中包含代码块
- **THEN** 代码块字号MUST为 **12px**（from 13px）
- **AND** 代码块行高MUST保持 **1.5**
- **AND** 代码块字号MUST NOT低于 11px（最小可读性要求）

#### Scenario: 段落和列表行高优化

- **GIVEN** 消息中包含段落或列表
- **THEN** 段落行高MUST为 **1.6**（from 1.8）
- **AND** 列表项行高MUST为 **1.6**（from 1.8）
- **AND** MUST保持足够的垂直呼吸感（不过度紧凑）

---

### Requirement: Optimized Message Layout Density

By adjusting message bubble padding and spacing, the system MUST improve screen utilization and allow more conversation content to be visible per screen.

**ID:** TYPO-LAYOUT-001
**Priority:** Medium

#### Scenario: Assistant 消息气泡内边距优化

- **GIVEN** AI 回复消息
- **THEN** 消息气泡内边距MUST为 **14px 18px**（from 16px 20px）
- **AND** 内边距减少约 **12.5%**
- **AND** 视觉上MUST仍保持舒适的留白

#### Scenario: 用户消息气泡内边距优化

- **GIVEN** 用户发送消息
- **THEN** 消息气泡内边距MUST为 **10px 14px**（from 12px 16px）
- **AND** 内边距减少约 **12.5%**
- **AND** MUST与 assistant 消息保持视觉平衡

#### Scenario: 消息间距优化（节奏感）

**Gemini Review**: 节奏感（Rhythm）比单纯密度更重要。

- **GIVEN** 聊天面板中有多条消息
- **THEN** **同一发言人**的连续消息间距MUST为 **4-8px**（紧凑）
- **AND** **不同发言人**之间的消息间距MUST为 **24px**（清晰区分）
- **AND** 不同消息MUST仍能清晰区分（不粘连）
- **AND** 对话节奏MUST自然流畅

---

### Requirement: Readability Guarantees

While optimizing information density, the system MUST ensure that readability does not degrade and SHALL comply with WCAG standards.

**ID:** TYPO-READ-001
**Priority:** Critical

#### Scenario: 文字对比度符合 WCAG AA 标准

- **GIVEN** 聊天面板在任何主题下（深色/浅色）
- **THEN** 正文文字与背景的对比度MUST ≥ **4.5:1**（WCAG AA 标准）
- **AND** MUST使用 Orca 原生颜色变量（`--orca-color-text-1`, `--orca-color-bg-1` 等）
- **AND** MUST自动适配主题切换

#### Scenario: 字号不低于可读性下限

- **GIVEN** 任何文本元素
- **THEN** 正文字号MUST ≥ **14px**
- **AND** 代码块字号MUST ≥ **11px**
- **AND** 小字号元素（如元数据）MUST NOT用于长文本阅读

#### Scenario: Letter Spacing 提升精致感

**Gemini Review - Critical Enhancement**: 无衬线体需要字间距优化。

- **GIVEN** 消息使用无衬线字体
- **THEN** MUST增加 `letter-spacing: 0.01em` 或 `0.02em`
- **AND** 在小字号（14-15px）下，字间距MUST显著提升精致感
- **AND** 衬线体MUST NOT应用字间距（保持默认）

#### Scenario: 行长适中防止阅读疲劳

- **GIVEN** 消息内容较长
- **THEN** assistant 消息最大宽度MUST保持 **90%**（现有值）
- **AND** user 消息最大宽度MUST保持 **75%**（现有值）
- **AND** MUST避免过长行导致眼动疲劳（一行不超过 75-90 个字符）

---

### Requirement: Cross-Platform Font Rendering

The font system MUST render consistently and elegantly across different operating systems and browsers.

**ID:** TYPO-COMPAT-001
**Priority:** Medium

#### Scenario: macOS 使用系统原生字体

- **GIVEN** 用户在 macOS 上打开聊天面板
- **THEN** 英文和数字MUST使用 **-apple-system** 字体（San Francisco）
- **AND** 中文MUST使用 **Noto Sans CJK SC** 或 **PingFang SC**
- **AND** 字体渲染MUST清晰锐利（无模糊）

#### Scenario: Windows 使用系统原生字体

- **GIVEN** 用户在 Windows 上打开聊天面板
- **THEN** 英文和数字MUST使用 **Segoe UI** 字体
- **AND** 中文MUST使用 **Microsoft YaHei** 或 **Noto Sans CJK SC**
- **AND** 字体渲染MUST开启 ClearType（无锯齿）

#### Scenario: Linux 使用通用字体

- **GIVEN** 用户在 Linux 上打开聊天面板
- **THEN** MUST使用 **Noto Sans CJK SC** 作为主要字体
- **AND** MUST后备到系统 `sans-serif` 字体
- **AND** 字体渲染质量MUST依赖系统配置（fontconfig）

---

## MODIFIED Requirements

### Requirement: Message Text Style

Assistant messages SHALL use sans-serif fonts (system font stack), font size SHALL be 15px with line height 1.5, message padding SHALL be 14px 18px, and message spacing SHALL be 12px.

**ID:** TYPO-MSG-001
**Change Type:** Enhancement
**Priority:** High

**Before:**
- Assistant messages used serif fonts (Noto Serif CJK SC)
- Font size was 16px with line height 1.6
- Message padding was 16px 20px
- Message spacing was 16px

**After:**
- Assistant messages use sans-serif fonts (system font stack)
- Font size is 15px with line height 1.5
- Message padding is 14px 18px
- Message spacing is 12px

#### Scenario: 信息密度提升约 20-30%

- **GIVEN** 一个典型的对话窗口（高度 800px）
- **WHEN** 应用新字体和布局设置
- **THEN** 可见消息数量MUST增加约 **20-30%**
- **AND** 可读性主观评分MUST NOT降低（用户测试）

---

## Dependencies

**Depends on:**
- `chat-ui` spec - 消息组件必须使用这些字体样式
- Orca 颜色系统 - 使用 `--orca-color-*` 变量

**Blocks:**
_无_

---

## Testing Criteria

### Visual Tests
- [ ] macOS/Windows/Linux 下字体渲染正常
- [ ] 深色/浅色主题下对比度 ≥ 4.5:1
- [ ] 不同字号元素视觉层次清晰

### Readability Tests
- [ ] 用户主观评分（5分制）≥ 4.0
- [ ] 长文本阅读测试（无明显疲劳）
- [ ] 代码块可读性测试（语法清晰可辨）

### Density Tests
- [ ] 信息密度提升 20-30%（对比截图）
- [ ] 屏幕利用率提高（像素级测量）
- [ ] 无内容拥挤感（主观评估）
