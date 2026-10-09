怎么算做成：砍掉 Todoist / 闪卡 / 本地关系图 / 死代码，保留直连 API + 本机 AI 两种；本机 AI 下记忆和技能真的送到 AI；本机 AI 下多模型、提取记忆、生成画像不再报错；构建、测试通过，Orca 里实测聊天正常。
验到哪了：5b05c02 审过（gpt high + Opus，修复补审能合），已装进 Orca，等用户实测
下一步：用户在 Orca 里按验收步骤试；旧版备份可从 f5480dd 重新构建

- [x] 阶段 1（61a976c）：删死代码（SkeletonMessage / TokenProgressBar / script-executor-service / instagram-parser）、根目录杂物（test-dsml.mjs、deploy.bat）、Todoist、闪卡、本地关系图 + d3-force
- [x] 阶段 2（23aa247）：本机 AI 下送记忆 + 技能 + 回答格式要求；多模型排除本机 AI；提取记忆 / 画像遇本机 AI 改用直连模型或给提示
- [x] 送审 codex-review（修复 5b05c02）
- [x] 已装进 Orca
- [ ] 用户实测
