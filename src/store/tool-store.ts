/**
 * Tool Store
 * MCP 工具的显示名称映射
 */

/**
 * 工具显示名称映射（MCP 工具自动注册）
 */
export const TOOL_DISPLAY_NAMES: Record<string, string> = {};

/** 注册一组 MCP 工具的显示名称 */
export function registerMcpTools(
  serverId: string,
  tools: Array<{ openaiName: string; displayName: string }>
): void {
  unregisterMcpServerTools(serverId);
  for (const tool of tools) {
    TOOL_DISPLAY_NAMES[tool.openaiName] = tool.displayName;
  }
}

/** 注销某个服务器的所有 MCP 工具显示名称 */
export function unregisterMcpServerTools(serverId: string): void {
  const prefix = `mcp__`;
  for (const name of Object.keys(TOOL_DISPLAY_NAMES)) {
    if (name.startsWith(prefix)) {
      const rest = name.slice(prefix.length);
      const sep = rest.indexOf("__");
      if (sep !== -1 && rest.slice(0, sep) === serverId) {
        delete TOOL_DISPLAY_NAMES[name];
      }
    }
  }
}
