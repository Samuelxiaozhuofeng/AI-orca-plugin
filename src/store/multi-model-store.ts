/**
 * Multi-Model Store
 * 
 * 管理多模型并行输出的状态
 */

import { proxy } from "valtio";

export interface MultiModelState {
  /** 是否启用多模型模式 */
  enabled: boolean;
  /** 选中的模型 ID 列表 */
  selectedModels: string[];
  /** 最大同时选择的模型数 */
  maxModels: number;
}

export const multiModelStore = proxy<MultiModelState>({
  enabled: false,
  selectedModels: [],
  maxModels: 4,
});

/** 切换多模型模式 */
export function toggleMultiModelMode() {
  multiModelStore.enabled = !multiModelStore.enabled;
  if (!multiModelStore.enabled) {
    multiModelStore.selectedModels = [];
  }
}

/** 添加模型到选择列表 */
export function addModelToSelection(modelId: string) {
  if (multiModelStore.selectedModels.length >= multiModelStore.maxModels) {
    return false;
  }
  if (!multiModelStore.selectedModels.includes(modelId)) {
    multiModelStore.selectedModels.push(modelId);
  }
  return true;
}

/** 从选择列表移除模型 */
export function removeModelFromSelection(modelId: string) {
  const index = multiModelStore.selectedModels.indexOf(modelId);
  if (index > -1) {
    multiModelStore.selectedModels.splice(index, 1);
  }
}

/** 切换模型选择状态 */
export function toggleModelSelection(modelId: string) {
  if (multiModelStore.selectedModels.includes(modelId)) {
    removeModelFromSelection(modelId);
  } else {
    addModelToSelection(modelId);
  }
}

/** 清空选择 */
export function clearModelSelection() {
  multiModelStore.selectedModels = [];
}

/** 设置选中的模型列表 */
export function setSelectedModels(modelIds: string[]) {
  multiModelStore.selectedModels = modelIds.slice(0, multiModelStore.maxModels);
}
