/**
 * ModelSelectorMenu - 模型选择器菜单组件
 * 支持平台分组、模型选择、添加平台/模型
 */

import type { 
  AiProvider, 
  ProviderModel, 
  ModelCapability,
  AiChatSettings,
} from "../../settings/ai-chat-settings";
import { 
  MODEL_CAPABILITY_LABELS,
  createProvider,
  addModelToProvider,
} from "../../settings/ai-chat-settings";
import {
  menuContainerStyle,
  modelListPanelStyle,
  modelListScrollStyle,
  addModelPanelStyle,
  addModelTitleStyle,
} from "./chat-input-styles";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useMemo: <T>(fn: () => T, deps: any[]) => T;
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
};
const { createElement, useState, useMemo, useCallback } = React;

const { Button, Input } = orca.components;

type Props = {
  settings: AiChatSettings;
  selectedProviderId: string;
  selectedModelId: string;
  onSelect: (providerId: string, modelId: string) => void;
  onUpdateSettings: (settings: AiChatSettings) => void;
  close: () => void;
};

// ═══════════════════════════════════════════════════════════════════════════
// 子组件
// ═══════════════════════════════════════════════════════════════════════════

/** 能力标签 */
function CapabilityBadge({ capability }: { capability: ModelCapability }) {
  const config = MODEL_CAPABILITY_LABELS[capability];
  if (!config) return null;
  
  return createElement(
    "span",
    {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "2px",
        padding: "1px 4px",
        borderRadius: "4px",
        fontSize: "10px",
        background: `${config.color}20`,
        color: config.color,
        whiteSpace: "nowrap",
      },
      title: config.label,
    },
    createElement("i", { className: config.icon, style: { fontSize: "9px" } }),
    config.label
  );
}

/** 模型列表项 */
function ModelItem({
  model,
  isSelected,
  isDefault,
  onClick,
  onSetDefault,
  onDelete,
}: {
  model: ProviderModel;
  isSelected: boolean;
  isDefault: boolean;
  onClick: () => void;
  onSetDefault?: () => void;
  onDelete?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const hasPrice = model.inputPrice !== undefined || model.outputPrice !== undefined;
  const hasCapabilities = model.capabilities && model.capabilities.length > 0;
  
  return createElement(
    "div",
    {
      onClick,
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      style: {
        padding: "6px 10px",
        cursor: "pointer",
        background: isSelected ? "var(--orca-color-bg-3)" : hovered ? "var(--orca-color-bg-2)" : "transparent",
        borderRadius: "4px",
        margin: "1px 4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
      },
    },
    createElement(
      "div",
      { style: { flex: 1, minWidth: 0 } },
      // 模型名称
      createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "6px" } },
        createElement(
          "span",
          { 
            style: { 
              fontWeight: 500, 
              fontSize: "13px",
              color: "var(--orca-color-text-1)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            } 
          },
          model.label || model.id
        ),
        // 默认标记
        isDefault && createElement(
          "span",
          {
            style: {
              fontSize: "9px",
              padding: "1px 4px",
              borderRadius: "3px",
              background: "var(--orca-color-primary-bg, rgba(59, 130, 246, 0.1))",
              color: "var(--orca-color-primary)",
            },
          },
          "默认"
        ),
        hasCapabilities && createElement(
          "div",
          { style: { display: "flex", gap: "2px", flexShrink: 0, flexWrap: "wrap" } },
          ...model.capabilities!.map((cap) =>
            createElement(CapabilityBadge, { key: cap, capability: cap })
          )
        )
      ),
      // 价格
      hasPrice && createElement(
        "div",
        { style: { fontSize: "10px", color: "var(--orca-color-text-3)", marginTop: "2px" } },
        `$${model.inputPrice ?? 0}/${model.outputPrice ?? 0} /M`
      )
    ),
    // 右侧操作区
    createElement(
      "div",
      { style: { display: "flex", alignItems: "center", gap: "4px" } },
      // 设为默认按钮（悬停时显示，非默认模型）
      hovered && !isDefault && onSetDefault && createElement(
        "i",
        {
          className: "ti ti-star",
          style: { fontSize: "12px", color: "var(--orca-color-text-3)", cursor: "pointer" },
          onClick: (e: any) => { e.stopPropagation(); onSetDefault(); },
          title: "设为默认",
        }
      ),
      // 默认模型显示实心星
      isDefault && createElement(
        "i",
        {
          className: "ti ti-star-filled",
          style: { fontSize: "12px", color: "var(--orca-color-warning)" },
          title: "默认模型",
        }
      ),
      // 选中标记
      isSelected && createElement("i", { className: "ti ti-check", style: { color: "var(--orca-color-primary)", fontSize: "14px" } }),
      // 删除按钮
      hovered && onDelete && createElement(
        "i",
        {
          className: "ti ti-x",
          style: { color: "var(--orca-color-text-3)", fontSize: "12px", cursor: "pointer" },
          onClick: (e: any) => { e.stopPropagation(); onDelete(); },
        }
      )
    )
  );
}

