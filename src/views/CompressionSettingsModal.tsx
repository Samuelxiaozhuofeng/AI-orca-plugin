/**
 * Compression Settings Modal
 * 让用户配置历史消息压缩设置
 */

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
};
const { createElement, useState, useEffect } = React;
const { Button } = orca.components;

import { getAiChatPluginName } from "../ui/ai-chat-ui";
import { getAiChatSettings, updateAiChatSettings } from "../settings/ai-chat-settings";

interface CompressionSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CompressionSettingsModal({ isOpen, onClose }: CompressionSettingsModalProps) {
  const [enableCompression, setEnableCompression] = useState(true);
  const [compressAfterMessages, setCompressAfterMessages] = useState(10);
  const [saving, setSaving] = useState(false);

  // 加载当前设置
  useEffect(() => {
    if (isOpen) {
      const pluginName = getAiChatPluginName();
      const settings = getAiChatSettings(pluginName);
      setEnableCompression(settings.enableCompression);
      setCompressAfterMessages(settings.compressAfterMessages);
    }
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const pluginName = getAiChatPluginName();
      await updateAiChatSettings("app", pluginName, {
        enableCompression,
        compressAfterMessages,
      });
      orca.notify("success", "压缩设置已保存");
      onClose();
    } catch (e) {
      orca.notify("error", "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  };

  const modalStyle: React.CSSProperties = {
    background: "var(--orca-color-bg-1)",
    borderRadius: 12,
    padding: 24,
    width: 360,
    maxWidth: "90vw",
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 20,
    color: "var(--orca-color-text-1)",
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 14,
    color: "var(--orca-color-text-1)",
  };

  const descStyle: React.CSSProperties = {
    fontSize: 12,
    color: "var(--orca-color-text-3)",
    marginTop: 4,
  };

  const selectStyle: React.CSSProperties = {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid var(--orca-color-border)",
    background: "var(--orca-color-bg-2)",
    color: "var(--orca-color-text-1)",
    fontSize: 14,
    cursor: "pointer",
  };

  const toggleStyle: React.CSSProperties = {
    width: 44,
    height: 24,
    borderRadius: 12,
    background: enableCompression ? "var(--orca-color-primary)" : "var(--orca-color-bg-3)",
    cursor: "pointer",
    position: "relative",
    transition: "background 0.2s",
  };

  const toggleKnobStyle: React.CSSProperties = {
    width: 20,
    height: 20,
    borderRadius: 10,
    background: "#fff",
    position: "absolute",
    top: 2,
    left: enableCompression ? 22 : 2,
    transition: "left 0.2s",
    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
  };

  const footerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 24,
  };

  return createElement(
    "div",
    { style: overlayStyle, onClick: onClose },
    createElement(
      "div",
      { style: modalStyle, onClick: (e: any) => e.stopPropagation() },
      // Title
      createElement("div", { style: titleStyle }, "Token 优化设置"),
      
      // Enable compression toggle
      createElement(
        "div",
        { style: rowStyle },
        createElement(
          "div",
          null,
          createElement("div", { style: labelStyle }, "启用历史压缩"),
          createElement("div", { style: descStyle }, "自动压缩旧对话以节省 Token")
        ),
        createElement(
          "div",
          {
            style: toggleStyle,
            onClick: () => setEnableCompression(!enableCompression),
          },
          createElement("div", { style: toggleKnobStyle })
        )
      ),
      
      // Compress after messages
      enableCompression && createElement(
        "div",
        { style: rowStyle },
        createElement(
          "div",
          null,
          createElement("div", { style: labelStyle }, "保留最近对话"),
          createElement("div", { style: descStyle }, "超过此数量的旧消息将被压缩")
        ),
        createElement(
          "select",
          {
            style: selectStyle,
            value: compressAfterMessages,
            onChange: (e: any) => setCompressAfterMessages(Number(e.target.value)),
          },
          [5, 8, 10, 12, 15, 20].map(n =>
            createElement("option", { key: n, value: n }, `${n} 条`)
          )
        )
      ),
      
      // Info
      createElement(
        "div",
        {
          style: {
            padding: 12,
            background: "var(--orca-color-bg-2)",
            borderRadius: 8,
            fontSize: 13,
            color: "var(--orca-color-text-2)",
            lineHeight: 1.5,
          },
        },
        enableCompression
          ? `启用后，超过 ${compressAfterMessages} 条的旧消息会被压缩成摘要，减少 Token 消耗。标记为"重要"的消息不会被压缩。`
          : "关闭后，所有历史消息都会完整发送给 AI，可能导致较高的 Token 消耗。"
      ),
      
      // Footer
      createElement(
        "div",
        { style: footerStyle },
        createElement(
          Button,
          { variant: "plain", onClick: onClose },
          "取消"
        ),
        createElement(
          Button,
          { variant: "primary", onClick: handleSave, disabled: saving },
          saving ? "保存中..." : "保存"
        )
      )
    )
  );
}
