# Orca Agent Bridge（本机 AI 中转）

让 Orca 插件的「本机 AI（Claude Code）」调用你电脑上的 `claude` 命令。需要 Node 18+ 和已登录的 Claude Code。

- 安装（推荐，随 Orca 自动启动）：在仓库目录运行 `bash bridge/build-app.sh`，会生成 `/Applications/Orca Agent Bridge.app`（没有 Dock 图标）。之后打开 Orca 时，插件发现设置里有「本机 AI」平台而中转没开，会自动打开这个 App；它在后台跑中转，日志写到 `~/.orca-agent-bridge/bridge.log`。App 里记的是仓库里 bridge 和 node 的绝对路径：仓库挪了位置或换了 node，重新运行一次 `build-app.sh`。
- 权限：AI 需要用到截屏、读写受保护文件夹等时，到「系统设置 → 隐私与安全性」给「Orca Agent Bridge」打开对应开关（如「屏幕与系统音频录制」「文件与文件夹」）。
- 关掉 Orca 后中转仍留在后台；要退出：`kill $(lsof -tiTCP:18673 -sTCP:LISTEN)`（18673 是默认端口，用 `--port` 改过就换成你的端口；App 随之退出；手动启动的直接在原终端按 Ctrl-C）。
- 手动启动（不装 App）：`node bridge/orca-agent-bridge.mjs`，只监听 `http://127.0.0.1:18673`，用插件时保持终端开着。
- 令牌：首次启动自动生成，保存在 `~/.orca-agent-bridge/token`（启动时只显示文件位置，不打印令牌本身）。用 `pbcopy < ~/.orca-agent-bridge/token` 复制，填到插件里该平台的「API 密钥」；API 地址填 `http://127.0.0.1:18673`。令牌等于能以你的身份在本机执行命令，不要外传。
- 模式与目录：写在 `~/.orca-agent-bridge/config.json`（仅本人可读）。用 App 启动时，若没有这个文件，App 会先写入 `{"fullAccess": true, "dirs": ["~/OrcaAgent"]}`（权限 0600），即**用 App 默认完全放开**；手动启动且没有这个文件时，中转按安全模式、工作目录 `~/OrcaAgent` 运行，也不生成文件。文件不归你本人所有或别人可写时中转拒绝启动（日志里会给出修复命令）。改成 `"fullAccess": false` 就是安全模式；`dirs` 第一个是默认工作目录（没有会自动建），其余是额外可访问目录，支持 `~`。工作文件夹也可以在插件对话里单独选（输入框旁的文件夹按钮，仅本机 AI 显示）：每个对话各记各的，没选就用这里的默认目录；选的文件夹必须已存在（中转不会替你建），额外可访问目录照旧来自 config.json。完全放开模式下不加载所选文件夹里的项目级 Claude 设置（其中的 `.claude/settings.json`、hooks 等不生效），只用你自己的用户级设置。改完退出中转（见上面的退出命令，端口按实际的填；手动启动的在原终端 Ctrl-C）再打开 Orca 或 App 生效。文件格式不对时中转拒绝启动，原因写在日志里。
- 命令行参数优先于 config.json：`--dir <路径>`（可写多次，写了就不用配置里的 dirs）、`--full-access`、`--port <端口>`。
- 完全放开模式（有风险，用 App 启动时默认就是它）：AI **不弹任何确认**，直接改文件、跑命令、改笔记，也会读取你自己的 Claude Code 设置；令牌一旦泄露，任何拿到它的人都能以你的身份在本机执行命令。模式只由 config.json 或启动参数决定，插件和请求都改不了。插件每次回复开头会显示一行「本机 AI · 模型 X · 安全模式 / ⚠ 完全放开模式」，看到 ⚠ 说明当前跑的是完全放开的 bridge。
- 安全模式（`"fullAccess": false`）：改笔记、改文件、跑命令前，插件都会弹确认；每次都问，不会记住「永久允许」。
- 工具：两种模式都给同一份常用工具（命令、读写文件、搜索、联网、子代理等），并能控制你的谷歌浏览器（需装好 Claude in Chrome 扩展；浏览器里用的是你已登录的账号，安全模式下每一步都弹确认）。不给定时 / 后台任务、给其他 Claude 会话发消息这类工具。一轮对话结束后 3 秒内 claude 没自己退出，中转会把它结束掉。
- 选模型：在插件里给该平台添加模型，可选 `claude`（用 Claude Code 默认模型）、`fable`、`opus`、`sonnet`、`haiku`，也可以手填完整模型名（如 `claude-sonnet-4-5`）。选哪个，本机 AI 就用哪个回答；名字含空格等非法字符会直接报错。
- 若本机有管理员下发的 Claude Code 受管配置（`/Library/Application Support/ClaudeCode/managed-settings.json`）且其中有允许规则，安全模式会拒绝启动并列出这些规则（它们会让对应操作跳过确认，无法保证每次确认）；完全放开模式不受影响。
- 自检（不需要真 claude）：`node bridge/selftest.mjs`。
