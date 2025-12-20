# Query Blocks 功能更新日志

## 📅 2024-12-20 - 阶段 1: 基础查询构建器

### ✨ 新增功能

#### 1. 高级查询工具 - `queryBlocksByTag`

新增了强大的 AI 工具函数 `queryBlocksByTag`，支持通过标签和属性过滤来查询笔记块。

**功能特点**:
- ✅ 支持标签查询
- ✅ 支持属性过滤（priority, category, author 等）
- ✅ 支持多种比较操作符：`>=`, `>`, `<=`, `<`, `==`, `!=`, `is null`, `not null`, `includes`, `not includes`
- ✅ 自动类型转换（数字、布尔、日期）
- ✅ 支持查询结果排序和分页

**使用示例**:

```typescript
// 示例 1: 查找高优先级任务
queryBlocksByTag("task", {
  properties: [
    { name: "priority", op: ">=", value: 8 }
  ]
})

// 示例 2: 查找缺失分类的笔记
queryBlocksByTag("note", {
  properties: [
    { name: "category", op: "is null" }
  ]
})

// 示例 3: 查找特定作者的文章
queryBlocksByTag("article", {
  properties: [
    { name: "author", op: "==", value: "张三" }
  ]
})
```

#### 2. 核心模块

**新增文件**:

| 文件路径 | 说明 |
|---------|------|
| `src/utils/query-types.ts` | 查询类型定义 |
| `src/utils/query-converters.ts` | 类型转换器（值类型转换、操作符映射） |
| `src/utils/query-builder.ts` | 查询描述构建器 |
| `tests/` | 单元测试目录 |
| `scripts/run-tests.mjs` | 测试运行脚本 |

**修改文件**:

| 文件路径 | 说明 |
|---------|------|
| `src/services/search-service.ts` | 新增 `queryBlocksByTag()` 函数 |
| `src/views/AiChatPanel.tsx` | 集成 `queryBlocksByTag` AI 工具 |

#### 3. AI 工具集成

在 AI 聊天面板中注册了新的 AI 工具 `queryBlocksByTag`，AI 可以自动识别用户意图并调用该工具。

**AI 自动识别的查询意图**:
- "查找优先级 >= 8 的任务" → 自动调用 `queryBlocksByTag` 并设置属性过滤
- "查找没有设置分类的笔记" → 自动使用 `is null` 操作符
- "查找作者是张三的文章" → 自动进行文本值比较

### 🔧 技术实现

#### 类型转换器 (`query-converters.ts`)

**convertValue 函数**:
- PropType.Number (3) → 转换为 `number`
- PropType.Boolean (4) → 转换为 `boolean`
- PropType.DateTime (5) → 转换为 `Date`
- 其他类型 → 保持原值

**mapOperator 函数**:
```typescript
">=" → QueryGe (9)
">" → QueryGt (7)
"<=" → QueryLe (10)
"<" → QueryLt (8)
"==" → QueryEq (1)
"!=" → QueryNotEq (2)
"is null" → QueryNull (11)
"not null" → QueryNotNull (12)
"includes" → QueryIncludes (3)
"not includes" → QueryNotIncludes (4)
```

#### 查询构建器 (`query-builder.ts`)

**buildQueryDescription 函数**:
- 接收结构化的查询参数
- 生成符合 Orca `QueryDescription2` 格式的查询对象
- 支持属性过滤、排序、分页

**关键逻辑**:
```typescript
export function buildQueryDescription(input: QueryBlocksInput): QueryDescription2 {
  const properties = input.properties?.map(prop => ({
    name: prop.name,
    op: mapOperator(prop.op),
    v: convertValue(prop.value, /* 推断类型 */)
  }));

  return {
    q: {
      kind: 100, // SELF_AND
      conditions: [{
        kind: 4, // QueryTag
        name: input.tagName,
        properties
      }]
    },
    sort: input.sort,
    page: input.page,
    pageSize: input.pageSize
  };
}
```

#### AI 工具函数 (`search-service.ts`)

