# 本机 AI 续接 Claude Code 会话 — 设计说明

## 用户要的效果（已拍板）
- 一个聊天对话固定对应一个 Claude Code 会话，持久化：重启 Orca / 中转、隔天打开都接着聊，干过的活（读过的文件、工具结果）都记得。
- 点停止后再发：接着停下时的进度。
- 回档 / 删最后一轮 / 重新生成 / 出错重试：像 Claude Code 的 rewind，退回到那一句接着聊（之后的内容 AI 真忘，之前的活记得；文件改动不还原）。
- 切分支：从分支点分出去，原线不受影响。
- 删中间某条（后面还有）：同一会话接着用，下一轮告诉 AI「用户删掉了这些，当作没说过」。
- 会话记录找不到：自动新开，把可见对话整段发过去（= 现在的行为）。

## 实测事实（Claude Code 2.1.294，print + stream-json）
- `--resume <sid>` 续接，sid 不变，追加到同一 jsonl。跨 cwd 也能 resume。
- `--resume <sid> --resume-session-at <assistant uuid> --fork-session`：截到该 assistant 消息，之后的全忘；fork 给新 sid，原 jsonl 不变（复制的记录 uuid 相同）。截到 user uuid 会留悬空问题，不用。
- `--replay-user-messages` 回显用户 prompt 的 uuid；每条完整 assistant 事件带 uuid（stream_event / result 的 uuid 不是消息 uuid）。
- SIGTERM 中途杀：已完成的记录在，未完成的 assistant 文本不落盘；再 `--resume` 能接上（CLI 自动补一条 "No response requested."）。
- 找不到：`No conversation found with session ID` / `No message found with message.uuid`，exit=1，开头即失败无输出。`--resume-session-at` 是隐藏参数，未来版本可能变。
- 两进程同时 resume 同一 sid：不报错，jsonl 分叉。

## 方案
### 存什么（对话存档 Sessions/<id>.json）
1. 每条经本机 AI 的消息上加 `cc?: { sid: string; uuid: string; partial?: true }`
   - user 消息：claude 回显的 prompt uuid。
   - assistant 消息：本轮最后一条完整 assistant 事件的 uuid；本轮被停止 / 出错时记最后一个已知 uuid（可能是 user uuid），标 `partial`。
   - 存在 Message 上，所以分支（branches[].messages）、回档、删除天然跟着走。
2. 对话级 `ccHead?: { sid; uuid }`：最近一次本机 AI 运行在 claude 侧的末尾位置，每轮收尾（含停止）更新。
3. 对话级 `ccDeleted?: { uuid; role; excerpt(≤80字); at }[]`：删除处理函数里，被删的消息若带 cc 就记一条墓碑（事件式记录，不靠事后比对快照——上一版的坑）。

### 每次发送怎么决定
在发送时那份历史（不含新 user 消息）里：
- **锚点** = 最后一条带 cc 的 assistant 消息。没有 → 新开会话，整段文字（现行为）。
- 锚点 == ccHead（sid、uuid 都相同）→ `--resume sid`（停止后接着用也走这条）。
- 否则（回档、删末轮、重新生成、重试、切分支、继续对话复制出来的、旧版本存档缺 ccHead）→ `--resume 锚点.sid --resume-session-at 锚点.uuid --fork-session`，新 sid。原会话永远不被截断，其它分支的锚点仍有效。
- 锚点之后、在历史里但 AI 没见过的消息（中间用了别的模型的几轮）→ 作为文字附在本轮 prompt：「期间用户和其他模型的对话：…」。
- 墓碑：只取 `at` 早于锚点消息时间的（锚点之后的已被截断，不用再说），附「用户删掉了以下内容，当作没说过：…」；本轮收到 session 事件后清空已用的墓碑。
- 格式要求、拖入的上下文：每轮照旧附上（不改）。

### 和中转程序的协议
- 请求体同时带 `prompt`（整段文字，旧中转只认这个 → 照旧工作）和新字段 `resume: { sid, at?, fork? , prompt }`（新中转用 resume.prompt）。
- 新中转加 `--replay-user-messages`，把 user / assistant uuid 发回；session 事件带 `resumed: true`。插件请求了续接而 session 事件没有 resumed → 判为旧中转，提示一次「中转是旧版，续接没生效，请退出中转后重开 Orca」，本轮照常（旧中转本来就用整段 prompt）。
- 续接失败且本轮尚无任何输出（找不到记录、隐藏参数失效、任何 exit≠0 早退）→ 自动改为新开会话 + 整段文字重试一次，并清 ccHead。

