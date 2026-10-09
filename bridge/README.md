# Orca Agent Bridge（本机 AI 中转）

让 Orca 插件的「本机 AI（Claude Code）」调用你电脑上的 `claude` 命令。需要 Node 18+ 和已登录的 Claude Code。

- 启动：`node bridge/orca-agent-bridge.mjs`，只监听 `http://127.0.0.1:18673`，用插件时保持终端开着。
- 令牌：首次启动自动生成，保存在 `~/.orca-agent-bridge/token`（启动时只显示文件位置，不打印令牌本身）。用 `pbcopy < ~/.orca-agent-bridge/token` 复制，填到插件里该平台的「API 密钥」；API 地址填 `http://127.0.0.1:18673`。令牌等于能以你的身份在本机执行命令，不要外传。
- 工作目录：默认 `~/OrcaAgent`（没有会自动建）。用 `--dir <路径>` 指定，可写多次：第一个是工作目录，其余是额外可访问目录，例如 `node bridge/orca-agent-bridge.mjs --dir ~/Notes --dir ~/Downloads`。
- 改笔记、改文件、跑命令前，插件都会弹确认；每次都问，不会记住「永久允许」。
- 完全放开模式（有风险）：`node bridge/orca-agent-bridge.mjs --full-access`。这时 AI **不弹任何确认**，直接改文件、跑命令、改笔记，也会读取你自己的 Claude Code 设置；令牌一旦泄露，任何拿到它的人都能以你的身份在本机执行命令。模式只能靠这个启动参数打开，插件和请求都改不了；不用时关掉终端，回到默认的安全模式。插件每次回复开头会显示一行「本机 AI · 模型 X · 安全模式 / ⚠ 完全放开模式」，看到 ⚠ 说明当前跑的是完全放开的 bridge。
- 选模型：在插件里给该平台添加模型，可选 `claude`（用 Claude Code 默认模型）、`fable`、`opus`、`sonnet`、`haiku`，也可以手填完整模型名（如 `claude-sonnet-4-5`）。选哪个，本机 AI 就用哪个回答；名字含空格等非法字符会直接报错。
- 若本机有管理员下发的 Claude Code 受管配置（`/Library/Application Support/ClaudeCode/managed-settings.json`）且其中有允许规则，启动时会列出这些规则：它们会让对应操作跳过确认。
- 自检（不需要真 claude）：`node bridge/selftest.mjs`。
