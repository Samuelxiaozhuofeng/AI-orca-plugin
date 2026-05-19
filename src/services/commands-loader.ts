/**
 * Commands 加载器服务
 * 
 * 功能：
 * 1. 按需加载 /command 对应的 Markdown 文件
 * 2. 如果用户文件被删除，自动从代码中的默认模板恢复
 * 3. 用户修改的内容不会被覆盖
 * 
 * 存储位置（全局）：
 *   {plugin-dir}/Commands/{command-name}.md
 */

import { getDefaultCommand, getDefaultCommandNames } from "./commands-defaults";
import { getAiChatPluginName } from "../ui/ai-chat-ui";

// Commands 目录名
const COMMANDS_DIR = "Commands";

/**
 * 命令内容的缓存（避免重复读取文件）
 */
const commandCache = new Map<string, { content: string; loadedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

// ─────────────────────────────────────────────────────────────────────────────
// File Operations
// ─────────────────────────────────────────────────────────────────────────────

/** 获取插件名称 */
function getPluginName(): string {
  const name = getAiChatPluginName();
  return name || "ai-chat";
}

/** 构建 Command 文件路径 */
function buildCommandPath(commandName: string): string {
  return `${COMMANDS_DIR}/${commandName}.md`;
}

/** 读取文件（全局存储） */
async function readFile(path: string): Promise<string | null> {
  const pluginName = getPluginName();
  try {
    const content = await orca.plugins.readFile(pluginName, path, "string");
    if (!content) return null;
    return typeof content === 'string'
      ? content
      : new TextDecoder().decode(new Uint8Array(content as ArrayBuffer));
  } catch {
    return null;
  }
}

/** 写入文件（全局存储） */
async function writeFile(path: string, content: string): Promise<void> {
  const pluginName = getPluginName();
  await orca.plugins.writeFile(pluginName, path, content);
}

/** 列出所有文件（全局存储） */
async function listFiles(): Promise<string[]> {
  const pluginName = getPluginName();
  return orca.plugins.listFiles(pluginName);
}

/** 检查文件是否存在 */
async function fileExists(path: string): Promise<boolean> {
  const content = await readFile(path);
  return content !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// YAML Frontmatter 解析
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 解析 Markdown frontmatter
 * 提取 description 字段（可选）
 */
function parseFrontmatter(content: string): { description?: string; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  
  if (!match) {
    // 没有 frontmatter，整个内容就是 body
    return { body: content };
  }
  
  const frontmatterText = match[1];
  const body = match[2];
  
  // 简单解析 description（支持单引号、双引号或无引号）
  const descMatch = frontmatterText.match(/description:\s*['"]?([^'"\n]+)['"]?/);
  const description = descMatch ? descMatch[1].trim() : undefined;
  
  return { description, body };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 读取命令文件
 * @param commandName 命令名称（不含 .md 后缀）
 * @returns 命令的内容（去掉 frontmatter），如果不存在返回 null
 */
export async function loadCommand(commandName: string): Promise<string | null> {
  // 检查缓存
  const cached = commandCache.get(commandName);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
    return cached.content;
  }

  const filePath = buildCommandPath(commandName);

  try {
    // 先尝试读取用户文件
    let rawContent = await readFile(filePath);
    
    if (rawContent === null) {
      // 用户文件不存在，从代码中的默认模板恢复
      const defaultContent = getDefaultCommand(commandName);
      
      if (defaultContent !== null) {
        // 恢复文件到 Commands 目录
        await writeFile(filePath, defaultContent);
        rawContent = defaultContent;
        console.log(`[CommandsLoader] Restored ${commandName}.md from code defaults`);
      }
    }

    if (rawContent !== null) {
      // 解析 frontmatter，只返回 body 部分
      const { body } = parseFrontmatter(rawContent);
      
      // 更新缓存
      commandCache.set(commandName, { content: body, loadedAt: Date.now() });
      return body;
    }

    return null;
  } catch (e) {
    console.error(`[CommandsLoader] Failed to load command ${commandName}:`, e);
    return null;
  }
}

/**
 * 获取命令的描述信息（从 frontmatter）
 * @param commandName 命令名称
 * @returns 描述信息，如果不存在返回命令名称
 */
export async function getCommandDescription(commandName: string): Promise<string> {
  const filePath = buildCommandPath(commandName);
  
  try {
    const rawContent = await readFile(filePath);
    if (!rawContent) return commandName;
    
    const { description } = parseFrontmatter(rawContent);
    return description || commandName;
  } catch {
    return commandName;
  }
}

/**
 * 列出所有可用的命令
 * @returns 命令名称数组（不含 .md 后缀）
 */
export async function listAvailableCommands(): Promise<string[]> {
  try {
    const files = await listFiles();
    const commandPrefix = `${COMMANDS_DIR}/`;
    
    return files
      .filter(f => {
        const normalized = f.replace(/\\/g, "/");
        return normalized.startsWith(commandPrefix) && 
               normalized.endsWith(".md") && 
               !normalized.includes("/_");
      })
      .map(f => {
        const normalized = f.replace(/\\/g, "/");
        const fileName = normalized.slice(commandPrefix.length);
        return fileName.replace(".md", "");
      });
  } catch (e) {
    console.error("[CommandsLoader] Failed to list commands:", e);
    return [];
  }
}

/**
 * 获取所有命令的信息（名称 + 描述）
 */
export async function getAllCommandsInfo(): Promise<Array<{ name: string; description: string }>> {
  const commands = await listAvailableCommands();
  const result: Array<{ name: string; description: string }> = [];
  
  for (const name of commands) {
    const description = await getCommandDescription(name);
    result.push({ name, description });
  }
  
  return result;
}

/**
 * 初始化命令目录
 * 确保所有默认文件都已复制到用户目录
 */
export async function initCommands(): Promise<void> {
  try {
    // 从代码中的默认模板初始化
    const defaultCommandNames = getDefaultCommandNames();
    
    for (const commandName of defaultCommandNames) {
      const filePath = buildCommandPath(commandName);
      const exists = await fileExists(filePath);
      
      if (!exists) {
        const defaultContent = getDefaultCommand(commandName);
        if (defaultContent) {
          await writeFile(filePath, defaultContent);
          console.log(`[CommandsLoader] Initialized ${commandName}.md`);
        }
      }
    }
  } catch (e) {
    console.error("[CommandsLoader] Failed to init commands:", e);
  }
}
