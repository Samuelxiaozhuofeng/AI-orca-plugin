/**
 * Tool Panel Component
 * 工具管理面板，允许用户配置 AI 工具的状态
 */

const React = window.React as typeof import("react");
const { createElement, useState, useCallback } = React;

const { useSnapshot } = (window as any).Valtio as {
  useSnapshot: <T extends object>(obj: T) => T;
};

import {
  toolStore,
  getToolStatus,
  setToolStatus,
  setCategoryStatus,
  closeToolPanel,
  TOOL_CATEGORIES,
  TOOL_DISPLAY_NAMES,
  type ToolStatus,
} from "../store/tool-store";

// 状态图标和颜色
const STATUS_CONFIG: Record<ToolStatus, { icon: string; color: string; label: string }> = {
  auto: { icon: "ti-check", color: "var(--orca-color-green)", label: "自动" },
  ask: { icon: "ti-help", color: "var(--orca-color-yellow)", label: "询问" },
  disabled: { icon: "ti-x", color: "var(--orca-color-red)", label: "禁用" },
};

// 状态循环顺序
const STATUS_CYCLE: ToolStatus[] = ["auto", "ask", "disabled"];

export default function ToolPanel() {
  const snap = useSnapshot(toolStore);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["search", "write"]));

  const toggleCategory = useCallback((categoryName: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryName)) {
        next.delete(categoryName);
      } else {
        next.add(categoryName);
      }
      return next;
    });
  }, []);

  const cycleToolStatus = useCallback((toolName: string) => {
    const current = getToolStatus(toolName);
    const currentIndex = STATUS_CYCLE.indexOf(current);
    const nextIndex = (currentIndex + 1) % STATUS_CYCLE.length;
    setToolStatus(toolName, STATUS_CYCLE[nextIndex]);
  }, []);

  const cycleCategoryStatus = useCallback((categoryName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const category = TOOL_CATEGORIES.find(c => c.name === categoryName);
    if (!category) return;
    
    // 获取分类中所有工具的状态
    const statuses = category.tools.map(t => getToolStatus(t));
    const allSame = statuses.every(s => s === statuses[0]);
    
    // 如果所有工具状态相同，循环到下一个状态；否则全部设为 auto
    if (allSame) {
      const currentIndex = STATUS_CYCLE.indexOf(statuses[0]);
      const nextIndex = (currentIndex + 1) % STATUS_CYCLE.length;
      setCategoryStatus(categoryName, STATUS_CYCLE[nextIndex]);
    } else {
      setCategoryStatus(categoryName, "auto");
    }
  }, []);

  const getCategoryStatus = useCallback((categoryName: string): ToolStatus | "mixed" => {
    const category = TOOL_CATEGORIES.find(c => c.name === categoryName);
    if (!category) return "auto";
    
    const statuses = category.tools.map(t => getToolStatus(t));
    const allSame = statuses.every(s => s === statuses[0]);
    return allSame ? statuses[0] : "mixed";
  }, [snap.toolStatus]);

  if (!snap.showPanel) return null;

  return createElement(
    "div",
    {
      style: {
        position: "absolute",
        bottom: "100%",
        left: 0,
        right: 0,
        marginBottom: 8,
        background: "var(--orca-color-bg-1)",
        border: "1px solid var(--orca-color-border)",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        maxHeight: 320,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        zIndex: 100,
      },
    },
    // 标题栏
    createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--orca-color-border)",
          background: "var(--orca-color-bg-2)",
        },
      },
      createElement(
        "span",
        { style: { fontWeight: 500, fontSize: 13 } },
        "🛠️ 工具管理"
      ),
      createElement(
        "button",
        {
          onClick: closeToolPanel,
          style: {
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 4,
            color: "var(--orca-color-text-2)",
            display: "flex",
            alignItems: "center",
          },
        },
        createElement("i", { className: "ti ti-x", style: { fontSize: 16 } })
      )
    ),
    // 图例
    createElement(
      "div",
      {
        style: {
          display: "flex",
          gap: 12,
          padding: "6px 12px",
          fontSize: 11,
          color: "var(--orca-color-text-2)",
          borderBottom: "1px solid var(--orca-color-border)",
        },
      },
      ...STATUS_CYCLE.map(status =>
        createElement(
          "span",
          {
            key: status,
            style: { display: "flex", alignItems: "center", gap: 4 },
          },
          createElement("i", {
            className: `ti ${STATUS_CONFIG[status].icon}`,
            style: { color: STATUS_CONFIG[status].color, fontSize: 12 },
          }),
          STATUS_CONFIG[status].label
        )
      )
    ),
    // 工具列表
    createElement(
      "div",
      {
        style: {
          flex: 1,
          overflowY: "auto",
          padding: "4px 0",
        },
      },
      ...TOOL_CATEGORIES.map(category => {
        const isExpanded = expandedCategories.has(category.name);
        const categoryStatus = getCategoryStatus(category.name);
        
        return createElement(
          "div",
          { key: category.name },
          // 分类标题
          createElement(
            "div",
            {
              onClick: () => toggleCategory(category.name),
              style: {
                display: "flex",
                alignItems: "center",
                padding: "6px 12px",
                cursor: "pointer",
                userSelect: "none",
                background: isExpanded ? "var(--orca-color-bg-2)" : "transparent",
              },
              onMouseOver: (e: any) => {
                e.currentTarget.style.background = "var(--orca-color-bg-2)";
              },
              onMouseOut: (e: any) => {
                e.currentTarget.style.background = isExpanded ? "var(--orca-color-bg-2)" : "transparent";
              },
            },
            createElement("i", {
              className: `ti ti-chevron-${isExpanded ? "down" : "right"}`,
              style: { fontSize: 14, marginRight: 6, color: "var(--orca-color-text-2)" },
            }),
            createElement(
              "span",
              { style: { flex: 1, fontSize: 12, fontWeight: 500 } },
              category.label
            ),
            createElement(
              "span",
              { style: { fontSize: 11, color: "var(--orca-color-text-3)", marginRight: 8 } },
              `${category.tools.length} 个工具`
            ),
            // 分类状态按钮
            createElement(
              "button",
              {
                onClick: (e: React.MouseEvent) => cycleCategoryStatus(category.name, e),
                title: "点击切换分类状态",
                style: {
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px 6px",
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                },
              },
              categoryStatus === "mixed"
                ? createElement("span", { style: { fontSize: 11, color: "var(--orca-color-text-2)" } }, "混合")
                : createElement("i", {
                    className: `ti ${STATUS_CONFIG[categoryStatus].icon}`,
                    style: { color: STATUS_CONFIG[categoryStatus].color, fontSize: 14 },
                  })
            )
          ),
          // 工具列表
          isExpanded &&
            createElement(
              "div",
              { style: { paddingLeft: 24 } },
              ...category.tools.map(toolName => {
                const status = getToolStatus(toolName);
                const config = STATUS_CONFIG[status];
                const displayName = TOOL_DISPLAY_NAMES[toolName] || toolName;
                
                return createElement(
                  "div",
                  {
                    key: toolName,
                    onClick: () => cycleToolStatus(toolName),
                    style: {
                      display: "flex",
                      alignItems: "center",
                      padding: "5px 12px",
                      cursor: "pointer",
                      fontSize: 12,
                      borderRadius: 4,
                      margin: "1px 8px",
                    },
                    onMouseOver: (e: any) => {
                      e.currentTarget.style.background = "var(--orca-color-bg-2)";
                    },
                    onMouseOut: (e: any) => {
                      e.currentTarget.style.background = "transparent";
                    },
                  },
                  createElement("i", {
                    className: `ti ${config.icon}`,
                    style: { color: config.color, fontSize: 14, marginRight: 8 },
                  }),
                  createElement(
                    "span",
                    {
                      style: {
                        flex: 1,
                        color: status === "disabled" ? "var(--orca-color-text-3)" : "var(--orca-color-text-1)",
                        textDecoration: status === "disabled" ? "line-through" : "none",
                      },
                    },
                    displayName
                  ),
                  createElement(
                    "span",
                    {
                      style: {
                        fontSize: 10,
                        color: "var(--orca-color-text-3)",
                        fontFamily: "monospace",
                        marginLeft: 8,
                      },
                      title: toolName,
                    },
                    toolName
                  )
                );
              })
            )
        );
      })
    )
  );
}
