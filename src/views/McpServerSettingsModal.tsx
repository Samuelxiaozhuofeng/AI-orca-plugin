/**
 * MCP Server Settings Modal - 管理 MCP 服务器和工具
 */
import {
  mcpStore,
  addMcpServer,
  removeMcpServer,
  updateMcpServer,
  toggleMcpTool,
} from "../store/mcp-store";
import {
  connectToServer,
  disconnectFromServer,
  getToolsForServer,
} from "../services/external/mcp-server-manager";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
};
const { createElement, useState, useEffect } = React;
const { useSnapshot } = (window as any).Valtio as {
  useSnapshot: <T extends object>(obj: T) => T;
};
const { Button } = orca.components;

interface Props { isOpen: boolean; onClose: () => void; }

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function parseHeadersJson(text: string): Record<string, string> | null {
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, any>)) {
      const headerName = key.trim();
      const headerValue = typeof value === "string" ? value.trim() : String(value ?? "").trim();
      if (headerName && headerValue) headers[headerName] = headerValue;
    }
    return headers;
  } catch {
    return null;
  }
}

function formatHeadersJson(headers: Record<string, string> | undefined): string {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (key && value) normalized[key] = value;
  }
  return JSON.stringify(normalized, null, 2);
}

// ─── 样式 ──────────────────────────────────────────────────────────────────
const overlay: React.CSSProperties = {
  position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
  background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center",
  justifyContent: "center", zIndex: 1000,
};
const modal: React.CSSProperties = {
  background: "var(--orca-color-bg-1)", borderRadius: 12, padding: 24,
  width: 600, maxWidth: "90vw", maxHeight: "85vh", overflow: "auto",
};
const titleStyle: React.CSSProperties = {
  fontSize: 18, fontWeight: 600, marginBottom: 16,
  color: "var(--orca-color-text-1)", display: "flex", alignItems: "center", gap: 8,
};
const section: React.CSSProperties = {
  marginBottom: 8, padding: 12, background: "var(--orca-color-bg-2)", borderRadius: 8,
};
const row: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
};
const label: React.CSSProperties = { fontSize: 14, color: "var(--orca-color-text-1)" };
const desc: React.CSSProperties = { fontSize: 12, color: "var(--orca-color-text-3)" };
const input: React.CSSProperties = {
  padding: "6px 10px", borderRadius: 6,
  border: "1px solid var(--orca-color-border)",
  background: "var(--orca-color-bg-1)", color: "var(--orca-color-text-1)",
  fontSize: 13, width: "100%", boxSizing: "border-box", marginBottom: 8,
};
const iconBtn: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer", padding: 4,
  color: "var(--orca-color-text-2)", fontSize: 16, display: "inline-flex", alignItems: "center",
};
const statusDot: React.CSSProperties = {
  width: 8, height: 8, borderRadius: "50%", display: "inline-block", marginRight: 6, flexShrink: 0,
};

