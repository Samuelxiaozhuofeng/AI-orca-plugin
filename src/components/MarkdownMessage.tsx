import { parseMarkdown, type MarkdownNode } from '../utils/markdown-renderer';

const React = window.React as any;
const { createElement, useMemo, useState } = React;
const { Button } = orca.components;

interface Props {
    content: string;
    role: 'user' | 'assistant' | 'tool';
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
            console.error('Failed to copy:', err);
        }
    };

    return createElement(
        'div',
        {
            style: {
                marginTop: '12px',
                marginBottom: '12px',
                borderRadius: '8px',
                border: '1px solid var(--orca-color-border)',
                overflow: 'hidden',
                background: 'var(--orca-color-bg-3)',
            }
        },
        // Header
        createElement(
            'div',
            {
                style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 12px',
                    background: 'rgba(0,0,0,0.03)',
                    borderBottom: '1px solid var(--orca-color-border)',
                    fontSize: '12px',
                    color: 'var(--orca-color-text-2)',
                    userSelect: 'none',
                }
            },
            createElement('span', { style: { fontFamily: 'monospace', fontWeight: 600 } }, language || 'text'),
            createElement(
                'div',
                {
                    style: { cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' },
                    onClick: handleCopy,
                },
                createElement('i', { className: copied ? "ti ti-check" : "ti ti-copy" }),
                copied ? "Copied!" : "Copy"
            )
        ),
        // Code content
        createElement(
            'pre',
            {
                style: {
                    margin: 0,
                    padding: '12px',
                    overflowX: 'auto',
                    fontFamily: '"JetBrains Mono", Consolas, monospace',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    color: 'var(--orca-color-text-1)',
                },
            },
            content
        )
    );
}

/**
 * Render a Markdown node as a React element
 */
function renderNode(node: MarkdownNode, index: number): any {
    switch (node.type) {
        case 'heading':
            const HeadingTag = `h${node.level}` as any;
            return createElement(
                HeadingTag,
                {
                    key: index,
                    style: {
                        marginTop: node.level === 1 ? '24px' : '20px',
                        marginBottom: '12px',
                        fontWeight: 'bold',
                        fontSize: node.level === 1 ? '24px' : node.level === 2 ? '20px' : '18px',
                        lineHeight: '1.4',
                        borderLeft: `4px solid var(--orca-color-primary, #007bff)`,
                        paddingLeft: '12px',
                        background: 'linear-gradient(to right, rgba(0,123,255,0.05), transparent)',
                        borderRadius: '0 8px 8px 0',
                        color: 'var(--orca-color-text-1)',
                    },
                },
                node.content
            );

        case 'bold':
            return createElement(
                'strong',
                {
                    key: index,
                    style: {
                        fontWeight: 'bold',
                        // Half-height highlight effect
                        background: 'linear-gradient(to bottom, transparent 60%, rgba(255,235,59,0.5) 0)',
                        padding: '0 2px',
                        color: 'inherit',
                    },
                },
                node.content
            );

        case 'italic':
            return createElement('em', { key: index, style: { fontStyle: 'italic' } }, node.content);

        case 'code':
            return createElement(
                'code',
                {
                    key: index,
                    style: {
                        fontFamily: '"JetBrains Mono", Consolas, monospace',
                        background: 'var(--orca-color-bg-3)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.9em',
                        border: '1px solid var(--orca-color-border)',
                        color: 'var(--orca-color-text-1)',
                    },
                },
                node.content
            );

        case 'codeblock':
            // Code block with header and copy button
            return createElement(CodeBlock, {
                key: index,
                language: node.language,
                content: node.content
            });

        case 'quote':
            return createElement(
                'blockquote',
                {
                    key: index,
                    style: {
                        borderLeft: '4px solid var(--orca-color-border)',
                        paddingLeft: '16px',
                        marginLeft: 0,
                        marginTop: '12px',
                        marginBottom: '12px',
                        fontStyle: 'italic',
                        color: 'var(--orca-color-text-2)',
                        background: 'var(--orca-color-bg-2)',
                        padding: '12px 16px',
                        borderRadius: '8px',
                    },
                },
                node.content
            );

        case 'list':
            return createElement(
                'li',
                {
                    key: index,
                    style: {
                        marginLeft: '20px',
                        marginTop: '6px',
                        lineHeight: '1.8',
                        color: 'var(--orca-color-text-1)',
                    },
                },
                node.content.replace(/^[\-\*\d\.]\s+/, '')
            );

        case 'text':
            if (node.children && node.children.length > 0) {
                return createElement(
                    'p',
                    {
                        key: index,
                        style: {
                            marginTop: '8px',
                            marginBottom: '8px',
                            lineHeight: '1.8',
                            color: 'inherit',
                        },
                    },
                    ...node.children.map((child, i) => renderNode(child, i))
                );
            }
            return createElement(
                'p', 
                { 
                    key: index, 
                    style: { 
                        marginTop: '8px', 
                        marginBottom: '8px',
                        color: 'inherit', 
                    } 
                }, 
                node.content
            );

        case 'link':
            return createElement(
                'a',
                {
                    key: index,
                    href: '#', // TODO: Implement navigation
                    style: {
                        color: 'var(--orca-color-primary, #007bff)',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                    },
                    onClick: (e: any) => {
                        e.preventDefault();
                        // Optional: Handle link click
                    }
                },
                node.content
            );

        default:
            return null;
    }
}

export default function MarkdownMessage({ content, role }: Props) {
    const nodes = useMemo(() => parseMarkdown(content), [content]);

    const fontFamily = role === 'assistant'
        ? '"Noto Serif CJK SC", "Source Han Serif SC", Georgia, serif'
        : '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

    return createElement(
        'div',
        {
            style: {
                fontFamily,
                fontSize: '16px',
                color: role === 'user' ? '#fff' : 'var(--orca-color-text-1)',
                lineHeight: '1.6',
            },
        },
        ...nodes.map((node: MarkdownNode, index: number) => renderNode(node, index))
    );
}
