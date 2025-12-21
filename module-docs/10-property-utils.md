# 模块：属性工具函数（Property Utils）

## 目标与范围

提供从 Block 对象中提取属性值的工具函数，支持从 `properties`、`refs`、`backRefs` 多处提取。

## 关联文件

- `src/utils/property-utils.ts`：核心工具模块
- `src/services/search-service.ts`：主要使用者

## 核心函数

| 函数                             | 说明                                             |
| -------------------------------- | ------------------------------------------------ |
| `findPropertyValueInList`        | 按名称从属性数组中查找值（支持大小写不敏感回退） |
| `extractPropertyValueFromBlock`  | 从 block 的多个位置提取指定属性值                |
| `buildPropertyValues`            | 批量提取多个属性值                               |
| `pickBlockForPropertyExtraction` | 选择最适合属性提取的 block 对象                  |
| `extractAllProperties`           | 提取 block 的所有属性                            |

## 属性查找顺序

1. `block.properties` - 直接属性
2. `block.refs[].data` - 引用数据（标签属性通常在此）
3. `block.backRefs[].data` - 反向引用数据

## 使用示例

```typescript
import {
  extractAllProperties,
  buildPropertyValues,
} from "../utils/property-utils";

// 提取所有属性
const allProps = extractAllProperties(block);
// { priority: 5, status: "done" }

// 提取指定属性
const specific = buildPropertyValues(block, ["priority", "due-date"]);
// { priority: 5 }
```

## 更新记录

- 2025-12-21：从 `search-service.ts` 提取创建