/** 平台分组 */
function ProviderGroup({
  provider,
  selectedModelId,
  defaultModelId,
  defaultProviderId,
  onSelectModel,
  onSetDefaultModel,
  onDeleteModel,
  onEditProvider,
  isExpanded,
  onToggle,
}: {
  provider: AiProvider;
  selectedModelId: string;
  defaultModelId: string;
  defaultProviderId: string;
  onSelectModel: (modelId: string) => void;
  onSetDefaultModel: (modelId: string) => void;
  onDeleteModel?: (modelId: string) => void;
  onEditProvider: () => void;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const hasApiKey = provider.apiKey && provider.apiKey.trim().length > 0;
  
  return createElement(
    "div",
    { style: { marginBottom: "4px" } },
    // 平台标题
    createElement(
      "div",
      {
        onClick: onToggle,
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          cursor: "pointer",
          background: isExpanded ? "var(--orca-color-bg-2)" : "transparent",
          borderRadius: "6px",
        },
      },
      createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "8px" } },
        createElement("i", { 
          className: isExpanded ? "ti ti-chevron-down" : "ti ti-chevron-right", 
          style: { fontSize: "12px", color: "var(--orca-color-text-3)" } 
        }),
        createElement("span", { style: { fontWeight: 600, fontSize: "13px" } }, provider.name),
        createElement(
          "span",
          { style: { fontSize: "11px", color: "var(--orca-color-text-3)" } },
          `(${provider.models.length})`
        ),
        !hasApiKey && createElement(
          "span",
          { 
            style: { 
              fontSize: "10px", 
              color: "var(--orca-color-warning)", 
              background: "var(--orca-color-warning-bg, rgba(245, 158, 11, 0.1))",
              padding: "1px 4px",
              borderRadius: "3px",
            } 
          },
          "未配置"
        )
      ),
      createElement(
        "i",
        {
          className: "ti ti-settings",
          style: { fontSize: "14px", color: "var(--orca-color-text-3)", cursor: "pointer" },
          onClick: (e: any) => { e.stopPropagation(); onEditProvider(); },
          title: "配置平台",
        }
      )
    ),
    // 模型列表
    isExpanded && createElement(
      "div",
      { style: { marginLeft: "12px", marginTop: "4px" } },
      provider.models.length === 0
        ? createElement(
            "div",
            { style: { padding: "8px 12px", fontSize: "12px", color: "var(--orca-color-text-3)" } },
            "暂无模型，点击设置添加"
          )
        : provider.models.map((model) =>
            createElement(ModelItem, {
              key: model.id,
              model,
              isSelected: model.id === selectedModelId,
              isDefault: provider.id === defaultProviderId && model.id === defaultModelId,
              onClick: () => onSelectModel(model.id),
              onSetDefault: () => onSetDefaultModel(model.id),
              onDelete: !provider.isBuiltin ? () => onDeleteModel?.(model.id) : undefined,
            })
          )
    )
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// 模型编辑面板
// ═══════════════════════════════════════════════════════════════════════════