### 四个万一
① 两处同时写：只有一个面板；同对话生成中不能再发；切对话会停掉旧请求，中转断开即杀子进程。万一两进程 resume 同 sid，jsonl 分叉不丢，下一轮按锚点 fork 走得通。多 Orca 窗口同写存档是存量问题，不在本次范围。
② 读不出当成空：存档缺 cc / ccHead → 退回整段文字或 fork，不会只发最新一句；续接失败 → 整段重试，不会把对话当空。
③ 外来内容执行：墓碑摘录、其它模型回复只作为纯文本拼进 prompt，不改变权限。
④ 旧数据 / 旧版本：旧存档无 cc → 第一次走整段，之后有锚点；旧版插件读新存档忽略新字段，saveSession 手抄字段会丢 ccHead → 新版下次 fork，安全；旧中转 → 见协议。
⑧ 临时状态：锚点在发送那一刻从当时历史算，不在收尾时按界面快照认证；收尾写 cc 只按消息 id 写回，消息已被删则写不进去（updateMessage 无此 id 即无操作）；ccHead 无论如何只是「是否可直接 resume」的优化，判错只会多一次 fork。
⑩ 补认领：不做按差集猜测；墓碑在删除事件时按消息记。

## 这次不会动什么
- 不删、不改 ~/.claude/projects 里任何 Claude Code 会话文件（只读 / 只通过 claude CLI 追加或 fork）。
- 不改其它模型的发送逻辑、存档格式中已有字段、分支 / 删除 / 回档本身的行为。
- 不迁移旧存档：新字段只在之后的对话中写入。
- 不改权限模式、确认弹窗、工作文件夹逻辑。

## 要改的地方
- bridge/orca-agent-bridge.mjs：resume 参数、--replay-user-messages、发回 uuid、resumed 标记、早退错误类型。bridge/selftest.mjs 补用例。
- src/services/ai/local-cli-client.ts：决定 resume 方式、拼 resume.prompt、cc chunk、失败整段重试。
- src/services/session-service.ts：Message.cc、SessionFileData/SavedSession 加 ccHead/ccDeleted，saveSession / autoCacheSession 手抄字段补上（ai-chat-ui.ts autoSaveOnClose 经 saveSession）。
- src/views/AiChatPanel.tsx：把 cc 写到 user / assistant 消息、更新 ccHead、删除时记墓碑。

---
## v2 修订（回应设计门第一轮）
用户已明确要 rewind 效果，不采纳「只留直接续接」的简化；改为**分两段实施**，每段单独验收：
- 第一段：只做「锚点 == ccHead → `--resume sid`，否则整段重开」+ 停止后半截文字补发 + 旧中转兼容 + 失败整段重试 + 同 sid 并发防护。错了只退化成今天的行为。
- 第二段：在第一段基础上加 rewind（fork 到锚点）和中间删除的墓碑。

逐条修：
1. **partial 半截正文**：锚点那条 assistant 若 `partial`，把屏幕上它的正文（去模式行）作为「上一轮你输出到这里被用户停止：…」附进本轮 prompt。
2. **fork 目标只认非 partial**：锚点 = 历史里最后一条带 cc 且非 partial 的 assistant；partial 的 uuid 只参与 ccHead 比对。直接续接的条件：历史最后一条带 cc 的 assistant（可 partial）就是 ccHead 那条 → `--resume`；否则按非 partial 锚点 fork；没有非 partial 锚点 → 整段重开。
3. **墓碑按被删消息自己的 createdAt** 过滤：只取 `createdAt <= 锚点.createdAt` 的。
4. **对话有 ccHead（或任一消息带 cc）时，删任何非 localOnly 消息都记墓碑**（含别的模型的轮次）；第 3 条的时间过滤保证锚点之后、AI 没见过的不会被提。
5. **只在 session 事件带 `resumed: true` 时**：清本轮已用墓碑、写 cc、更新 ccHead。旧中转那轮三者都不动。
6. **同 sid 并发**：中转维护「sid → 正在跑的子进程」；新请求要 resume 的 sid 还在跑 → 先 SIGTERM 旧的并等它退出，再起新的（旧请求已被插件作废）。fork 不受影响（不写原 sid）。
7. **出错重试的重复问题**：失败轮若已收到本轮 user uuid（replay），把那条 user 消息记 cc partial；重试时锚点比对不等 → 第二段 fork 到之前的非 partial 锚点（第一段则整段重开）。
8. 已知代价写明：每次 fork 复制一份 jsonl（随历史增长，几百 KB 级），不删旧文件。
9. 「不会动什么」更正：`handleDeleteMessage` 会多记墓碑（只加记录，不改删除本身）；其余删除 / 回档 / 分支逻辑不改。
10. 旧插件丢 ccDeleted 的风险：接受（旧插件上删中间消息后回新插件，AI 可能仍记得被删的那条；只影响混用旧版的人）。
未坐实待验（实施时实测）：杀在工具执行中后 resume 的表现；并发防护后不再出现分叉。

## v3（照设计门第二轮原样采纳）
- A：第一段 `handleDeleteMessage` 删到任何非 localOnly 消息 → 清 ccHead（下次整段重开）。第二段改成墓碑。
- B：墓碑不清，每次发送按 `createdAt <= 锚点.createdAt` 筛一遍附上。
- C：`cc.uuid` 缺失的锚点视为不可 fork（只能 == ccHead → resume，否则整段）。第一段就记 claude assistant uuid。
- 中转等旧进程退出加上限：SIGTERM 后 3 秒仍未退出 → SIGKILL；selftest 覆盖。
- 删掉 v2 第 7 条。
