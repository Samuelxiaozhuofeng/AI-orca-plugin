# 模块文档索引（渐进维护）

本目录用于记录本插件各功能模块的设计与实现细节，并采用“渐进处理”方式维护：

- 每完成一个新模块：新增对应的 `*.md` 文档，并在本索引补充链接与说明。
- 每优化/重构一个模块：必须更新对应模块文档（包含接口变化、行为变化、已知限制、下一步计划）。
- 每次改动建议在模块文档末尾追加一条“更新记录”，便于审阅与回溯。

## 模块列表（按当前已实现功能）

1. `module-docs/01-ui-shell.md`：UI 外壳与入口（EditorSidetool、面板注册/开关、面板状态跟踪）
2. `module-docs/02-chat-panel.md`：AI Chat 面板（mock 对话、双栏布局、基础交互）
3. `module-docs/03-settings.md`：设置面板接入（settings schema → Orca 设置面板 `.orca-settings`）
4. `module-docs/04-context.md`：上下文读取与选择（block/page/tag、预览、右键菜单入口）
5. `module-docs/05-session-persistence.md`：会话持久化（保存/加载/历史/自动保存）

## 约定（所有模块通用）

- 样式：优先使用 `orca.components`；若需要 CSS，仅使用 `--orca-color-*` 主题变量并做作用域隔离。
- 文档结构建议包含：
  - 目标与范围
  - 关联文件
  - 对外接口/关键函数
  - 数据流/交互流
  - 已知限制
  - 下一步（对应 `task.md` / `progress.md` 的 Step）
  - 更新记录