export default function McpServerSettingsModal({ isOpen, onClose }: Props) {
  const snap = useSnapshot(mcpStore);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [newServer, setNewServer] = useState<{
    name: string;
    url: string;
    authHeader: string;
    protocolVersion: string;
    timeoutMs: number;
  } | null>(null);
  const [headerDrafts, setHeaderDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) {
      setExpandedServer(null);
      setNewServer(null);
      setHeaderDrafts({});
    }
  }, [isOpen]);

  const handleConnect = async (serverId: string) => {
    setConnectingId(serverId);
    try {
      await connectToServer(serverId);
    } catch (e: any) {
      // 错误已在 store 中记录
    } finally {
      setConnectingId(null);
    }
  };

  const handleDisconnect = async (serverId: string) => {
    try {
      await disconnectFromServer(serverId);
    } catch (e: any) {
      orca.notify("error", e?.message || "断开失败");
    }
  };

  const handleAddServer = () => {
    const name = newServer?.name?.trim();
    const url = newServer?.url?.trim();
    if (!name || !url) {
      orca.notify("warn", "请填写服务器名称和 URL");
      return;
    }
    const headers: Record<string, string> = {};
    if (newServer?.authHeader?.trim()) {
      headers["Authorization"] = newServer.authHeader.trim();
    }
    addMcpServer({
      id: generateId(),
      name,
      type: "http",
      url,
      headers,
      protocolVersion: newServer?.protocolVersion?.trim() || "2025-06-18",
      timeoutMs: Math.max(10000, Math.floor(newServer?.timeoutMs || 120000)),
    });
    setNewServer(null);
  };

  const handleDelete = async (serverId: string) => {
    // 先断开连接，再删除配置
    try {
      await disconnectFromServer(serverId);
    } catch (e: any) {
      orca.notify("warn", `断开服务器失败: ${e?.message || "未知错误"}`);
      // 即使断开失败，仍然删除配置（用户主动操作）
    }
    removeMcpServer(serverId);
    setHeaderDrafts((prev) => {
      const next = { ...prev };
      delete next[serverId];
      return next;
    });
    if (expandedServer === serverId) setExpandedServer(null);
  };

  const updateServerHeaders = (serverId: string, headers: Record<string, string>) => {
    updateMcpServer(serverId, { headers });
    setHeaderDrafts((prev) => ({ ...prev, [serverId]: formatHeadersJson(headers) }));
  };

  if (!isOpen) return null;

  const servers = snap.servers;

  return createElement("div", { style: overlay, onClick: onClose },
    createElement("div", { style: modal, onClick: (e: any) => e.stopPropagation() },
      // ── 标题栏 ───────────────────────────────────────────────────────
      createElement("div", { style: titleStyle },
        createElement("i", { className: "ti ti-plug-connected", style: { color: "var(--orca-color-primary)" } }),
        "MCP 服务器",
        createElement("span", { style: { fontSize: 12, color: "var(--orca-color-text-3)", fontWeight: 400, marginLeft: 4 } },
          `(${servers.length} 个服务器)`
        ),
      ),

      // ── 提示 ─────────────────────────────────────────────────────────
      createElement("div", {
        style: { ...desc, marginBottom: 12, padding: "8px 12px", background: "var(--orca-color-bg-2)", borderRadius: 6 },
      }, "连接 MCP 服务器后，其提供的工具将自动出现在 AI 对话的工具列表中。可在此管理工具的启用/禁用。"),

      // ── 服务器列表 ───────────────────────────────────────────────────
      servers.length === 0 && !newServer && createElement("div", {
        style: { ...desc, padding: 24, textAlign: "center", background: "var(--orca-color-bg-2)", borderRadius: 8, marginBottom: 12 },
      }, "还没有添加 MCP 服务器，点击下方按钮添加"),

      ...servers.map((server) => {
        const status = snap.serverStatuses[server.id];
        const isConnected = status?.connected ?? false;
        const isConnecting = connectingId === server.id;
        const toolCount = status?.toolCount ?? 0;
        const error = status?.error;
        const isExpanded = expandedServer === server.id;
        const serverTools = isConnected ? getToolsForServer(server.id) : [];

        return createElement("div", {
          key: server.id,
          style: { ...section, border: isExpanded ? "1px solid var(--orca-color-primary)" : "1px solid transparent" },
        },
          // ── 服务器头部 ─────────────────────────────────────────────
          createElement("div", {
            style: { ...row, cursor: "pointer" },
            onClick: () => setExpandedServer(isExpanded ? null : server.id),
          },
            createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 } },
              createElement("span", {
                style: { ...statusDot, background: isConnected ? "var(--orca-color-success)" : error ? "var(--orca-color-danger)" : "var(--orca-color-text-3)" },
              }),
              createElement("span", { style: { ...label, fontWeight: 500 } }, server.name),
              isConnected
                ? createElement("span", {
                  style: { fontSize: 11, color: "var(--orca-color-success)", background: "rgba(0,200,100,0.1)", padding: "2px 6px", borderRadius: 4, flexShrink: 0 },
                }, toolCount + " 工具")
                : error && createElement("span", {
                  style: { fontSize: 11, color: "var(--orca-color-danger)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 },
                }, error.slice(0, 30)),
            ),
            createElement("div", { style: { display: "flex", gap: 4, flexShrink: 0, marginLeft: 8 } },
              isConnected
                ? createElement("button", {
                  style: { ...iconBtn, color: "var(--orca-color-warning)" },
                  onClick: (e: any) => { e.stopPropagation(); handleDisconnect(server.id); },
                  title: "断开",
                }, createElement("i", { className: "ti ti-plug-off" }))
                : createElement("button", {
                  style: { ...iconBtn, color: "var(--orca-color-primary)" },
                  onClick: (e: any) => { e.stopPropagation(); handleConnect(server.id); },
                  disabled: isConnecting,
                  title: "连接",
                }, createElement("i", { className: isConnecting ? "ti ti-loader" : "ti ti-plug" })),
              createElement("button", {
                style: iconBtn,
                onClick: (e: any) => { e.stopPropagation(); handleDelete(server.id); },
                title: "删除",
              }, createElement("i", { className: "ti ti-trash", style: { color: "var(--orca-color-danger)" } })),
              createElement("i", {
                className: isExpanded ? "ti ti-chevron-up" : "ti ti-chevron-down",
                style: { fontSize: 14, color: "var(--orca-color-text-3)" },
              }),
            ),
          ),

          // URL 小字
          createElement("div", { style: { ...desc, fontSize: 11, marginTop: 2, wordBreak: "break-all" } }, server.url),

          // 错误详情
          error && !isConnected && createElement("div", {
            style: { ...desc, fontSize: 11, color: "var(--orca-color-danger)", marginTop: 4 },
          }, "错误: " + error),

          // ── 展开区域：工具列表 + 服务器编辑 ─────────────────────────
          isExpanded && createElement("div", {
            style: { marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--orca-color-border)" },
          },
            // ── 工具列表 ───────────────────────────────────────────
            isConnected && serverTools.length > 0 && createElement("div", { style: { marginBottom: 12 } },
              createElement("div", { style: { ...label, fontWeight: 600, marginBottom: 8 } },
                "工具列表 (" + serverTools.length + ")"
              ),
              ...serverTools.map((tool) => createElement("div", {
                key: tool.name,
                style: {
                  display: "flex", alignItems: "flex-start", gap: 8,
                  padding: "6px 8px", marginBottom: 4,
                  background: "var(--orca-color-bg-1)", borderRadius: 6,
                  opacity: tool.enabled ? 1 : 0.5,
                },
              },
                createElement("input", {
                  type: "checkbox",
                  checked: tool.enabled,
                  style: { marginTop: 2, flexShrink: 0, cursor: "pointer" },
                  onChange: () => toggleMcpTool(tool.name),
                }),
                createElement("div", { style: { flex: 1, minWidth: 0 } },
                  createElement("div", { style: { fontSize: 13, color: "var(--orca-color-text-1)", fontWeight: 500 } },
                    tool.originalName
                  ),
                  createElement("div", {
                    style: {
                      ...desc,
                      fontSize: 10,
                      fontFamily: "monospace",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    },
                  }, tool.name),
                  createElement("div", { style: { ...desc, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" } },
                    tool.description.replace(/^\[.*?\]\s*/, "") // 去掉 [serverId] 前缀
                  ),
                ),
              )),
            ),
            isConnected && serverTools.length === 0 && createElement("div", {
              style: { ...desc, marginBottom: 12 },
            }, "该服务器未提供任何工具"),

            // ── 服务器配置编辑 ────────────────────────────────────
            createElement("div", { style: { ...label, fontWeight: 600, marginBottom: 8 } }, "服务器配置"),
            createElement("div", { style: { marginBottom: 8 } },
              createElement("div", { style: { fontSize: 12, color: "var(--orca-color-text-2)", marginBottom: 4 } }, "名称"),
              createElement("input", {
                style: input, value: server.name,
                onChange: (e: any) => updateMcpServer(server.id, { name: e.target.value }),
              }),
            ),
            createElement("div", { style: { marginBottom: 8 } },
              createElement("div", { style: { fontSize: 12, color: "var(--orca-color-text-2)", marginBottom: 4 } }, "URL"),
              createElement("input", {
                style: input, value: server.url,
                onChange: (e: any) => updateMcpServer(server.id, { url: e.target.value }),
              }),
            ),
            createElement("div", { style: { marginBottom: 8 } },
              createElement("div", { style: { fontSize: 12, color: "var(--orca-color-text-2)", marginBottom: 4 } }, "Authorization Header (可选)"),
              createElement("input", {
                style: input, placeholder: "Bearer your-token",
                value: server.headers?.Authorization || "",
                onChange: (e: any) => updateServerHeaders(server.id, {
                  ...server.headers,
                  Authorization: e.target.value.trim(),
                }),
              }),
            ),
            createElement("div", { style: { marginBottom: 8 } },
              createElement("div", { style: { fontSize: 12, color: "var(--orca-color-text-2)", marginBottom: 4 } }, "Headers JSON"),
              createElement("textarea", {
                style: {
                  ...input,
                  minHeight: 78,
                  fontFamily: "monospace",
                  resize: "vertical",
                  borderColor: headerDrafts[server.id] && !parseHeadersJson(headerDrafts[server.id])
                    ? "var(--orca-color-danger)"
                    : "var(--orca-color-border)",
                },
                value: headerDrafts[server.id] ?? formatHeadersJson(server.headers),
                onChange: (e: any) => {
                  const text = e.target.value;
                  setHeaderDrafts((prev) => ({ ...prev, [server.id]: text }));
                  const headers = parseHeadersJson(text);
                  if (headers) updateMcpServer(server.id, { headers });
                },
              }),
            ),
            createElement("div", { style: { display: "flex", gap: 8, marginBottom: 8 } },
              createElement("div", { style: { flex: 1 } },
                createElement("div", { style: { fontSize: 12, color: "var(--orca-color-text-2)", marginBottom: 4 } }, "协议版本"),
                createElement("input", {
                  style: input,
                  value: server.protocolVersion || "2025-06-18",
                  placeholder: "2025-06-18",
                  onChange: (e: any) => updateMcpServer(server.id, { protocolVersion: e.target.value }),
                }),
              ),
              createElement("div", { style: { width: 150 } },
                createElement("div", { style: { fontSize: 12, color: "var(--orca-color-text-2)", marginBottom: 4 } }, "调用超时(ms)"),
                createElement("input", {
                  type: "number",
                  min: 10000,
                  max: 600000,
                  step: 1000,
                  style: input,
                  value: server.timeoutMs || 120000,
                  onChange: (e: any) => updateMcpServer(server.id, { timeoutMs: Number(e.target.value) || 120000 }),
                }),
              ),
            ),
          ),
        );
      }),

      // ── 新建服务器表单 ───────────────────────────────────────────────
      newServer ? createElement("div", {
        style: { ...section, border: "1px solid var(--orca-color-primary)", marginTop: 12 },
      },
        createElement("div", { style: { ...label, fontWeight: 600, marginBottom: 8 } }, "添加服务器"),
        createElement("input", {
          style: input, placeholder: "服务器名称",
          value: newServer.name,
          onChange: (e: any) => setNewServer({ ...newServer, name: e.target.value }),
        }),
        createElement("input", {
          style: input, placeholder: "http://localhost:18672/mcp",
          value: newServer.url,
          onChange: (e: any) => setNewServer({ ...newServer, url: e.target.value }),
        }),
        createElement("input", {
          style: input, placeholder: "Bearer orca-mcp (可选)",
          value: newServer.authHeader,
          onChange: (e: any) => setNewServer({ ...newServer, authHeader: e.target.value }),
        }),
        createElement("div", { style: { display: "flex", gap: 8 } },
          createElement("input", {
            style: input, placeholder: "2025-06-18",
            value: newServer.protocolVersion,
            onChange: (e: any) => setNewServer({ ...newServer, protocolVersion: e.target.value }),
          }),
          createElement("input", {
            type: "number",
            min: 10000,
            max: 600000,
            step: 1000,
            style: { ...input, width: 150 },
            value: newServer.timeoutMs,
            onChange: (e: any) => setNewServer({ ...newServer, timeoutMs: Number(e.target.value) || 120000 }),
          }),
        ),
        createElement("div", { style: { display: "flex", gap: 8 } },
          createElement("button", {
            style: { flex: 1, padding: "8px 16px", borderRadius: 6, background: "var(--orca-color-success)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13 },
            onClick: handleAddServer,
          }, "添加"),
          createElement("button", {
            style: { flex: 1, padding: "8px 16px", borderRadius: 6, background: "var(--orca-color-text-3)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13 },
            onClick: () => setNewServer(null),
          }, "取消"),
        ),
      ) : createElement("button", {
        style: { marginTop: 12, padding: "8px 16px", borderRadius: 6, background: "var(--orca-color-primary)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, width: "100%" },
        onClick: () => setNewServer({ name: "", url: "", authHeader: "", protocolVersion: "2025-06-18", timeoutMs: 120000 }),
      }, "+ 添加 MCP 服务器"),

      // ── 底部 ────────────────────────────────────────────────────────
      createElement("div", { style: { display: "flex", justifyContent: "flex-end", marginTop: 16 } },
        createElement(Button, { variant: "outline", onClick: onClose }, "关闭"),
      ),
    ),
  );
}
