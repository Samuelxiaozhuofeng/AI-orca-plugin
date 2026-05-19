/**
 * Vision Model Settings Modal
 * 
 * 视觉模型设置面板，允许用户配置：
 * - 是否启用视觉模型代理
 * - 选择用于图片描述的视觉模型
 * - 设置描述的详细程度
 */

import {
  getVisionModelConfig,
  saveVisionModelConfig,
  getVisionCapableModels,
  type VisionModelConfig,
} from "../services/ai/vision-model-service";
import { getAiChatSettings } from "../settings/ai-chat-settings";
import { getAiChatPluginName } from "../ui/ai-chat-ui";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
};
const { createElement, useState, useEffect, useCallback } = React;

interface VisionModelSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const detailLevelOptions: { value: VisionModelConfig["detailLevel"]; label: string; desc: string }[] = [
  { value: "brief", label: "简短", desc: "一句话描述主要内容" },
  { value: "normal", label: "正常", desc: "描述主要元素和场景" },
  { value: "detailed", label: "详细", desc: "详细描述所有可见内容" },
];

export default function VisionModelSettingsModal({ isOpen, onClose }: VisionModelSettingsModalProps) {
  const [config, setConfig] = useState<VisionModelConfig>(getVisionModelConfig);
  const [saving, setSaving] = useState(false);

  // 获取支持视觉的模型列表
  const pluginName = getAiChatPluginName();
  const settings = getAiChatSettings(pluginName);
  const visionModels = getVisionCapableModels(settings);

  // 保存配置
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveVisionModelConfig(pluginName, config);
      onClose();
    } catch (error) {
      console.error("[VisionModelSettings] Failed to save config:", error);
    } finally {
      setSaving(false);
    }
  }, [config, pluginName, onClose]);

  // 更新配置
  const updateConfig = useCallback(<K extends keyof VisionModelConfig>(key: K, value: VisionModelConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  // 切换模型时同时更新 providerId
  const handleModelChange = useCallback((modelId: string) => {
    const model = visionModels.find((m) => m.model.id === modelId);
    if (model) {
      setConfig((prev) => ({
        ...prev,
        modelId: model.model.id,
        providerId: model.providerId,
      }));
    }
  }, [visionModels]);

  if (!isOpen) return null;

  // Styles
  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  };

  const modalStyle: React.CSSProperties = {
    background: "var(--orca-color-bg-1)",
    borderRadius: "12px",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
    width: "min(480px, 90vw)",
    maxHeight: "80vh",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };

  const headerStyle: React.CSSProperties = {
    padding: "16px 20px",
    borderBottom: "1px solid var(--orca-color-border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  };

  const titleStyle: React.CSSProperties = {
    fontSize: "16px",
    fontWeight: 600,
    color: "var(--orca-color-text-1)",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  };

  const contentStyle: React.CSSProperties = {
    padding: "20px",
    overflowY: "auto",
    flex: 1,
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: "20px",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "13px",
    fontWeight: 500,
    color: "var(--orca-color-text-1)",
    marginBottom: "8px",
    display: "block",
  };

  const descStyle: React.CSSProperties = {
    fontSize: "12px",
    color: "var(--orca-color-text-3)",
    marginBottom: "12px",
  };

  const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid var(--orca-color-border)",
    background: "var(--orca-color-bg-2)",
    color: "var(--orca-color-text-1)",
    fontSize: "13px",
    cursor: "pointer",
  };

  const toggleRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 0",
  };

  const toggleLabelStyle: React.CSSProperties = {
    fontSize: "13px",
    color: "var(--orca-color-text-1)",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  };

  const toggleSwitchStyle = (isOn: boolean): React.CSSProperties => ({
    width: "40px",
    height: "22px",
    borderRadius: "11px",
    background: isOn ? "var(--orca-color-primary)" : "var(--orca-color-bg-3)",
    border: `1px solid ${isOn ? "var(--orca-color-primary)" : "var(--orca-color-border)"}`,
    position: "relative",
    cursor: "pointer",
    transition: "all 0.2s",
  });

  const toggleKnobStyle = (isOn: boolean): React.CSSProperties => ({
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    background: "white",
    position: "absolute",
    top: "1px",
    left: isOn ? "19px" : "1px",
    transition: "left 0.2s",
    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
  });

  const buttonGroupStyle: React.CSSProperties = {
    display: "flex",
    gap: "8px",
    background: "var(--orca-color-bg-2)",
    borderRadius: "8px",
    padding: "4px",
  };

  const buttonStyle = (isActive: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "8px 12px",
    border: isActive ? "1px solid var(--orca-color-border)" : "none",
    borderRadius: "6px",
    background: isActive ? "var(--orca-color-bg-3)" : "transparent",
    color: isActive ? "var(--orca-color-text-1)" : "var(--orca-color-text-2)",
    fontSize: "12px",
    fontWeight: isActive ? 500 : 400,
    cursor: "pointer",
    transition: "all 0.2s",
    textAlign: "center",
  });

  const footerStyle: React.CSSProperties = {
    padding: "16px 20px",
    borderTop: "1px solid var(--orca-color-border)",
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
  };

  const cancelButtonStyle: React.CSSProperties = {
    padding: "8px 16px",
    borderRadius: "6px",
    border: "1px solid var(--orca-color-border)",
    background: "transparent",
    color: "var(--orca-color-text-2)",
    fontSize: "13px",
    cursor: "pointer",
  };

  const saveButtonStyle: React.CSSProperties = {
    padding: "8px 16px",
    borderRadius: "6px",
    border: "none",
    background: "var(--orca-color-primary)",
    color: "white",
    fontSize: "13px",
    cursor: saving ? "not-allowed" : "pointer",
    opacity: saving ? 0.7 : 1,
  };

  const infoBoxStyle: React.CSSProperties = {
    padding: "12px",
    background: "var(--orca-color-bg-2)",
    borderRadius: "8px",
    fontSize: "12px",
    color: "var(--orca-color-text-2)",
    lineHeight: 1.5,
    marginTop: "16px",
  };

  return createElement(
    "div",
    {
      style: overlayStyle,
      onClick: (e: any) => e.target === e.currentTarget && onClose(),
    },
    createElement(
      "div",
      { style: modalStyle },
      // Header
      createElement(
        "div",
        { style: headerStyle },
        createElement(
          "span",
          { style: titleStyle },
          createElement("i", { className: "ti ti-eye", style: { fontSize: "18px" } }),
          "视觉模型设置"
        ),
        createElement(
          "button",
          {
            onClick: onClose,
            style: {
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: "4px",
              color: "var(--orca-color-text-3)",
            },
          },
          createElement("i", { className: "ti ti-x", style: { fontSize: "18px" } })
        )
      ),
      // Content
      createElement(
        "div",
        { style: contentStyle },
        // Enable Toggle
        createElement(
          "div",
          { style: sectionStyle },
          createElement(
            "div",
            { style: toggleRowStyle },
            createElement(
              "span",
              { style: toggleLabelStyle },
              createElement("i", { className: "ti ti-eye", style: { fontSize: "16px", color: "var(--orca-color-text-3)" } }),
              "启用视觉模型代理"
            ),
            createElement(
              "div",
              {
                style: toggleSwitchStyle(config.enabled) as any,
                onClick: () => updateConfig("enabled", !config.enabled),
              },
              createElement("div", { style: toggleKnobStyle(config.enabled) })
            )
          ),
          createElement(
            "div",
            { style: descStyle },
            "启用后，当使用不支持视觉的模型时，会自动调用视觉模型来描述图片内容"
          )
        ),
        // Vision Model Selection
        config.enabled && createElement(
          "div",
          { style: sectionStyle },
          createElement("label", { style: labelStyle }, "视觉模型"),
          visionModels.length > 0
            ? createElement(
                "select",
                {
                  style: selectStyle,
                  value: config.modelId,
                  onChange: (e: any) => handleModelChange(e.target.value),
                },
                ...visionModels.map((vm) =>
                  createElement(
                    "option",
                    { key: `${vm.providerId}:${vm.model.id}`, value: vm.model.id },
                    `${vm.model.label || vm.model.id} (${vm.providerName})`
                  )
                )
              )
            : createElement(
                "div",
                { style: { ...descStyle, color: "var(--orca-color-warning)" } },
                "未找到支持视觉的模型，请先在设置中配置"
              )
        ),
        // Detail Level
        config.enabled && createElement(
          "div",
          { style: sectionStyle },
          createElement("label", { style: labelStyle }, "描述详细程度"),
          createElement(
            "div",
            { style: buttonGroupStyle },
            ...detailLevelOptions.map((option) =>
              createElement(
                "button",
                {
                  key: option.value,
                  style: buttonStyle(config.detailLevel === option.value),
                  onClick: () => updateConfig("detailLevel", option.value),
                  title: option.desc,
                },
                option.label
              )
            )
          ),
          createElement(
            "div",
            { style: { ...descStyle, marginTop: "8px" } },
            detailLevelOptions.find((o) => o.value === config.detailLevel)?.desc
          )
        ),
        // Max Tokens
        config.enabled && createElement(
          "div",
          { style: sectionStyle },
          createElement("label", { style: labelStyle }, "最大输出 Token"),
          createElement("input", {
            type: "number",
            min: 100,
            max: 2000,
            step: 100,
            value: config.maxTokens,
            onChange: (e: any) => updateConfig("maxTokens", parseInt(e.target.value) || 500),
            style: {
              ...selectStyle,
              width: "120px",
            },
          }),
          createElement(
            "div",
            { style: { ...descStyle, marginTop: "8px" } },
            "控制图片描述的最大长度"
          )
        ),
        // Info Box
        createElement(
          "div",
          { style: infoBoxStyle },
          createElement("i", { className: "ti ti-info-circle", style: { marginRight: "6px" } }),
          "视觉模型代理会在以下情况自动工作：",
          createElement("br"),
          "• 当前使用的模型不支持视觉能力",
          createElement("br"),
          "• 消息中包含图片",
          createElement("br"),
          createElement("br"),
          "视觉模型会先分析图片，然后将描述文本发送给当前模型。"
        )
      ),
      // Footer
      createElement(
        "div",
        { style: footerStyle },
        createElement(
          "button",
          { style: cancelButtonStyle, onClick: onClose },
          "取消"
        ),
        createElement(
          "button",
          { style: saveButtonStyle, onClick: handleSave, disabled: saving },
          saving ? "保存中..." : "保存"
        )
      )
    )
  );
}
