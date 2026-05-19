// Test DSML parsing with session content
const DSML = "(?:｜DSML｜)?";

const content = `正常文本
<invoke name="mcp__orca-note__insert_markdown">
<parameter name="repoId" string="true">iwy5nfalj9l1y</parameter>
<parameter name="refBlockId" string="false">27860</parameter>
<parameter name="position" string="true">lastChild</parameter>
<parameter name="text" string="true">- [x] test
- [ ] test2</parameter>
</invoke>`;

// Test hasDsmlToolCalls
const hasDsml = /<invoke[\s>]/.test(content);
console.log("hasDsml:", hasDsml);

// Build and test invoke regex EXACTLY as in chat-stream-handler.ts
const invokeRegex = new RegExp(
  `<${DSML}invoke\\s+name="([^"]+)"[^>]*>([\\s\\S]*?)<\\/${DSML}invoke>`,
  "g"
);
console.log("invokeRegex source:", invokeRegex.source);

let match;
let count = 0;
while ((match = invokeRegex.exec(content)) !== null) {
  count++;
  console.log("Match", count, "toolName:", match[1]);
  const invokeContent = match[2];
  console.log("invokeContent length:", invokeContent.length);

  // Parse parameters EXACTLY as in chat-stream-handler.ts
  const paramRegex = new RegExp(
    `<${DSML}parameter\\s+name="([^"]+)"[^>]*>([\\s\\S]*?)<\\/${DSML}parameter>`,
    "g"
  );
  let paramMatch;
  while ((paramMatch = paramRegex.exec(invokeContent)) !== null) {
    const paramName = paramMatch[1];
    let paramValue = paramMatch[2].trim();
    try {
      paramValue = JSON.parse(paramValue);
    } catch {
      // keep string
    }
    console.log("  param:", paramName, "=", JSON.stringify(paramValue));
  }
}
console.log("Total invoke matches:", count);
