/**
 * Todoist 设置 Modal
 * 配置 API Token
 */

import {
  getTodoistToken,
  setTodoistToken,
  validateToken,
  clearTokenCache,
} from "../services/external/todoist-service";
import { getAiChatPluginName } from "../ui/ai-chat-ui";

const { createElement, useState, useCallback, useEffect } = window.React as any;
const { Button, Input } = orca.components;

// ═══════════════════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════════════════

interface TodoistSettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// 样式
// ═══════════════════════════════════════════════════════════════════════════

const modalStyles = {
  overlay: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    background: "var(--orca-color-bg-1)",
    borderRadius: "12px",
    padding: "20px",
    width: "400px",
    maxWidth: "90vw",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "16px",
  },
  title: {
    fontSize: "18px",
    fontWeight: 600,
    color: "var(--orca-color-text-1)",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  closeBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "4px",
    color: "var(--orca-color-text-2)",
    fontSize: "18px",
  },
};

const styles = {
  content: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "16px",
  },
  field: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "6px",
  },
  label: {
    fontSize: "13px",
    fontWeight: 500,
    color: "var(--orca-color-text-1)",
  },
  input: {
    width: "100%",
  },
  hint: {
    fontSize: "12px",
    color: "var(--orca-color-text-2)",
    lineHeight: 1.5,
  },
  link: {
    color: "var(--orca-color-primary)",
    textDecoration: "underline",
    cursor: "pointer",
  },
  status: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px",
    borderRadius: "8px",
    fontSize: "13px",
  },
  statusConnected: {
    background: "rgba(76, 175, 80, 0.1)",
    color: "#4caf50",
  },
  statusDisconnected: {
    background: "rgba(158, 158, 158, 0.1)",
    color: "var(--orca-color-text-2)",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    marginTop: "8px",
  },
  error: {
    color: "var(--orca-color-error)",
    fontSize: "12px",
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════════════════════════════════════

export default function TodoistSettingsModal({
  visible,
  onClose,
}: TodoistSettingsModalProps) {
  const [token, setToken] = useState("");
  const [hasExistingToken, setHasExistingToken] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // 加载现有 Token
  useEffect(() => {
    if (visible) {
      setIsLoading(true);
      setError("");
      setSuccess("");
      
      const loadToken = async () => {
        const pluginName = getAiChatPluginName();
        const existingToken = await getTodoistToken(pluginName);
        if (existingToken) {
          setToken(existingToken);
          setHasExistingToken(true);
        } else {
          setToken("");
          setHasExistingToken(false);
        }
        setIsLoading(false);
      };
      
      loadToken();
    }
  }, [visible]);

  const handleSave = useCallback(async () => {
    if (!token.trim()) {
      setError("请输入 API Token");
      return;
    }

    setIsValidating(true);
    setError("");
    setSuccess("");

    try {
      const result = await validateToken(token.trim());
      if (!result.valid) {
        setError(result.error || "Token 无效，请检查后重试");
        setIsValidating(false);
        return;
      }

      const pluginName = getAiChatPluginName();
      await setTodoistToken(pluginName, token.trim());
      setHasExistingToken(true);
      setSuccess("Token 已保存");
      
      // 2秒后关闭
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || "保存失败");
    } finally {
      setIsValidating(false);
    }
  }, [token, onClose]);

  const handleClear = useCallback(async () => {
    const pluginName = getAiChatPluginName();
    await orca.plugins.setData(pluginName, "todoist-api-token", "");
    clearTokenCache();
    setToken("");
    setHasExistingToken(false);
    setSuccess("Token 已清除");
  }, []);

  const openTodoistSettings = () => {
    window.open("https://todoist.com/app/settings/integrations/developer", "_blank");
  };

  if (!visible) return null;

  return createElement(
    "div",
    { style: modalStyles.overlay, onClick: onClose },
    createElement(
      "div",
      { style: modalStyles.modal, onClick: (e: any) => e.stopPropagation() },
      // Header
      createElement(
        "div",
        { style: modalStyles.header },
        createElement(
          "div",
          { style: modalStyles.title },
          createElement("i", { className: "ti ti-checkbox", style: { color: "var(--orca-color-primary)" } }),
          "Todoist 设置"
        ),
        createElement(
          "button",
          { style: modalStyles.closeBtn, onClick: onClose },
          createElement("i", { className: "ti ti-x" })
        )
      ),
      // Content
      createElement(
        "div",
        { style: styles.content },
        // 连接状态
        createElement(
          "div",
          {
            style: {
              ...styles.status,
              ...(hasExistingToken ? styles.statusConnected : styles.statusDisconnected),
            },
          },
          createElement("i", {
            className: hasExistingToken ? "ti ti-circle-check" : "ti ti-circle-x",
          }),
          hasExistingToken ? "已连接 Todoist" : "未连接"
        ),
        // Token 输入
        createElement(
          "div",
          { style: styles.field },
          createElement("label", { style: styles.label }, "API Token"),
          createElement(Input, {
            style: styles.input,
            placeholder: "粘贴你的 Todoist API Token",
            value: token,
            onChange: (e: any) => {
              setToken(e.target.value);
              setError("");
              setSuccess("");
            },
            type: "password",
          }),
          createElement(
            "div",
            { style: styles.hint },
            "从 ",
            createElement(
              "span",
              { style: styles.link, onClick: openTodoistSettings },
              "Todoist 设置 → 集成 → 开发者"
            ),
            " 获取 API Token"
          )
        ),
        // 错误/成功提示
        error && createElement("div", { style: styles.error }, error),
        success && createElement(
          "div",
          { style: { color: "#4caf50", fontSize: "12px" } },
          success
        ),
        // 按钮
        createElement(
          "div",
          { style: styles.actions },
          hasExistingToken && createElement(
            Button,
            {
              variant: "outline",
              onClick: handleClear,
              style: { color: "var(--orca-color-danger, #dc3545)" },
            },
            "清除 Token"
          ),
          createElement(
            Button,
            {
              variant: "solid",
              onClick: handleSave,
              disabled: !token.trim() || isValidating,
            },
            isValidating ? "验证中..." : "保存"
          )
        )
      )
    )
  );
}
