import { parseMarkdown, type MarkdownInlineNode, type MarkdownNode, type TableAlignment } from "../utils/markdown-renderer";
import {
  codeBlockContainerStyle,
  codeBlockHeaderStyle,
  codeBlockPreStyle,
  inlineCodeStyle,
  markdownContainerStyle,
  blockQuoteStyle,
  headingStyle,
  linkStyle,
  blockLinkContainerStyle,
  blockLinkTextStyle,
  blockLinkArrowStyle,
  boldStyle,
  listStyle,
  listItemStyle,
  paragraphStyle,
} from "../styles/ai-chat-styles";

const React = window.React as any;
const { createElement, useMemo, useState } = React;
const { Button } = orca.components;

interface Props {
  content: string;
  role: "user" | "assistant" | "tool";
}

// Helper component for Code Block with Copy
function CodeBlock({ language, content }: { language?: string; content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return createElement(
    "div",
    {
      style: codeBlockContainerStyle,
    },
    // Header
    createElement(
      "div",
      {
        style: codeBlockHeaderStyle,
      },
      createElement(
        "span",
        { style: { fontFamily: "monospace", fontWeight: 600 } },
        language || "text",
      ),
      createElement(
        "div",
        {
          style: { cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" },
          onClick: handleCopy,
        },
        createElement("i", { className: copied ? "ti ti-check" : "ti ti-copy" }),
        copied ? "Copied!" : "Copy",
      ),
    ),
    // Code content
    createElement(
      "pre",
      {
        style: codeBlockPreStyle,
      },
      content,
    ),
  );
}

function renderInlineNode(node: MarkdownInlineNode, key: number): any {
  switch (node.type) {
    case "text":
      return createElement(React.Fragment, { key }, node.content);

    case "break":
      return createElement("br", { key });

    case "bold":
      return createElement(
        "strong",
        {
          key,
          style: boldStyle,
        },
        ...node.children.map((child, i) => renderInlineNode(child, i)),
      );

    case "italic":
      return createElement(
        "em",
        { key, style: { fontStyle: "italic" } },
        ...node.children.map((child, i) => renderInlineNode(child, i)),
      );

    case "code":
      return createElement(
        "code",
        {
          key,
          style: inlineCodeStyle,
        },
        node.content,
      );

    case "link":
      // Check if this is an orca-block link
      const isBlockLink = node.url.startsWith("orca-block:");
      if (isBlockLink) {
        const blockId = parseInt(node.url.replace("orca-block:", ""), 10);
        
        // Navigation handler with error handling and feedback
        const handleBlockNavigation = (e: any) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Validate block ID
          if (isNaN(blockId) || blockId <= 0) {
            console.error("[MarkdownMessage] Invalid block ID:", blockId);
            return;
          }
          
          try {
            // Open in last panel (non-current panel)
            orca.nav.openInLastPanel("block", { blockId });
          } catch (error) {
            console.error("[MarkdownMessage] Navigation failed:", error);
          }
        };
        
        return createElement(
          "span",
          {
            key,
            style: blockLinkContainerStyle,
            title: `Jump to block #${blockId}`,
            onClick: handleBlockNavigation,
            onMouseEnter: (e: any) => {
              e.currentTarget.style.background = "rgba(0, 123, 255, 0.08)";
              e.currentTarget.style.borderColor = "rgba(0, 123, 255, 0.2)";
              e.currentTarget.style.transform = "translateX(2px)";
            },
            onMouseLeave: (e: any) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "transparent";
              e.currentTarget.style.transform = "translateX(0)";
            },
          },
          // Link text
          createElement(
            "span",
            {
              style: blockLinkTextStyle,
            },
            ...node.children.map((child, i) => renderInlineNode(child, i)),
          ),
          // Jump arrow icon
          createElement(
            "span",
            {
              style: blockLinkArrowStyle,
              onMouseEnter: (e: any) => {
                e.currentTarget.style.transform = "translateX(2px)";
              },
              onMouseLeave: (e: any) => {
                e.currentTarget.style.transform = "translateX(0)";
              },
            },
            createElement("i", { className: "ti ti-arrow-right" }),
          ),
        );
      }
      // Normal external link
      return createElement(
        "a",
        {
          key,
          href: node.url,
          target: "_blank",
          rel: "noopener noreferrer",
          title: node.url,
          style: linkStyle,
          onClick: (e: any) => {
            // Allow default behavior for external links
          },
        },
        ...node.children.map((child, i) => renderInlineNode(child, i)),
      );


    default:
      return null;
  }
}

