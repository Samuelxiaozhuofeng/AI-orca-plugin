# Orca Agent Bridge（本机 AI 中转）

让 Orca 插件的「本机 AI（Claude Code）」调用你电脑上的 `claude` 命令。需要 Node 18+ 和已登录的 Claude Code。

- 启动：`node bridge/orca-agent-bridge.mjs`，只监听 `http://127.0.0.1:18673`，用插件时保持终端开着。
- 令牌：首次启动自动生成，保存在 `~/.orca-agent-bridge/token`（启动时只显示文件位置，不打印令牌本身）。用 `pbcopy < ~/.orca-agent-bridge/token` 复制，填到插件里该平台的「API 密钥」；API 地址填 `http://127.0.0.1:18673`。令牌等于能以你的身份在本机执行命令，不要外传。
- 工作目录：默认 `~/OrcaAgent`（没有会自动建）。用 `--dir <路径>` 指定，可写多次：第一个是工作目录，其余是额外可访问目录，例如 `node bridge/orca-agent-bridge.mjs --dir ~/Notes --dir ~/Downloads`。
- 改笔记、改文件、跑命令前，插件都会弹确认；每次都问，不会记住「永久允许」。
- 自检（不需要真 claude）：`node bridge/selftest.mjs`。
