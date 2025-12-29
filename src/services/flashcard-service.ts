/**
 * Flashcard Service
 * 
 * 处理闪卡的生成、解析和保存到日记
 * 支持 Orca 原生 #Card 格式，包括选择题
 */

import type { Flashcard } from "../components/FlashcardReview";
import { getTodayJournal } from "./search-service";

/**
 * 解析 AI 返回的闪卡格式
 * 
 * 支持的格式：
 * ```flashcard
 * Q: 问题内容
 * A: 答案内容
 * T: 标签1, 标签2
 * ---
 * Q: 选择题问题
 * TYPE: choice
 * O: 选项A
 * O: 选项B
 * O: 选项C (correct)
 * O: 选项D
 * ```
 */
export function parseFlashcards(content: string): Flashcard[] {
  const cards: Flashcard[] = [];
  
  // 提取 flashcard 代码块
  const flashcardBlockRegex = /```flashcard\s*([\s\S]*?)```/g;
  let match;
  
  while ((match = flashcardBlockRegex.exec(content)) !== null) {
    const blockContent = match[1].trim();
    // 更宽松的分隔符匹配：支持 --- 前后可能没有空行的情况
    const cardBlocks = blockContent.split(/\n-{3,}\s*\n|\n-{3,}$|^-{3,}\n/);
    
    for (const block of cardBlocks) {
      const card = parseCardBlock(block.trim());
      if (card) {
        cards.push(card);
      }
    }
  }
  
  // 如果没有找到代码块格式，尝试解析整个内容
  if (cards.length === 0) {
    // 检查是否有 Q: 开头的内容
    if (/^Q[：:]/im.test(content)) {
      const cardBlocks = content.split(/\n-{3,}\s*\n|\n-{3,}$|^-{3,}\n/);
      for (const block of cardBlocks) {
        const card = parseCardBlock(block.trim());
        if (card) {
          cards.push(card);
        }
      }
    }
  }
  
  console.log("[FlashcardService] Parsed cards:", cards.length, cards);
  
  return cards;
}

/**
 * 解析单个卡片块
 */
function parseCardBlock(block: string): Flashcard | null {
  if (!block) return null;
  
  const lines = block.split("\n");
  let front = "";
  let back = "";
  let tags: string[] = [];
  let cardType: "basic" | "choice" = "basic";
  let options: { text: string; isCorrect: boolean }[] = [];
  let ordered = false;
  let currentField: "Q" | "A" | "T" | "O" | "TYPE" | null = null;
  let currentContent: string[] = [];
  
  const flushField = () => {
    const content = currentContent.join("\n").trim();
    if (currentField === "Q") {
      front = content;
    } else if (currentField === "A") {
      back = content;
    } else if (currentField === "T") {
      tags = content.split(/[,，]/).map(t => t.trim()).filter(t => t);
    } else if (currentField === "TYPE") {
      if (content.toLowerCase().includes("choice")) {
        cardType = "choice";
      }
      if (content.toLowerCase().includes("ordered")) {
        ordered = true;
      }
    }
    currentContent = [];
  };
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // 检测字段标记
    if (/^[QqＱ][：:]\s*/i.test(trimmed)) {
      flushField();
      currentField = "Q";
      currentContent.push(trimmed.replace(/^[QqＱ][：:]\s*/i, ""));
    } else if (/^[AaＡ][：:]\s*/i.test(trimmed)) {
      flushField();
      currentField = "A";
      currentContent.push(trimmed.replace(/^[AaＡ][：:]\s*/i, ""));
    } else if (/^[TtＴ][：:]\s*/i.test(trimmed)) {
      flushField();
      currentField = "T";
      currentContent.push(trimmed.replace(/^[TtＴ][：:]\s*/i, ""));
    } else if (/^TYPE[：:]\s*/i.test(trimmed)) {
      flushField();
      currentField = "TYPE";
      currentContent.push(trimmed.replace(/^TYPE[：:]\s*/i, ""));
    } else if (/^[OoＯ][：:]\s*/i.test(trimmed)) {
      flushField();
      currentField = "O";
      // 解析选项，检查是否标记为正确答案
      let optionText = trimmed.replace(/^[OoＯ][：:]\s*/i, "");
      const isCorrect = /\(correct\)|\(正确\)|✓|√/i.test(optionText);
      optionText = optionText.replace(/\s*\(correct\)|\s*\(正确\)|✓|√/gi, "").trim();
      options.push({ text: optionText, isCorrect });
    } else if (currentField && currentField !== "O") {
      currentContent.push(line);
    }
  }
  
  flushField();
  
  // 如果有选项，自动设为选择题
  if (options.length > 0) {
    cardType = "choice";
  }
  
  // 验证必要字段
  if (!front) {
    return null;
  }
  
  // 选择题必须有选项
  if (cardType === "choice" && options.length === 0) {
    return null;
  }
  
  // 普通卡片必须有答案
  if (cardType === "basic" && !back) {
    return null;
  }
  
  return {
    id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    front,
    back: cardType === "choice" ? "" : back,
    tags: tags.length > 0 ? tags : undefined,
    cardType,
    options: cardType === "choice" ? options : undefined,
    ordered,
  };
}

