# 模块：搜索服务（Search Service）

## 目标与范围

提供与 Orca 后端交互的搜索功能，支持按标签、文本内容和属性过滤查询笔记。

## 关联文件

- `src/services/search-service.ts`：核心搜索服务
- `src/utils/text-utils.ts`：文本工具（`safeText`, `extractTitle`, `extractContent`）
- `src/utils/block-utils.ts`：Block 工具（结果解包、树遍历、批量获取）
- `src/utils/property-utils.ts`：属性工具（属性提取）
- `src/utils/query-builder.ts`：查询描述构建器
- `src/utils/query-types.ts`：查询类型定义

## 数据结构

### SearchResult

```typescript
interface SearchResult {
  id: number; // Block ID
  title: string; // 标题（首行或前50字）
  content: string; // 内容预览（前200字）
  fullContent?: string; // 完整内容（树形展开）
  created?: Date;
  modified?: Date;
  tags?: string[];
  propertyValues?: Record<string, any>;
}
```

## 核心函数

| 函数                                         | 说明                   |
| -------------------------------------------- | ---------------------- |
| `searchBlocksByTag(tagName, maxResults)`     | 按标签搜索             |
| `searchBlocksByText(searchText, maxResults)` | 按文本搜索             |
| `queryBlocksByTag(tagName, options)`         | 高级属性查询           |
| `transformToSearchResults(trees, options)`   | 内部：统一结果转换     |
| `executeQueryWithFallback(...)`              | 内部：带回退的查询执行 |

## 后端 API 映射

| 函数                 | Orca Backend API        |
| -------------------- | ----------------------- |
| `searchBlocksByTag`  | `get-blocks-with-tags`  |
| `searchBlocksByText` | `search-blocks-by-text` |
| `queryBlocksByTag`   | `query`                 |

## 限制与注意事项

- 搜索结果按 `modified` 降序排序
- `fullContent` 最多展开 200 个子 block，深度限制 10 层
- 属性值从 `refs`、`backRefs`、`properties` 多处提取
- `queryBlocksByTag` 支持三种查询格式回退策略

## 更新记录

- 2025-12-21：重构模块化，提取 `block-utils.ts` 和 `property-utils.ts`
- 2025-12-21：重构使用共享 `safeText` 函数
