import { assert, assertDeepEqual, assertEqual, test } from "./test-harness";
import { parseMarkdown } from "../src/utils/markdown-renderer";

test("markdown: parses bold without stray asterisks", () => {
  const ast = parseMarkdown("**多巴胺（Dopamine）：**");
  assertDeepEqual(ast, [
    {
      type: "paragraph",
      children: [
        {
          type: "bold",
          children: [{ type: "text", content: "多巴胺（Dopamine）："}],
        },
      ],
    },
  ]);
});

test("markdown: parses bold inside list items", () => {
  const ast = parseMarkdown("*   **多巴胺（Dopamine）：** 让人产生愉悦感");
  assertEqual(ast.length, 1);
  assert((ast[0] as any).type === "list", "Expected a list block");

  const list: any = ast[0];
  assertEqual(list.ordered, false);
  assertEqual(list.items.length, 1);

  // ListItem is now an object with content property (not an array)
  const item: any = list.items[0];
  assertEqual(item.content[0].type, "bold");
  assertDeepEqual(item.content[0].children, [{ type: "text", content: "多巴胺（Dopamine）："}]);
});

test("markdown: parses bold inside paragraphs", () => {
  const ast = parseMarkdown("提出了著名的**“爱情三元论”**，认为完美的爱由三个成分组成：");
  assertEqual(ast.length, 1);
  assertEqual((ast[0] as any).type, "paragraph");

  const children: any[] = (ast[0] as any).children;
  assertEqual(children.length, 3);
  assertEqual(children[0].type, "text");
  assertEqual(children[1].type, "bold");
  assertEqual(children[2].type, "text");
  assertDeepEqual(children[1].children, [{ type: "text", content: "“爱情三元论”" }]);
});

test("markdown: keeps unmatched markers as text during streaming", () => {
  const ast = parseMarkdown("**多巴胺（Dopamine）：*");
  assertDeepEqual(ast, [
    {
      type: "paragraph",
      children: [{ type: "text", content: "**多巴胺（Dopamine）：*" }],
    },
  ]);
});

