# 模块：Block 工具函数（Block Utils）

## 目标与范围

提供与 Orca 后端交互的底层工具函数，包括结果解包、错误处理、Block 树遍历等。

## 关联文件

- `src/utils/block-utils.ts`：核心工具模块
- `src/utils/text-utils.ts`：依赖的文本工具
- `src/services/search-service.ts`：主要使用者

## 数据结构

### FlattenState

```typescript
interface FlattenState {
  blocks: number; // 当前已处理 block 数
  maxBlocks: number; // 最大 block 数（默认 200）
  maxDepth: number; // 最大深度（默认 10）
  hitLimit: boolean; // 是否达到限制
}
```

## 核心函数

| 函数                      | 说明                               |
| ------------------------- | ---------------------------------- |
| `unwrapBackendResult<T>`  | 解包 `[code, data]` 格式的后端响应 |
| `unwrapBlocks`            | 从各种格式中提取 block 数组        |
| `throwIfBackendError`     | 检测后端错误码并抛出异常           |
| `treeChildren`            | 获取 block 树节点的子节点数组      |
| `flattenBlockTreeToLines` | 将 block 树展平为缩进文本行        |
| `createFlattenState`      | 创建默认的展平状态对象             |
| `fetchBlockTrees`         | 批量获取 block 树（并行请求）      |
| `sortAndLimitBlocks`      | 按修改时间排序并限制结果数量       |

## 使用示例

```typescript
import {
  unwrapBlocks,
  fetchBlockTrees,
  sortAndLimitBlocks,
} from "../utils/block-utils";

// 获取并处理 blocks
const result = await orca.invokeBackend("get-blocks-with-tags", [tagName]);
const blocks = unwrapBlocks(result);
const sorted = sortAndLimitBlocks(blocks, 50);
const trees = await fetchBlockTrees(sorted);
```

## 更新记录

- 2025-12-21：从 `search-service.ts` 提取创建
