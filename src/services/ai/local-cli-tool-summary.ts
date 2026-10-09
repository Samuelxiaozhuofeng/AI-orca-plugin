/**
 * 本机 AI 工具事件 → 思考区里的一句中文摘要。
 * 参数来自 AI / 命令输出，是外来内容：压成单行、截断，路径 / 命令放进行内代码（去掉反引号），
 * 思考区按 markdown 解析成节点渲染（不执行 HTML），行内代码里的 * _ [ < 都按原文显示。
 */

const MAX_SUMMARY = 120;
const MAX_ERROR = 300;

function oneLine(text: unknown, max: number): string {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** 行内代码：反引号换成单引号，保证代码段不提前结束 */
function code(text: unknown, max = MAX_SUMMARY): string {
  const s = oneLine(text, max).replace(/`/g, "'");
  return s ? `\`${s}\`` : "";
}

/** 路径只留最后三段 */
function shortPath(p: unknown): string {
  const parts = String(p ?? "").split("/").filter(Boolean);
  return parts.length > 3 ? `…/${parts.slice(-3).join("/")}` : String(p ?? "");
}

function describe(name: string, input: any): string {
  const i = input && typeof input === "object" ? input : {};
  switch (name) {
    case "Read": return `读取 ${code(shortPath(i.file_path))}`;
    case "Write": return `写入 ${code(shortPath(i.file_path))}`;
    case "Edit": return `修改 ${code(shortPath(i.file_path))}`;
    case "NotebookEdit": return `修改 ${code(shortPath(i.notebook_path ?? i.file_path))}`;
    case "Bash": return `运行 ${code(i.command)}`;
    case "Grep": return `搜索 ${code(i.pattern)}`;
    case "Glob": return `查找 ${code(i.pattern)}`;
    case "WebFetch": return `打开 ${code(i.url)}`;
    case "WebSearch": return `网上搜索 ${code(i.query)}`;
    case "Task":
    case "Agent": return `派子任务：${oneLine(i.description, MAX_SUMMARY).replace(/[`*_[\]<>]/g, " ")}`;
    case "TaskStop": return "停止子任务";
    case "ToolSearch": return `查找可用工具 ${code(i.query)}`;
    case "Skill": return `使用技能 ${code(i.skill ?? i.command)}`;
  }
  const mcp = /^mcp__.+?__(.+)$/.exec(name);
  return `调用 ${code(mcp ? mcp[1] : name)}`;
}

/** 前缀：子代理事件缩进一级 */
function lead(sub: unknown): string {
  return sub ? "  ↳ " : "";
}

/** tool 事件 → 一行摘要（前后带换行，与旧格式一致） */
export function summarizeToolCall(ev: any): string {
  const line = oneLine(describe(String(ev?.name ?? "工具"), ev?.input), MAX_SUMMARY + 20);
  return `\n${lead(ev?.sub)}${line}\n`;
}

/** tool_result 事件 → 失败一行（带原因）；成功不显示，返回空串 */
export function summarizeToolResult(ev: any): string {
  if (ev?.ok) return "";
  const reason = ev?.error ? `：${code(ev.error, MAX_ERROR)}` : "";
  return `${lead(ev?.sub)}${String(ev?.name ?? "工具").replace(/[`*_[\]<>\s]/g, "")} 失败${reason}\n`;
}