function ModelEditPanel({
  model,
  onUpdate,
  onClose,
}: {
  model: ProviderModel;
  onUpdate: (model: ProviderModel) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(model.label || model.id);
  const [inputPrice, setInputPrice] = useState(String(model.inputPrice ?? ""));
  const [outputPrice, setOutputPrice] = useState(String(model.outputPrice ?? ""));
  const [temperature, setTemperature] = useState(String(model.temperature ?? ""));
  const [maxTokens, setMaxTokens] = useState(String(model.maxTokens ?? ""));
  const [maxToolRounds, setMaxToolRounds] = useState(String(model.maxToolRounds ?? ""));
  const [capabilities, setCapabilities] = useState<ModelCapability[]>(model.capabilities || []);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 10px",
    fontSize: "13px",
    border: "1px solid var(--orca-color-border)",
    borderRadius: "6px",
    background: "var(--orca-color-bg-2)",
    color: "var(--orca-color-text-1)",
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    color: "var(--orca-color-text-2)",
    marginBottom: "4px",
    display: "block",
  };

  const allCapabilities: ModelCapability[] = ["vision", "web", "reasoning", "tools", "rerank", "embedding"];

  const toggleCapability = (cap: ModelCapability) => {
    if (capabilities.includes(cap)) {
      setCapabilities(capabilities.filter(c => c !== cap));
    } else {
      setCapabilities([...capabilities, cap]);
    }
  };

  const handleSave = () => {
    onUpdate({
      ...model,
      label: label.trim() || model.id,
      inputPrice: inputPrice ? parseFloat(inputPrice) : undefined,
      outputPrice: outputPrice ? parseFloat(outputPrice) : undefined,
      temperature: temperature ? parseFloat(temperature) : undefined,
      maxTokens: maxTokens ? parseInt(maxTokens, 10) : undefined,
      maxToolRounds: maxToolRounds ? parseInt(maxToolRounds, 10) : undefined,
      capabilities: capabilities.length > 0 ? capabilities : undefined,
    });
    onClose();
  };

  return createElement(
    "div",
    { style: { padding: "16px", minWidth: "320px" } },
    // 标题
    createElement(
      "div",
      { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" } },
      createElement("div", { style: { fontWeight: 600, fontSize: "14px" } }, `编辑模型: ${model.id}`),
      createElement("i", { className: "ti ti-x", style: { cursor: "pointer", color: "var(--orca-color-text-3)" }, onClick: onClose })
    ),

    // 显示名称
    createElement("div", { style: { marginBottom: "12px" } },
      createElement("label", { style: labelStyle }, "显示名称"),
      createElement("input", { type: "text", value: label, onChange: (e: any) => setLabel(e.target.value), style: inputStyle })
    ),

    // 价格（两列）
    createElement("div", { style: { display: "flex", gap: "8px", marginBottom: "12px" } },
      createElement("div", { style: { flex: 1 } },
        createElement("label", { style: labelStyle }, "输入价格 ($/M)"),
        createElement("input", { type: "number", step: "0.01", value: inputPrice, onChange: (e: any) => setInputPrice(e.target.value), placeholder: "0", style: inputStyle })
      ),
      createElement("div", { style: { flex: 1 } },
        createElement("label", { style: labelStyle }, "输出价格 ($/M)"),
        createElement("input", { type: "number", step: "0.01", value: outputPrice, onChange: (e: any) => setOutputPrice(e.target.value), placeholder: "0", style: inputStyle })
      )
    ),

    // 模型参数（三列）
    createElement("div", { style: { display: "flex", gap: "8px", marginBottom: "12px" } },
      createElement("div", { style: { flex: 1 } },
        createElement("label", { style: labelStyle }, "Temperature"),
        createElement("input", { type: "number", step: "0.1", min: "0", max: "2", value: temperature, onChange: (e: any) => setTemperature(e.target.value), placeholder: "0.7", style: inputStyle })
      ),
      createElement("div", { style: { flex: 1 } },
        createElement("label", { style: labelStyle }, "Max Tokens"),
        createElement("input", { type: "number", value: maxTokens, onChange: (e: any) => setMaxTokens(e.target.value), placeholder: "4096", style: inputStyle })
      ),
      createElement("div", { style: { flex: 1 } },
        createElement("label", { style: labelStyle }, "工具轮数"),
        createElement("input", { type: "number", min: "1", max: "10", value: maxToolRounds, onChange: (e: any) => setMaxToolRounds(e.target.value), placeholder: "5", style: inputStyle })
      )
    ),

    // 能力标签
    createElement("div", { style: { marginBottom: "16px" } },
      createElement("label", { style: labelStyle }, "模型能力"),
      createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" } },
        ...allCapabilities.map(cap => {
          const config = MODEL_CAPABILITY_LABELS[cap];
          const isSelected = capabilities.includes(cap);
          return createElement(
            "button",
            {
              key: cap,
              onClick: () => toggleCapability(cap),
              style: {
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 8px",
                borderRadius: "6px",
                fontSize: "11px",
                border: isSelected ? `1px solid ${config.color}` : "1px solid var(--orca-color-border)",
                background: isSelected ? `${config.color}20` : "var(--orca-color-bg-2)",
                color: isSelected ? config.color : "var(--orca-color-text-2)",
                cursor: "pointer",
              },
            },
            createElement("i", { className: config.icon, style: { fontSize: "10px" } }),
            config.label
          );
        })
      )
    ),

    // 保存按钮
    createElement("div", { style: { display: "flex", justifyContent: "flex-end" } },
      createElement(Button, { variant: "solid", onClick: handleSave }, "保存")
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 平台配置面板
// ═══════════════════════════════════════════════════════════════════════════

function ProviderConfigPanel({
  provider,
  onUpdate,
  onDelete,
  onClose,
}: {
  provider: AiProvider;
  onUpdate: (provider: AiProvider) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(provider.name);
  const [apiUrl, setApiUrl] = useState(provider.apiUrl);
  const [apiKey, setApiKey] = useState(provider.apiKey);
  const [newModelId, setNewModelId] = useState("");
  const [newModelLabel, setNewModelLabel] = useState("");
  const [editingModel, setEditingModel] = useState<ProviderModel | null>(null);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 10px",
    fontSize: "13px",
    border: "1px solid var(--orca-color-border)",
    borderRadius: "6px",
    background: "var(--orca-color-bg-2)",
    color: "var(--orca-color-text-1)",
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    color: "var(--orca-color-text-2)",
    marginBottom: "4px",
    display: "block",
  };

  const handleSave = () => {
    onUpdate({
      ...provider,
      name: name.trim() || provider.name,
      apiUrl: apiUrl.trim(),
      apiKey: apiKey.trim(),
    });
    onClose();
  };

  // 获取当前编辑状态的 provider（包含本地修改）
  const getCurrentProvider = (): AiProvider => ({
    ...provider,
    name: name.trim() || provider.name,
    apiUrl: apiUrl.trim(),
    apiKey: apiKey.trim(),
  });

  const handleAddModel = () => {
    if (!newModelId.trim()) return;
    const currentProvider = getCurrentProvider();
    const updatedProvider = { ...currentProvider, models: [...currentProvider.models] };
    addModelToProvider(updatedProvider, newModelId.trim(), newModelLabel.trim() || undefined);
    onUpdate(updatedProvider);
    setNewModelId("");
    setNewModelLabel("");
  };

  const handleDeleteModel = (modelId: string) => {
    const currentProvider = getCurrentProvider();
    const updatedProvider = {
      ...currentProvider,
      models: currentProvider.models.filter(m => m.id !== modelId),
    };
    onUpdate(updatedProvider);
  };

  const handleUpdateModel = (updatedModel: ProviderModel) => {
    const currentProvider = getCurrentProvider();
    const updatedProvider = {
      ...currentProvider,
      models: currentProvider.models.map(m => m.id === updatedModel.id ? updatedModel : m),
    };
    onUpdate(updatedProvider);
  };

  // 如果正在编辑模型，显示模型编辑面板
  if (editingModel) {
    return createElement(ModelEditPanel, {
      model: editingModel,
      onUpdate: (m: ProviderModel) => { handleUpdateModel(m); setEditingModel(null); },
      onClose: () => setEditingModel(null),
    });
  }

  return createElement(
    "div",
    { style: { ...addModelPanelStyle, minWidth: "320px" } },
    // 标题
    createElement(
      "div",
      { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" } },
      createElement("div", { style: addModelTitleStyle }, `配置 ${provider.name}`),
      createElement("i", { className: "ti ti-x", style: { cursor: "pointer", color: "var(--orca-color-text-3)" }, onClick: onClose })
    ),

    // 平台名称
    !provider.isBuiltin && createElement("div", { style: { marginBottom: "12px" } },
      createElement("label", { style: labelStyle }, "平台名称"),
      createElement("input", { type: "text", value: name, onChange: (e: any) => setName(e.target.value), style: inputStyle })
    ),

    // API URL
    createElement("div", { style: { marginBottom: "12px" } },
      createElement("label", { style: labelStyle }, "API 地址"),
      createElement("input", { type: "text", value: apiUrl, onChange: (e: any) => setApiUrl(e.target.value), placeholder: "https://api.openai.com/v1", style: inputStyle })
    ),

    // API Key
    createElement("div", { style: { marginBottom: "16px" } },
      createElement("label", { style: labelStyle }, "API 密钥"),
      createElement("input", { type: "password", value: apiKey, onChange: (e: any) => setApiKey(e.target.value), placeholder: "sk-...", style: inputStyle })
    ),

    // 分隔线
    createElement("div", { style: { height: "1px", background: "var(--orca-color-border)", margin: "16px 0" } }),

    // 模型列表
    createElement("div", { style: { marginBottom: "12px" } },
      createElement("label", { style: { ...labelStyle, marginBottom: "8px" } }, "模型列表（点击编辑）"),
      provider.models.length === 0
        ? createElement("div", { style: { fontSize: "12px", color: "var(--orca-color-text-3)", marginBottom: "8px" } }, "暂无模型")
        : createElement(
            "div",
            { style: { maxHeight: "200px", overflowY: "auto", marginBottom: "8px" } },
            ...provider.models.map(model =>
              createElement(
                "div",
                {
                  key: model.id,
                  onClick: () => setEditingModel(model),
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    background: "var(--orca-color-bg-2)",
                    borderRadius: "6px",
                    marginBottom: "4px",
                    cursor: "pointer",
                    border: "1px solid transparent",
                  },
                  onMouseEnter: (e: any) => { e.currentTarget.style.borderColor = "var(--orca-color-border)"; },
                  onMouseLeave: (e: any) => { e.currentTarget.style.borderColor = "transparent"; },
                },
                createElement("div", { style: { flex: 1 } },
                  createElement("div", { style: { fontSize: "12px", fontWeight: 500 } }, model.label || model.id),
                  createElement("div", { style: { fontSize: "10px", color: "var(--orca-color-text-3)", marginTop: "2px" } },
                    model.inputPrice !== undefined ? `${model.inputPrice}/${model.outputPrice ?? 0} $/M` : "未设置价格"
                  )
                ),
                createElement("div", { style: { display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" } },
                  model.capabilities && model.capabilities.map(cap =>
                    createElement(CapabilityBadge, { key: cap, capability: cap })
                  ),
                  createElement("i", { className: "ti ti-pencil", style: { fontSize: "12px", color: "var(--orca-color-text-3)", marginLeft: "4px" } }),
                  createElement("i", {
                    className: "ti ti-x",
                    style: { fontSize: "12px", color: "var(--orca-color-text-3)", marginLeft: "4px" },
                    onClick: (e: any) => { e.stopPropagation(); handleDeleteModel(model.id); },
                  })
                )
              )
            )
          )
    ),

    // 添加模型
    createElement(
      "div",
      { style: { display: "flex", gap: "8px", marginBottom: "16px" } },
      createElement("input", { type: "text", value: newModelId, onChange: (e: any) => setNewModelId(e.target.value), placeholder: "模型 ID", style: { ...inputStyle, flex: 1 } }),
      createElement("input", { type: "text", value: newModelLabel, onChange: (e: any) => setNewModelLabel(e.target.value), placeholder: "显示名(可选)", style: { ...inputStyle, flex: 1 } }),
      createElement(Button, { variant: "outline", disabled: !newModelId.trim(), onClick: handleAddModel, style: { flexShrink: 0 } }, "添加")
    ),

    // 操作按钮
    createElement(
      "div",
      { style: { display: "flex", gap: "8px", justifyContent: "flex-end" } },
      !provider.isBuiltin && onDelete && createElement(Button, { variant: "outline", onClick: onDelete, style: { color: "var(--orca-color-danger)" } }, "删除平台"),
      createElement(Button, { variant: "solid", onClick: handleSave }, "保存")
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════════════════════════════════════

export default function ModelSelectorMenu({
  settings,
  selectedProviderId,
  selectedModelId,
  onSelect,
  onUpdateSettings,
  close,
}: Props) {
  const [filter, setFilter] = useState("");
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(() => {
    // 默认展开当前选中的平台
    return new Set([selectedProviderId]);
  });
  const [editingProvider, setEditingProvider] = useState<AiProvider | null>(null);

  // 过滤平台和模型
  const filteredProviders = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return settings.providers.filter(p => p.enabled);
    
    return settings.providers
      .filter(p => p.enabled)
      .map(p => ({
        ...p,
        models: p.models.filter(m => 
          m.id.toLowerCase().includes(q) || 
          (m.label || "").toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q)
        ),
      }))
      .filter(p => p.models.length > 0 || p.name.toLowerCase().includes(q));
  }, [settings.providers, filter]);

  const toggleProvider = useCallback((providerId: string) => {
    setExpandedProviders(prev => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  }, []);

  const handleSelectModel = useCallback((providerId: string, modelId: string) => {
    onSelect(providerId, modelId);
    close();
  }, [onSelect, close]);

  // 设为默认模型
  const handleSetDefaultModel = useCallback((providerId: string, modelId: string) => {
    onUpdateSettings({ 
      ...settings, 
      selectedProviderId: providerId, 
      selectedModelId: modelId 
    });
    console.log("[ModelSelectorMenu] Set default model:", providerId, modelId);
  }, [settings, onUpdateSettings]);

  const handleUpdateProvider = useCallback((updatedProvider: AiProvider) => {
    console.log("[ModelSelectorMenu] handleUpdateProvider called:", {
      providerId: updatedProvider.id,
      apiKey: updatedProvider.apiKey ? `${updatedProvider.apiKey.slice(0, 8)}...` : "(empty)",
      modelsCount: updatedProvider.models.length,
    });
    const newProviders = settings.providers.map(p => 
      p.id === updatedProvider.id ? updatedProvider : p
    );
    console.log("[ModelSelectorMenu] Calling onUpdateSettings with providers:", 
      newProviders.map(p => ({ id: p.id, apiKey: p.apiKey ? `${p.apiKey.slice(0, 8)}...` : "(empty)", modelsCount: p.models.length }))
    );
    onUpdateSettings({ ...settings, providers: newProviders });
    // 同步更新 editingProvider 状态
    setEditingProvider(updatedProvider);
  }, [settings, onUpdateSettings]);

  const handleDeleteProvider = useCallback((providerId: string) => {
    const newProviders = settings.providers.filter(p => p.id !== providerId);
    onUpdateSettings({ ...settings, providers: newProviders });
    setEditingProvider(null);
  }, [settings, onUpdateSettings]);

  const handleAddProvider = useCallback(() => {
    const newProvider = createProvider("新平台");
    const newProviders = [...settings.providers, newProvider];
    onUpdateSettings({ ...settings, providers: newProviders });
    setEditingProvider(newProvider);
    setExpandedProviders(prev => new Set([...prev, newProvider.id]));
  }, [settings, onUpdateSettings]);

  const handleDeleteModel = useCallback((providerId: string, modelId: string) => {
    const provider = settings.providers.find(p => p.id === providerId);
    if (!provider) return;
    
    const updatedProvider = {
      ...provider,
      models: provider.models.filter(m => m.id !== modelId),
    };
    handleUpdateProvider(updatedProvider);
  }, [settings.providers, handleUpdateProvider]);

  // 如果正在编辑平台，显示配置面板
  if (editingProvider) {
    return createElement(
      "div",
      { style: menuContainerStyle },
      createElement(ProviderConfigPanel, {
        provider: editingProvider,
        onUpdate: handleUpdateProvider,
        onDelete: editingProvider.isBuiltin ? undefined : () => handleDeleteProvider(editingProvider.id),
        onClose: () => setEditingProvider(null),
      })
    );
  }

  return createElement(
    "div",
    { style: menuContainerStyle },
    createElement(
      "div",
      { style: { ...modelListPanelStyle, minWidth: "320px" } },
      // 搜索框
      createElement(Input as any, {
        placeholder: "搜索模型...",
        value: filter,
        onChange: (e: any) => setFilter(e.target.value),
        pre: createElement("i", { className: "ti ti-search" }),
        style: { width: "100%", maxWidth: "100%", boxSizing: "border-box", marginBottom: "8px" },
      }),
      
      // 平台列表
      createElement(
        "div",
        { style: modelListScrollStyle },
        filteredProviders.length === 0
          ? createElement(
              "div",
              { style: { padding: "16px", textAlign: "center", color: "var(--orca-color-text-3)" } },
              "未找到匹配的模型"
            )
          : filteredProviders.map(provider =>
              createElement(ProviderGroup, {
                key: provider.id,
                provider,
                selectedModelId: provider.id === selectedProviderId ? selectedModelId : "",
                defaultModelId: settings.selectedModelId,
                defaultProviderId: settings.selectedProviderId,
                onSelectModel: (modelId: string) => handleSelectModel(provider.id, modelId),
                onSetDefaultModel: (modelId: string) => handleSetDefaultModel(provider.id, modelId),
                onDeleteModel: !provider.isBuiltin ? (modelId: string) => handleDeleteModel(provider.id, modelId) : undefined,
                onEditProvider: () => setEditingProvider(provider),
                isExpanded: expandedProviders.has(provider.id),
                onToggle: () => toggleProvider(provider.id),
              })
            )
      ),
      
      // 添加平台按钮
      createElement(
        "div",
        { style: { borderTop: "1px solid var(--orca-color-border)", paddingTop: "8px", marginTop: "8px" } },
        createElement(
          Button,
          {
            variant: "ghost",
            onClick: handleAddProvider,
            style: { width: "100%", justifyContent: "center" },
          },
          createElement("i", { className: "ti ti-plus", style: { marginRight: "4px" } }),
          "新建平台"
        )
      )
    )
  );
}
