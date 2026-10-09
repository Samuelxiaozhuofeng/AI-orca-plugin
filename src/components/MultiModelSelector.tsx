/**
 * MultiModelSelector - 多模型选择器组件
 * 
 * 允许用户选择多个模型进行并行输出
 */

import type { AiChatSettings, AiProvider, ProviderModel, ModelCapability, MODEL_CAPABILITY_LABELS } from "../settings/ai-chat-settings";
import { getAiChatSettings, normalizeApiProtocol } from "../settings/ai-chat-settings";
import { getAiChatPluginName } from "../ui/ai-chat-ui";
import { multiModelStore, toggleModelSelection, clearModelSelection, toggleMultiModelMode, getModelKey } from "../store/multi-model-store";
import { withTooltip } from "../utils/orca-tooltip";
import { measureMenuWidth } from "../views/chat-input/chat-input-styles";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useMemo: <T>(factory: () => T, deps: any[]) => T;
};
const { createElement, useState, useMemo } = React;

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

export default function MultiModelSelector({ settings, onClose, width = 320 }: MultiModelSelectorProps & { width?: number }) {
  const multiModelSnap = useSnapshot(multiModelStore);
  const [searchQuery, setSearchQuery] = useState("");
  const resolvedSettings = useMemo(() => {
    if (Array.isArray(settings?.providers) && settings.providers.length > 0) {
      return settings;
    }
    try {
      return getAiChatSettings(getAiChatPluginName());
    } catch {
      return settings;
    }
  }, [settings]);

  // 规范化 provider/models，兼容旧数据里 models 为 string 的情况
  // 本机 AI 不能参与多模型对比，不列出
  const rawProviders = (Array.isArray(resolvedSettings.providers) ? resolvedSettings.providers : [])
    .filter((provider) => normalizeApiProtocol(provider.protocol) !== "local-cli");
  const normalizedProviders = rawProviders.map((provider) => {
    const rawModels: any = (provider as any).models;
    const models = Array.isArray(rawModels)
      ? rawModels
      : typeof rawModels === "string"
        ? rawModels
            .split(/[,，;\r\n]+/)
            .map((s: string) => s.trim())
            .filter(Boolean)
        : [];
    const normalizedModels = models
      .map((model: any) => {
        if (!model) return null;
        if (typeof model === "string") {
          const id = model.trim();
          return id ? { id, label: id } : null;
        }
        if (typeof model === "object" && typeof model.id === "string") {
          return { ...model };
        }
        return null;
      })
      .filter((m): m is ProviderModel => !!m && !!m.id);
    return { ...provider, models: normalizedModels };
  });

  const enabledProviders = normalizedProviders.filter((provider) => provider.enabled !== false);
  // 兼容旧配置：如果全部被判定为禁用，仍展示所有提供商
  const providersForList = enabledProviders.length > 0 ? enabledProviders : normalizedProviders;

  // 按提供商分组的模型列表
  const groupedModels = useMemo(() => {
    const groups: { provider: AiProvider; models: ProviderModel[] }[] = [];
    
    for (const provider of providersForList) {
      if (!provider.enabled && enabledProviders.length > 0) continue;
      
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
  }, [providersForList, enabledProviders.length, searchQuery]);

  const selectedCount = multiModelSnap.selectedModels.length;
  const maxReached = selectedCount >= multiModelSnap.maxModels;
  const hasEnabledProviders = enabledProviders.some(
    (provider) => provider.models.length > 0
  );

  return createElement(
    "div",
    {
      style: {
        width,
        maxHeight: "400px",
        background: "var(--orca-color-bg-1)",
        borderRadius: "8px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
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
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          createElement(
            "span",
            {
              style: {
                fontSize: "12px",
                color: maxReached ? "var(--orca-color-warning)" : "var(--orca-color-text-3)",
              },
            },
            `${selectedCount}/${multiModelSnap.maxModels} 已选`
          ),
          createElement(
            "i",
            {
              className: "ti ti-x",
              onClick: onClose,
              style: {
                fontSize: "14px",
                color: "var(--orca-color-text-3)",
                cursor: "pointer",
              },
            }
          )
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
              key: `${provider.id}:${model.id}`,
              model,
              provider,
              isSelected: multiModelSnap.selectedModels.includes(getModelKey(provider.id, model.id)),
              onToggle: () => toggleModelSelection(provider.id, model.id),
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
        !hasEnabledProviders
          ? "没有启用的模型提供商"
          : searchQuery
          ? "没有找到匹配的模型"
          : "没有可用的模型"
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
        "清空"
      ),
      createElement(
        "button",
        {
          onClick: onClose,
          disabled: selectedCount < 2,
          style: {
            padding: "6px 16px",
            border: "1px solid var(--orca-color-border)",
            borderRadius: "6px",
            background: selectedCount >= 2 ? "var(--orca-color-bg-3)" : "var(--orca-color-bg-2)",
            color: selectedCount >= 2 ? "var(--orca-color-text-1)" : "var(--orca-color-text-3)",
            fontSize: "12px",
            fontWeight: 500,
            cursor: selectedCount >= 2 ? "pointer" : "not-allowed",
          },
        },
        selectedCount >= 2 ? "开始并行" : "至少选择2个"
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
  const [menuWidth, setMenuWidth] = useState(320);

  const { ContextMenu } = orca.components || {};

  return createElement(
    ContextMenu as any,
    {
      defaultPlacement: "top",
      placement: "vertical",
      alignment: "left",
      allowBeyondContainer: true,
      offset: 8,
      menu: (close: () => void) =>
        createElement(MultiModelSelector, {
          settings,
          onClose: close,
          width: menuWidth,
        }),
    },
    (openMenu: (e: any) => void) =>
      withTooltip(
        multiModelSnap.enabled
          ? `多模型并行（${multiModelSnap.selectedModels.length}）`
          : "启用多模型并行输出",
        createElement(
          "button",
          {
            onClick: (e: any) => {
              setMenuWidth(measureMenuWidth(e.currentTarget, "left", 240, 320));
              if (!multiModelSnap.enabled) {
                toggleMultiModelMode();
              }
              openMenu(e);
            },
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
          },
          createElement("i", {
            className: "ti ti-layout-columns",
            style: { fontSize: "14px" },
          }),
          multiModelSnap.enabled && createElement(
            "span",
            { style: { fontWeight: 500 } },
            multiModelSnap.selectedModels.length
          )
        )
      )
  );
}