/**
 * 将单张闪卡保存到今日日记（使用 Markdown 无序列表格式）
 */
export async function saveCardToJournal(card: Flashcard): Promise<{ success: boolean; message: string }> {
  try {
    // 获取今日日记
    const todayJournal = await getTodayJournal(false);
    
    if (!todayJournal || !todayJournal.id) {
      return { success: false, message: "无法获取今日日记" };
    }
    
    console.log("[FlashcardService] Today journal:", todayJournal.id);
    
    // 获取日记块对象
    let journalBlock = orca.state.blocks[todayJournal.id];
    if (!journalBlock) {
      // 如果 state 中没有，尝试从后端获取
      journalBlock = await orca.invokeBackend("get-block", todayJournal.id);
      if (!journalBlock) {
        return { success: false, message: "无法获取日记块对象" };
      }
    }
    
    console.log("[FlashcardService] Journal block:", journalBlock);
    
    // 构建卡片内容（Markdown 无序列表格式）
    // 所有 AI 生成的卡片都添加 #Card 和 #AiCard 标签
    let cardContent = "";
    
    if (card.cardType === "choice" && card.options) {
      // 选择题格式
      cardContent = `- ${card.front} #Card #AiCard #choice`;
      // 添加选项作为子项
      for (const opt of card.options) {
        if (opt.isCorrect) {
          cardContent += `\n  - ${opt.text} #correct`;
        } else {
          cardContent += `\n  - ${opt.text}`;
        }
      }
    } else {
      // 普通卡片格式
      cardContent = `- ${card.front} #Card #AiCard\n  - ${card.back}`;
    }
    
    // 添加用户自定义标签
    if (card.tags && card.tags.length > 0) {
      const customTags = card.tags
        .filter(t => !["Card", "choice", "ordered", "correct", "AiCard"].includes(t))
        .map(t => `#${t}`)
        .join(" ");
      if (customTags) {
        // 在第一行末尾添加标签
        const lines = cardContent.split("\n");
        lines[0] += ` ${customTags}`;
        cardContent = lines.join("\n");
      }
    }
    
    console.log("[FlashcardService] Card content to save:", cardContent);
    
    // 检查 orca.commands 是否可用
    if (!orca.commands || !orca.commands.invokeEditorCommand) {
      return { success: false, message: "Orca 命令接口不可用" };
    }
    
    // 先导航到日记页面（编辑器命令需要目标页面在编辑器中打开）
    orca.nav.openInLastPanel("block", { blockId: todayJournal.id });
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 重新获取 journalBlock（导航后 state 可能已更新）
    journalBlock = orca.state.blocks[todayJournal.id];
    if (!journalBlock) {
      journalBlock = await orca.invokeBackend("get-block", todayJournal.id);
    }
    
    if (!journalBlock) {
      return { success: false, message: "导航后无法获取日记块" };
    }
    
    // 使用 batchInsertText 在日记下创建块（支持 Markdown 和标签解析）
    const result = await orca.commands.invokeEditorCommand(
      "core.editor.batchInsertText",
      null,           // cursor
      journalBlock,   // refBlock
      "lastChild",    // position
      cardContent,    // text content
      false,          // skipMarkdown - 解析 Markdown
      false           // skipTags - 解析标签
    );
    
    console.log("[FlashcardService] batchInsertText result:", result);
    
    return { success: true, message: "已保存" };
  } catch (error: any) {
    console.error("[FlashcardService] Error saving card:", error);
    return { 
      success: false, 
      message: `保存失败: ${error.message || "未知错误"}` 
    };
  }
}

/**
 * 将闪卡保存到今日日记（批量，使用 Markdown 无序列表格式）
 * @deprecated 使用 saveCardToJournal 逐张保存
 */
export async function saveCardsToJournal(cards: Flashcard[]): Promise<{ success: boolean; message: string }> {
  if (cards.length === 0) {
    return { success: true, message: "没有需要保存的卡片" };
  }
  
  let savedCount = 0;
  for (const card of cards) {
    const result = await saveCardToJournal(card);
    if (result.success) {
      savedCount++;
    }
  }
  
  return { 
    success: savedCount > 0, 
    message: `已将 ${savedCount} 张闪卡保存到今日日记` 
  };
}

/**
 * 生成闪卡的系统提示词
 */
export function getFlashcardSystemPrompt(): string {
  return `【闪卡生成】

## 原则
- 能短则短，必要时可长
- 简单概念：答案≤8字（如 1+1=2）
- 需解释的：答案≤20字
- 复杂内容拆成多张卡

## 格式

\`\`\`flashcard
Q: 问题
A: 答案
---
Q: 选择题
TYPE: choice
O: A选项 (correct)
O: B选项
O: C选项
\`\`\`

## 示例

✅ Q: useState 返回？
   A: [值, setter]

✅ Q: useEffect 空数组？
   A: 仅挂载时执行一次

✅ Q: 间隔重复的核心？
   A: 在遗忘前复习，强化记忆

❌ A: useEffect 是 React 提供的用于处理副作用的 Hook，当依赖数组为空时...（太啰嗦）

## 要求
- 5-8 张卡
- 优先极简，必要时补充
- 答案是结论，不是解释过程
- 选项简短有区分度

从对话提取核心点。`;
}