function renderBlockNode(node: MarkdownNode, key: number): any {
  switch (node.type) {
    case "heading": {
      const HeadingTag = `h${node.level}` as any;
      return createElement(
        HeadingTag,
        {
          key,
          style: headingStyle(node.level),
        },
        ...node.children.map((child, i) => renderInlineNode(child, i)),
      );
    }

    case "paragraph":
      return createElement(
        "p",
        {
          key,
          style: paragraphStyle,
        },
        ...node.children.map((child, i) => renderInlineNode(child, i)),
      );

    case "list": {
      const ListTag = (node.ordered ? "ol" : "ul") as any;
      return createElement(
        ListTag,
        {
          key,
          style: listStyle,
        },
        ...node.items.map((item, itemIndex) =>
          createElement(
            "li",
            {
              key: itemIndex,
              style: listItemStyle,
            },
            ...item.map((child, i) => renderInlineNode(child, i)),
          ),
        ),
      );
    }

    case "quote":
      return createElement(
        "blockquote",
        {
          key,
          style: blockQuoteStyle,
        },
        ...node.children.map((child, i) => renderBlockNode(child, i)),
      );

    case "codeblock":
      return createElement(CodeBlock, {
        key,
        language: node.language,
        content: node.content,
      });

    case "table": {
      const tableStyle: any = {
        width: "100%",
        borderCollapse: "collapse",
        margin: "12px 0",
        fontSize: "14px",
        overflow: "auto",
      };
      const thStyle = (align: string | null): any => ({
        padding: "8px 12px",
        borderBottom: "2px solid var(--orca-color-border, #e0e0e0)",
        background: "var(--orca-color-bg-secondary, #f5f5f5)",
        fontWeight: 600,
        textAlign: align || "left",
        whiteSpace: "nowrap",
      });
      const tdStyle = (align: string | null): any => ({
        padding: "8px 12px",
        borderBottom: "1px solid var(--orca-color-border, #e0e0e0)",
        textAlign: align || "left",
      });
      const trHoverStyle = {
        background: "var(--orca-color-bg-hover, #f9f9f9)",
      };

      return createElement(
        "div",
        { key, style: { overflowX: "auto", margin: "12px 0" } },
        createElement(
          "table",
          { style: tableStyle },
          // Header
          createElement(
            "thead",
            null,
            createElement(
              "tr",
              null,
              ...node.headers.map((headerCells, colIndex) =>
                createElement(
                  "th",
                  { key: colIndex, style: thStyle(node.alignments[colIndex]) },
                  ...headerCells.map((child, i) => renderInlineNode(child, i))
                )
              )
            )
          ),
          // Body
          createElement(
            "tbody",
            null,
            ...node.rows.map((row, rowIndex) =>
              createElement(
                "tr",
                {
                  key: rowIndex,
                  onMouseEnter: (e: any) => {
                    e.currentTarget.style.background = "var(--orca-color-bg-hover, #f9f9f9)";
                  },
                  onMouseLeave: (e: any) => {
                    e.currentTarget.style.background = "transparent";
                  },
                },
                ...row.map((cellNodes, colIndex) =>
                  createElement(
                    "td",
                    { key: colIndex, style: tdStyle(node.alignments[colIndex]) },
                    ...cellNodes.map((child, i) => renderInlineNode(child, i))
                  )
                )
              )
            )
          )
        )
      );
    }

    default:
      return null;
  }
}

export default function MarkdownMessage({ content, role }: Props) {
  const nodes = useMemo(() => parseMarkdown(content), [content]);

  return createElement(
    "div",
    {
      style: markdownContainerStyle(role),
    },
    ...nodes.map((node: MarkdownNode, index: number) => renderBlockNode(node, index)),
  );
}
