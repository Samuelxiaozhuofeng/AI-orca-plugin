怎么算做成：本机 AI 每个对话可选工作文件夹（粘贴路径 + 最近用过，没选用默认，随时可换）；不存在报错不建；首行显示实际文件夹；完全放开不加载所选文件夹项目设置、不会启动所选文件夹里的同名程序。
验到哪了：设计门、审码三轮（gpt high + Opus）已过；真 claude 实测选文件夹运行正常；已打包装进 Orca，等用户实测
下一步：用户退出中转后重开 Orca，按验收步骤试；另：首次打开面板恢复会话的归属检查过晚（旧问题，待单独修）

- [x] 阶段 1（61a976c）：删死代码（SkeletonMessage / TokenProgressBar / script-executor-service / instagram-parser）、根目录杂物（test-dsml.mjs、deploy.bat）、Todoist、闪卡、本地关系图 + d3-force
- [x] 阶段 2（23aa247）：本机 AI 下送记忆 + 技能 + 回答格式要求；多模型排除本机 AI；提取记忆 / 画像遇本机 AI 改用直连模型或给提示
- [x] 送审 codex-review（修复 5b05c02）
- [x] 已装进 Orca
- [ ] 用户实测
