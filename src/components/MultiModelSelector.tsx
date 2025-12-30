/**
 * MultiModelSelector - 多模型选择器组件
 * 
 * 允许用户选择多个模型进行并行输出
 */

import type { AiChatSettings, AiProvider, ProviderModel, ModelCapability, MODEL_CAPABILITY_LABELS } from "../settings/ai-chat-settings";
import { multiModelStore, toggleModelSelection, clearModelSelection, toggleMultiModelMode } from "../store/multi-model-store";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useMemo: <T>(factory: () => T, deps: any[]) => T;
  useEffect: (effect: () => void | (() => void), deps?: any[]) => void;
  useRef: <T>(value: T) => { current: T };
};
const { createElement, useState, useCallback, useMemo, useEffect, useRef } = React;

const { useSnapshot } = (window as any).Valtio as {
  useSnapshot: <T extends object>(obj: T) => T;
};

interface MultiModelSelectorProps {
  settings: AiChatSettings;
  onClose?: () => void;
}

/** 模型选择项 */
function ModelCheckItem({
  model,
  provider,
  isSelected,
  onToggle,
  disabled,
}: {
  model: ProviderModel;
  provider: AiProvider;
  isSelected: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return createElement(
    "div",
    {
      onClick: disabled && !isSelected ? undefined : onToggle,
      style: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 12px",
        borderRadius: "6px",
        cursor: disabled && !isSelected ? "not-allowed" : "pointer",
        background: isSelected ? "var(--orca-color-primary-bg, rgba(0, 123, 255, 0.1))" : "transparent",
        border: isSelected ? "1px solid var(--orca-color-primary)" : "1px solid transparent",
        opacity: disabled && !isSelected ? 0.5 : 1,
        transition: "all 0.15s ease",
      },
      onMouseEnter: (e: any) => {
        if (!disabled || isSelected) {
          e.currentTarget.style.background = isSelected 
            ? "var(--orca-color-primary-bg, rgba(0, 123, 255, 0.15))" 
            : "var(--orca-color-bg-3)";
        }
      },
      onMouseLeave: (e: any) => {
        e.currentTarget.style.background = isSelected 
          ? "var(--orca-color-primary-bg, rgba(0, 123, 255, 0.1))" 
          : "transparent";
      },
    },
    // Checkbox
    createElement(
      "div",
      {
        style: {
          width: "18px",
          height: "18px",
          borderRadius: "4px",
          border: isSelected ? "none" : "2px solid var(--orca-color-border)",
          background: isSelected ? "var(--orca-color-primary)" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        },
      },
      isSelected && createElement("i", {
        className: "ti ti-check",
        style: { color: "#fff", fontSize: "12px" },
      })
    ),
    // Model info
    createElement(
      "div",
      { style: { flex: 1, minWidth: 0 } },
      createElement(
        "div",
        {
          style: {
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--orca-color-text-1)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          },
        },
        model.label || model.id
      ),
      createElement(
        "div",
        {
          style: {
            fontSize: "11px",
            color: "var(--orca-color-text-3)",
            marginTop: "2px",
          },
        },
        provider.name
      )
    ),
    // Price info
    model.inputPrice !== undefined && createElement(
      "div",
      {
        style: {
          fontSize: "10px",
          color: "var(--orca-color-text-3)",
          textAlign: "right",
        },
      },
      `$${model.inputPrice}/${model.outputPrice}`
    )
  );
}

