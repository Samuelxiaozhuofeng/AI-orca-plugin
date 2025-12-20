export interface MarkdownNode {
    type: 'text' | 'bold' | 'italic' | 'code' | 'heading' | 'list' | 'quote' | 'codeblock' | 'link';
    content: string;
    level?: number;  // For headings
    language?: string;  // For code blocks
    children?: MarkdownNode[];
}

/**
 * Simplified Markdown Parser (Line-based)
 */
export function parseMarkdown(text: string): MarkdownNode[] {
    if (!text) return [];
    
    const lines = text.split('\n');
    const nodes: MarkdownNode[] = [];
    let inCodeBlock = false;
    let codeBlockLines: string[] = [];
    let codeBlockLang = '';

    for (const line of lines) {
        // Code block detection
        if (line.startsWith('```')) {
            if (inCodeBlock) {
                // End code block
                nodes.push({
                    type: 'codeblock',
                    content: codeBlockLines.join('\n'),
                    language: codeBlockLang,
                });
                inCodeBlock = false;
                codeBlockLines = [];
                codeBlockLang = '';
            } else {
                // Start code block
                inCodeBlock = true;
                codeBlockLang = line.slice(3).trim();
            }
            continue;
        }

        if (inCodeBlock) {
            codeBlockLines.push(line);
            continue;
        }

        // Heading detection
        const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
        if (headingMatch) {
            nodes.push({
                type: 'heading',
                level: headingMatch[1].length,
                content: headingMatch[2],
            });
            continue;
        }

        // Blockquote detection
        if (line.startsWith('> ')) {
            nodes.push({
                type: 'quote',
                content: line.slice(2),
            });
            continue;
        }

        // List detection
        if (line.match(/^[\-\*]\s+/) || line.match(/^\d+\.\s+/)) {
            nodes.push({
                type: 'list',
                content: line,
            });
            continue;
        }

        // Regular paragraph (inline element parsing)
        // If the line is empty, we might want to skip it or add a spacer, 
        // but typically in MD empty lines separate blocks. 
        // For now, we'll treat non-empty lines as text paragraphs.
        if (line.trim() === '') {
             // Optional: insert a spacer node if strict layout is needed, 
             // but usually margins handle this.
             continue;
        }

        nodes.push({
            type: 'text',
            content: line,
            children: parseInlineMarkdown(line),
        });
    }

    return nodes;
}

/**
 * Parse inline elements (bold, italic, code, link)
 */
function parseInlineMarkdown(text: string): MarkdownNode[] {
    const nodes: MarkdownNode[] = [];
    // Regex for bold (**...**), italic (*...*), code (`...`), link ([...](...))
    const regex = /(\$\*\*[^\*]+\$\*\*)|(\*[^\*]+\*)|(`[^`]+`)|(\[([^\]]+)\]\(([^)]+)\))/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        // Add preceding plain text
        if (match.index > lastIndex) {
            nodes.push({
                type: 'text',
                content: text.slice(lastIndex, match.index),
            });
        }

        // Handle matched elements
        if (match[1]) {
            // **Bold**
            nodes.push({
                type: 'bold',
                content: match[1].slice(2, -2),
            });
        } else if (match[2]) {
            // *Italic*
            nodes.push({
                type: 'italic',
                content: match[2].slice(1, -1),
            });
        } else if (match[3]) {
            // `Code`
            nodes.push({
                type: 'code',
                content: match[3].slice(1, -1),
            });
        } else if (match[4]) {
            // [Link](url)
            nodes.push({
                type: 'link',
                content: match[5],
                // url: match[6]  // Not implemented for now
            });
        }

        lastIndex = regex.lastIndex;
    }

    // Add remaining plain text
    if (lastIndex < text.length) {
        nodes.push({
            type: 'text',
            content: text.slice(lastIndex),
        });
    }

    return nodes;
}