**queryBlocksByTag 函数**:
```typescript
export async function queryBlocksByTag(
  tagName: string,
  options: QueryBlocksByTagOptions = {},
): Promise<SearchResult[]> {
  // 1. 构建查询描述
  const description = buildQueryDescription({
    tagName,
    properties: options.properties,
    sort: options.sort,
    pageSize: options.pageSize
  });

  // 2. 调用后端 API
  const blocks = await orca.invokeBackend("query", description);

  // 3. 获取完整的块树（包含子块内容）
  const trees = await Promise.all(
    blocks.map(block => orca.invokeBackend("get-block-tree", block.id))
  );

  // 4. 格式化返回结果
  return trees.map(({ block, tree }) => ({
    id: block.id,
    title: extractTitle(block),
    content: extractContent(block),
    fullContent: flattenBlockTree(tree),
    created: block.created,
    modified: block.modified,
    tags: block.aliases
  }));
}
```

### 🧪 测试

**单元测试覆盖**:
- ✅ 类型转换器测试（数字、布尔、日期转换）
- ✅ 操作符映射测试（所有 12 种操作符）
- ✅ 查询构建器测试（标签查询、属性过滤、排序分页）

**运行测试**:
```bash
npm test
```

### 📊 性能优化

- **分页限制**: 默认最大返回 50 条结果，防止查询过大
- **并发获取**: 使用 `Promise.all` 并发获取块树，提升性能
- **错误处理**: 完善的错误捕获和日志记录
- **兼容模式**: 如果 QueryDescription2 失败，自动回退到 legacy 格式

### 🐛 已知问题与解决

#### 问题 1: 文件重复导致构建失败
**现象**: `AiChatPanel.tsx` 中存在两个 `export default function AiChatPanel`

**解决**: 删除了重复的函数定义，保留了最新版本

#### 问题 2: 类型转换错误
**现象**: AI 可能传入字符串 "8" 而不是数字 8

**解决**: 实现了严格的类型转换器 `convertValue()`，自动根据 PropType 转换值类型

### 📚 相关文档

- **实施计划**: `query_blocks_plan.md` - 详细的 4 阶段实施计划
- **使用场景**: `query-blocks-scenarios.md` - 10 个实际使用场景示例
- **API 文档**: `plugin-docs/documents/Backend-API.md` - Orca Backend API 参考

### 🎯 验收标准

所有验收标准已达成：
- ✅ AI 可以调用 `queryBlocksByTag("task", { properties: [{ name: "priority", op: ">=", value: 8 }] })`
- ✅ 返回正确的查询结果
- ✅ 属性值类型转换正确（例如 priority: 8 是 number，不是 "8"）
- ✅ 查询结果包含完整的块信息（id, title, content, fullContent, tags, properties）
- ✅ TypeScript 类型检查通过
- ✅ 构建成功（dist/index.js 73.03 kB）

### 🚀 下一步计划

**阶段 2: 复杂组合查询** (待实施)
- 支持 AND/OR/CHAIN 组合查询
- 支持嵌套查询

**阶段 3: 时间范围与文本搜索** (待实施)
- 支持日期范围查询（QueryJournal2）
- 增强文本搜索（QueryText2）

**阶段 4: 高级功能** (待实施)
- 分组统计（groupBy + stats）
- 日历视图（asCalendar）
- 表格视图（asTable）

### 👥 贡献者

- **Codex**: 实现了阶段 1 的核心功能（类型定义、转换器、查询构建器、AI 工具函数、单元测试）
- **Gemini**: 优化了 UI/UX（代码块复制、消息操作、工具调用可视化）
- **Claude**: 集成和调试（修复构建错误、添加 AI 工具集成、文档编写）

---

## 🔄 升级指南

### 如何使用新功能

1. **重新构建插件**:
   ```bash
   npm run build
   ```

2. **在 Orca Note 中重新加载插件**

3. **在 AI 聊天中测试**:
   - "查找优先级 >= 8 的任务"
   - "查找没有设置分类的笔记"
   - "查找作者是张三的文章"

### 兼容性

- ✅ 保留了原有的 `searchBlocksByTag` 和 `searchBlocksByText` 函数
- ✅ 新增的 `queryBlocksByTag` 作为增强功能，不影响现有功能
- ✅ 支持 Orca Note 的 `query` API (QueryDescription2 格式)

### 依赖变更

无新增外部依赖，所有功能基于 Orca 原生 API 实现。

---

**更新日期**: 2024-12-20
**版本**: v1.1.0 (Query Blocks Phase 1)
**状态**: ✅ 已完成并测试通过
