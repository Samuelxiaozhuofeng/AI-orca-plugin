/**
 * CitationList Component
 * 显示AI回复中的引用来源，类似ChatGPT的引用功能
 */

import { withTooltip } from "../utils/orca-tooltip";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useMemo: <T>(factory: () => T, deps: any[]) => T;
  Fragment: typeof window.React.Fragment;
};
const { createElement, useState, useCallback } = React;

export interface Citation {
  id: string;
  title: string;
  url: string;
  snippet?: string;
  publishedDate?: string;
  domain?: string;
  type: "web" | "image" | "document" | "note";
}

interface CitationListProps {
  citations: Citation[];
  compact?: boolean; // 紧凑模式，只显示数字标记
  defaultCollapsed?: boolean; // 默认是否折叠
}

export default function CitationList({ citations, compact = false, defaultCollapsed = true }: CitationListProps) {
  const [expandedCitations, setExpandedCitations] = useState<Set<string>>(new Set());
  const [isListCollapsed, setIsListCollapsed] = useState(defaultCollapsed);

  const toggleExpanded = useCallback((citationId: string) => {
    setExpandedCitations(prev => {
      const next = new Set(prev);
      if (next.has(citationId)) {
        next.delete(citationId);
      } else {
        next.add(citationId);
      }
      return next;
    });
  }, []);

  const handleCitationClick = useCallback((citation: Citation) => {
    if (citation.url) {
      window.open(citation.url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  if (citations.length === 0) {
    return null;
  }

  // 紧凑模式：只显示数字标记
  if (compact) {
    return createElement(
      "div",
      {
        style: {
          display: "inline-flex",
          gap: "4px",
          marginLeft: "4px",
          alignItems: "center",
        },
      },
      ...citations.map((citation, index) => {
        const number = index + 1;
        return withTooltip(
          `${citation.title} - ${citation.domain || citation.url}`,
          createElement(
            "button",
            {
              key: citation.id,
              style: {
                background: "var(--orca-color-bg-3)",
                color: "var(--orca-color-text-1)",
                border: "1px solid var(--orca-color-border)",
                borderRadius: "50%",
                width: "18px",
                height: "18px",
                fontSize: "10px",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s",
              },
              onClick: () => handleCitationClick(citation),
              onMouseEnter: (e: any) => {
                e.currentTarget.style.transform = "scale(1.1)";
                e.currentTarget.style.background = "var(--orca-color-bg-2)";
              },
              onMouseLeave: (e: any) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.background = "var(--orca-color-primary)";
              },
            },
            String(number)
          )
        );
      })
    );
  }

  // 完整模式：显示引用列表
  return createElement(
    "div",
    {
      style: {
        marginTop: "16px",
        paddingTop: "12px",
        borderTop: "1px solid var(--orca-color-border)",
      },
    },
    // 引用列表头部（可点击折叠/展开）
    createElement(
      "div",
      {
        style: {
          fontSize: "12px",
          fontWeight: 600,
          color: "var(--orca-color-text-2)",
          marginBottom: isListCollapsed ? "0" : "8px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          cursor: "pointer",
          padding: "4px 0",
          borderRadius: "4px",
          transition: "background 0.2s",
        },
        onClick: () => setIsListCollapsed(!isListCollapsed),
        onMouseEnter: (e: any) => {
          e.currentTarget.style.background = "var(--orca-color-bg-3)";
        },
        onMouseLeave: (e: any) => {
          e.currentTarget.style.background = "transparent";
        },
      },
      createElement("i", {
        className: "ti ti-link",
        style: { fontSize: "14px" },
      }),
      `参考来源 (${citations.length})`,
      createElement("i", {
        className: isListCollapsed ? "ti ti-chevron-down" : "ti ti-chevron-up",
        style: { 
          fontSize: "12px", 
          marginLeft: "auto",
          transition: "transform 0.2s",
        },
      })
    ),
    // 引用列表内容（可折叠）
    !isListCollapsed && createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          animation: "fadeIn 0.3s ease-out",
        },
      },
      ...citations.map((citation, index) => {
        const number = index + 1;
        const isExpanded = expandedCitations.has(citation.id);
        const hasSnippet = citation.snippet && citation.snippet.length > 0;
        
        return createElement(
          "div",
          {
            key: citation.id,
            style: {
              background: "var(--orca-color-bg-2)",
              border: "1px solid var(--orca-color-border)",
              borderRadius: "6px",
              overflow: "hidden",
              transition: "border-color 0.2s",
            },
            onMouseEnter: (e: any) => {
              e.currentTarget.style.borderColor = "var(--orca-color-primary)";
            },
            onMouseLeave: (e: any) => {
              e.currentTarget.style.borderColor = "var(--orca-color-border)";
            },
          },
          // 引用头部
          createElement(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                cursor: "pointer",
              },
              onClick: () => handleCitationClick(citation),
            },
            // 数字标记
            createElement(
              "div",
              {
                style: {
                  background: "var(--orca-color-bg-3)",
                  border: "1px solid var(--orca-color-border)",
                  color: "var(--orca-color-text-1)",
                  borderRadius: "50%",
                  width: "20px",
                  height: "20px",
                  fontSize: "11px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                },
              },
              String(number)
            ),
            // 类型图标
            createElement("i", {
              className: citation.type === "web" ? "ti ti-world" :
                         citation.type === "image" ? "ti ti-photo" :
                         citation.type === "document" ? "ti ti-file" :
                         "ti ti-note",
              style: {
                fontSize: "14px",
                color: "var(--orca-color-text-3)",
                flexShrink: 0,
              },
            }),
            // 标题和域名
            createElement(
              "div",
              {
                style: {
                  flex: 1,
                  minWidth: 0,
                },
              },
              createElement(
                "div",
                {
                  style: {
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "var(--orca-color-text-1)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    marginBottom: "2px",
                  },
                },
                citation.title
              ),
              createElement(
                "div",
                {
                  style: {
                    fontSize: "11px",
                    color: "var(--orca-color-text-3)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  },
                },
                citation.domain && createElement("span", null, citation.domain),
                citation.publishedDate && createElement("span", null, citation.publishedDate)
              )
            ),
            // 展开/折叠按钮（仅当有摘要时显示）
            hasSnippet && withTooltip(
              isExpanded ? "收起摘要" : "展开摘要",
              createElement(
                "button",
                {
                  style: {
                    background: "none",
                    border: "none",
                    color: "var(--orca-color-text-3)",
                    cursor: "pointer",
                    padding: "4px",
                    borderRadius: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.2s",
                  },
                  onClick: (e: any) => {
                    e.stopPropagation();
                    toggleExpanded(citation.id);
                  },
                  onMouseEnter: (e: any) => {
                    e.currentTarget.style.background = "var(--orca-color-bg-3)";
                    e.currentTarget.style.color = "var(--orca-color-text-2)";
                  },
                  onMouseLeave: (e: any) => {
                    e.currentTarget.style.background = "none";
                    e.currentTarget.style.color = "var(--orca-color-text-3)";
                  },
                },
                createElement("i", {
                  className: isExpanded ? "ti ti-chevron-up" : "ti ti-chevron-down",
                  style: { fontSize: "14px" },
                })
              )
            ),
            // 外部链接图标
            createElement("i", {
              className: "ti ti-external-link",
              style: {
                fontSize: "12px",
                color: "var(--orca-color-text-3)",
                flexShrink: 0,
              },
            })
          ),
          // 摘要内容（可展开）
          hasSnippet && isExpanded && createElement(
            "div",
            {
              style: {
                padding: "0 12px 12px 12px",
                borderTop: "1px solid var(--orca-color-border)",
                background: "var(--orca-color-bg-1)",
              },
            },
            createElement(
              "div",
              {
                style: {
                  fontSize: "12px",
                  color: "var(--orca-color-text-2)",
                  lineHeight: 1.5,
                  padding: "8px 0",
                  fontStyle: "italic",
                },
              },
              `"${citation.snippet}"`
            )
          )
        );
      })
    )
  );
}