export default function MultiModelSelector({ settings, onClose }: MultiModelSelectorProps) {
  const multiModelSnap = useSnapshot(multiModelStore);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 按提供商分组的模型列表
  const groupedModels = useMemo(() => {
    const groups: { provider: AiProvider; models: ProviderModel[] }[] = [];
    
    for (const provider of settings.providers) {
      if (!provider.enabled) continue;
      
      const filteredModels = provider.models.filter(model => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
          model.id.toLowerCase().includes(query) ||
          (model.label && model.label.toLowerCase().includes(query)) ||
          provider.name.toLowerCase().includes(query)
        );
      });
      
      if (filteredModels.length > 0) {
        groups.push({ provider, models: filteredModels });
      }
    }
    
    return groups;
  }, [settings.providers, searchQuery]);

  const selectedCount = multiModelSnap.selectedModels.length;
  const maxReached = selectedCount >= multiModelSnap.maxModels;

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose?.();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return createElement(
    "div",
    {
      ref: containerRef as any,
      style: {
        position: "absolute",
        bottom: "100%",
        left: 0,
        marginBottom: "8px",
        width: "320px",
        maxHeight: "400px",
        background: "var(--orca-color-bg-1)",
        border: "1px solid var(--orca-color-border)",
        borderRadius: "12px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
        overflow: "hidden",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
      },
    },
    // Header
    createElement(
      "div",
      {
        style: {
          padding: "12px 14px",
          borderBottom: "1px solid var(--orca-color-border)",
          background: "var(--orca-color-bg-2)",
        },
      },
      createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "10px",
          },
        },
        createElement(
          "span",
          {
            style: {
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--orca-color-text-1)",
            },
          },
          "多模型并行"
        ),
        createElement(
          "span",
          {
            style: {
              fontSize: "12px",
              color: maxReached ? "var(--orca-color-warning)" : "var(--orca-color-text-3)",
            },
          },
          `${selectedCount}/${multiModelSnap.maxModels} 已选`
        )
      ),
      // Search input
      createElement("input", {
        type: "text",
        placeholder: "搜索模型...",
        value: searchQuery,
        onChange: (e: any) => setSearchQuery(e.target.value),
        style: {
          width: "100%",
          padding: "8px 12px",
          border: "1px solid var(--orca-color-border)",
          borderRadius: "6px",
          background: "var(--orca-color-bg-1)",
          color: "var(--orca-color-text-1)",
          fontSize: "13px",
          outline: "none",
        },
      })
    ),
    // Model list
    createElement(
      "div",
      {
        style: {
          flex: 1,
          overflowY: "auto",
          padding: "8px",
        },
      },
      ...groupedModels.map(({ provider, models }) =>
        createElement(
          "div",
          { key: provider.id, style: { marginBottom: "12px" } },
          // Provider header
          createElement(
            "div",
            {
              style: {
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--orca-color-text-3)",
                textTransform: "uppercase",
                padding: "4px 8px",
                marginBottom: "4px",
              },
            },
            provider.name
          ),
          // Models
          ...models.map(model =>
            createElement(ModelCheckItem, {
              key: model.id,
              model,
              provider,
              isSelected: multiModelSnap.selectedModels.includes(model.id),
              onToggle: () => toggleModelSelection(model.id),
              disabled: maxReached,
            })
          )
        )
      ),
      groupedModels.length === 0 && createElement(
        "div",
        {
          style: {
            padding: "20px",
            textAlign: "center",
            color: "var(--orca-color-text-3)",
            fontSize: "13px",
          },
        },
        searchQuery ? "没有找到匹配的模型" : "没有可用的模型"
      )
    ),
    // Footer actions
    createElement(
      "div",
      {
        style: {
          padding: "10px 14px",
          borderTop: "1px solid var(--orca-color-border)",
          background: "var(--orca-color-bg-2)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        },
      },
      createElement(
        "button",
        {
          onClick: () => clearModelSelection(),
          style: {
            padding: "6px 12px",
            border: "1px solid var(--orca-color-border)",
            borderRadius: "6px",
            background: "transparent",
            color: "var(--orca-color-text-2)",
            fontSize: "12px",
            cursor: "pointer",
          },
        },
        "清空选择"
      ),
      createElement(
        "button",
        {
          onClick: onClose,
          disabled: selectedCount < 2,
          style: {
            padding: "6px 16px",
            border: "none",
            borderRadius: "6px",
            background: selectedCount >= 2 ? "var(--orca-color-primary)" : "var(--orca-color-bg-3)",
            color: selectedCount >= 2 ? "#fff" : "var(--orca-color-text-3)",
            fontSize: "12px",
            fontWeight: 500,
            cursor: selectedCount >= 2 ? "pointer" : "not-allowed",
          },
        },
        selectedCount >= 2 ? "确认" : "至少选择2个"
      )
    )
  );
}

/** 多模型模式切换按钮 */
export function MultiModelToggleButton({
  settings,
}: {
  settings: AiChatSettings;
}) {
  const multiModelSnap = useSnapshot(multiModelStore);
  const [showSelector, setShowSelector] = useState(false);

  const handleClick = useCallback(() => {
    if (multiModelSnap.enabled) {
      // 如果已启用，点击切换选择器显示
      setShowSelector(!showSelector);
    } else {
      // 如果未启用，先启用再显示选择器
      toggleMultiModelMode();
      setShowSelector(true);
    }
  }, [multiModelSnap.enabled, showSelector]);

  const handleClose = useCallback(() => {
    setShowSelector(false);
    // 如果没有选择任何模型，关闭多模型模式
    if (multiModelStore.selectedModels.length < 2) {
      multiModelStore.enabled = false;
      multiModelStore.selectedModels = [];
    }
  }, []);

  return createElement(
    "div",
    { style: { position: "relative" } },
    createElement(
      "button",
      {
        onClick: handleClick,
        style: {
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "4px 8px",
          border: multiModelSnap.enabled 
            ? "1px solid var(--orca-color-primary)" 
            : "1px solid var(--orca-color-border)",
          borderRadius: "6px",
          background: multiModelSnap.enabled 
            ? "var(--orca-color-primary-bg, rgba(0, 123, 255, 0.1))" 
            : "transparent",
          color: multiModelSnap.enabled 
            ? "var(--orca-color-primary)" 
            : "var(--orca-color-text-2)",
          fontSize: "12px",
          cursor: "pointer",
          transition: "all 0.15s ease",
        },
        title: multiModelSnap.enabled 
          ? `多模型模式 (${multiModelSnap.selectedModels.length}个)` 
          : "启用多模型并行输出",
      },
      createElement("i", { 
        className: "ti ti-layout-columns", 
        style: { fontSize: "14px" } 
      }),
      multiModelSnap.enabled && createElement(
        "span",
        { style: { fontWeight: 500 } },
        multiModelSnap.selectedModels.length
      )
    ),
    showSelector && createElement(MultiModelSelector, {
      settings,
      onClose: handleClose,
    })
  );
}
