/**
 * Todoist 添加任务 Modal
 * 增强版：支持项目选择、标签选择、描述字段
 */

import {
  createTask,
  getTodoistToken,
  getProjects,
  getLabels,
  type CreateTaskParams,
  type TodoistProject,
  type TodoistLabel,
} from "../services/external/todoist-service";
import { getAiChatPluginName } from "../ui/ai-chat-ui";

const { createElement, useState, useCallback, useEffect, useRef } = window.React as any;
const { Button, Input } = orca.components;

// ═══════════════════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════════════════

interface TodoistAddTaskModalProps {
  visible: boolean;
  onClose: () => void;
  initialContent?: string;
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
    width: "420px",
    maxWidth: "90vw",
    maxHeight: "80vh",
    overflow: "auto",
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
  form: {
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
  textarea: {
    width: "100%",
    minHeight: "60px",
    padding: "8px 12px",
    border: "1px solid var(--orca-color-border)",
    borderRadius: "6px",
    background: "var(--orca-color-bg-2)",
    color: "var(--orca-color-text-1)",
    fontSize: "13px",
    resize: "vertical" as const,
    fontFamily: "inherit",
  },
  hint: {
    fontSize: "12px",
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
    marginTop: "4px",
  },
  success: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    padding: "32px 20px",
    textAlign: "center" as const,
  },
  successIcon: {
    fontSize: "48px",
    color: "#4caf50",
    marginBottom: "12px",
  },
  successText: {
    fontSize: "14px",
    color: "var(--orca-color-text-1)",
  },
  select: {
    width: "100%",
    padding: "8px 12px",
    border: "1px solid var(--orca-color-border)",
    borderRadius: "6px",
    background: "var(--orca-color-bg-2)",
    color: "var(--orca-color-text-1)",
    fontSize: "13px",
    cursor: "pointer",
  },
  prioritySelector: {
    display: "flex",
    gap: "8px",
  },
  priorityBtn: {
    flex: 1,
    padding: "8px",
    border: "1px solid var(--orca-color-border)",
    borderRadius: "6px",
    background: "transparent",
    cursor: "pointer",
    fontSize: "12px",
    transition: "all 0.15s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
  },
  priorityBtnActive: {
    borderWidth: "2px",
  },
  labelSelector: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "6px",
  },
  labelChip: {
    padding: "4px 10px",
    borderRadius: "12px",
    fontSize: "12px",
    cursor: "pointer",
    transition: "all 0.15s",
    border: "1px solid var(--orca-color-border)",
    background: "transparent",
  },
  labelChipActive: {
    background: "var(--orca-color-primary-light, rgba(59, 130, 246, 0.1))",
    borderColor: "var(--orca-color-primary)",
    color: "var(--orca-color-primary)",
  },
  row: {
    display: "flex",
    gap: "12px",
  },
  halfField: {
    flex: 1,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════════════════════════════════════

export default function TodoistAddTaskModal({
  visible,
  onClose,
  initialContent = "",
}: TodoistAddTaskModalProps) {
  const [content, setContent] = useState(initialContent);
  const [description, setDescription] = useState("");
  const [dueString, setDueString] = useState("今天");
  const [priority, setPriority] = useState(1);
  const [projectId, setProjectId] = useState("");
  const [selectedLabels, setSelectedLabels] = useState([]) as [string[], (v: any) => void];
  const [projects, setProjects] = useState([]) as [TodoistProject[], (v: any) => void];
  const [labels, setLabels] = useState([]) as [TodoistLabel[], (v: any) => void];
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const inputRef = useRef(null);

  // 加载项目和标签
  useEffect(() => {
    if (visible) {
      setContent(initialContent);
      setDescription("");
      setDueString("今天");
      setPriority(1);
      setProjectId("");
      setSelectedLabels([]);
      setError("");
      setShowSuccess(false);
      
      // 加载项目和标签
      (async () => {
        setIsLoading(true);
        try {
          const pluginName = getAiChatPluginName();
          const token = await getTodoistToken(pluginName);
          if (token) {
            const [loadedProjects, loadedLabels] = await Promise.all([
              getProjects(token),
              getLabels(token),
            ]);
            setProjects(loadedProjects);
            setLabels(loadedLabels);
          }
        } catch (err) {
          console.error("[todoist] Failed to load projects/labels:", err);
        } finally {
          setIsLoading(false);
        }
      })();
      
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible, initialContent]);

  const handleSubmit = useCallback(async () => {
    if (!content.trim()) {
      setError("请输入任务内容");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const pluginName = getAiChatPluginName();
      const token = await getTodoistToken(pluginName);
      
      if (!token) {
        setError("请先配置 Todoist API Token");
        setIsSubmitting(false);
        return;
      }

      const params: CreateTaskParams = {
        content: content.trim(),
      };

      if (description.trim()) params.description = description.trim();
      if (dueString.trim()) params.due_string = dueString.trim();
      if (priority > 1) params.priority = priority;
      if (projectId) params.project_id = projectId;
      if (selectedLabels.length > 0) params.labels = selectedLabels;

      await createTask(token, params);
      
      setShowSuccess(true);
      setTimeout(() => onClose(), 1200);
    } catch (err: any) {
      console.error("[todoist] Failed to create task:", err);
      setError(err.message || "创建失败");
    } finally {
      setIsSubmitting(false);
    }
  }, [content, description, dueString, priority, projectId, selectedLabels, onClose]);

  const handleKeyDown = useCallback((e: any) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      onClose();
    }
  }, [handleSubmit, onClose]);

  const toggleLabel = useCallback((labelName: string) => {
    setSelectedLabels((prev: string[]) => 
      prev.includes(labelName) 
        ? prev.filter((l: string) => l !== labelName)
        : [...prev, labelName]
    );
  }, []);

  if (!visible) return null;

  const priorityColors = ["var(--orca-color-text-3)", "#246fe0", "#eb8909", "#d1453b"];
  const priorityLabels = ["无", "低", "中", "高"];

  // 成功状态
  if (showSuccess) {
    return createElement(
      "div",
      { style: modalStyles.overlay, onClick: onClose },
      createElement(
        "div",
        { style: modalStyles.modal, onClick: (e: any) => e.stopPropagation() },
        createElement(
          "div",
          { style: styles.success },
          createElement("i", { className: "ti ti-circle-check", style: styles.successIcon }),
          createElement("div", { style: styles.successText }, "任务已添加！")
        )
      )
    );
  }

  return createElement(
    "div",
    { style: modalStyles.overlay, onClick: onClose },
    createElement(
      "div",
      { style: modalStyles.modal, onClick: (e: any) => e.stopPropagation(), onKeyDown: handleKeyDown },
      // Header
      createElement(
        "div",
        { style: modalStyles.header },
        createElement(
          "div",
          { style: modalStyles.title },
          createElement("i", { className: "ti ti-plus", style: { color: "var(--orca-color-primary)" } }),
          "添加任务"
        ),
        createElement(
          "button",
          { style: modalStyles.closeBtn, onClick: onClose },
          createElement("i", { className: "ti ti-x" })
        )
      ),
      // Form
      createElement(
        "div",
        { style: styles.form },
        // 任务内容
        createElement(
          "div",
          { style: styles.field },
          createElement("label", { style: styles.label }, "任务内容 *"),
          createElement(Input, {
            ref: inputRef,
            style: styles.input,
            placeholder: "例如：买牛奶",
            value: content,
            onChange: (e: any) => setContent(e.target.value),
          })
        ),
        // 描述
        createElement(
          "div",
          { style: styles.field },
          createElement("label", { style: styles.label }, "描述"),
          createElement("textarea", {
            style: styles.textarea,
            placeholder: "添加更多详情...",
            value: description,
            onChange: (e: any) => setDescription(e.target.value),
            rows: 2,
          })
        ),
        // 日期和项目（一行）
        createElement(
          "div",
          { style: styles.row },
          createElement(
            "div",
            { style: { ...styles.field, ...styles.halfField } },
            createElement("label", { style: styles.label }, "截止日期"),
            createElement(Input, {
              style: styles.input,
              placeholder: "例如：明天",
              value: dueString,
              onChange: (e: any) => setDueString(e.target.value),
            })
          ),
          createElement(
            "div",
            { style: { ...styles.field, ...styles.halfField } },
            createElement("label", { style: styles.label }, "项目"),
            createElement(
              "select",
              {
                style: styles.select,
                value: projectId,
                onChange: (e: any) => setProjectId(e.target.value),
                disabled: isLoading,
              },
              createElement("option", { value: "" }, "收件箱"),
              projects.filter(p => !p.is_inbox_project).map(p => 
                createElement("option", { key: p.id, value: p.id }, p.name)
              )
            )
          )
        ),
        // 优先级
        createElement(
          "div",
          { style: styles.field },
          createElement("label", { style: styles.label }, "优先级"),
          createElement(
            "div",
            { style: styles.prioritySelector },
            [1, 2, 3, 4].map(p => createElement(
              "button",
              {
                key: p,
                type: "button",
                style: {
                  ...styles.priorityBtn,
                  ...(priority === p ? styles.priorityBtnActive : {}),
                  borderColor: priority === p ? priorityColors[p - 1] : undefined,
                  color: priority === p ? priorityColors[p - 1] : "var(--orca-color-text-2)",
                },
                onClick: () => setPriority(p),
              },
              createElement("span", { 
                style: { 
                  width: "8px", 
                  height: "8px", 
                  borderRadius: "50%", 
                  background: priorityColors[p - 1],
                  opacity: priority === p ? 1 : 0.5,
                } 
              }),
              priorityLabels[p - 1]
            ))
          )
        ),
        // 标签
        labels.length > 0 && createElement(
          "div",
          { style: styles.field },
          createElement("label", { style: styles.label }, "标签"),
          createElement(
            "div",
            { style: styles.labelSelector },
            labels.map(label => createElement(
              "button",
              {
                key: label.id,
                type: "button",
                style: {
                  ...styles.labelChip,
                  ...(selectedLabels.includes(label.name) ? styles.labelChipActive : {}),
                },
                onClick: () => toggleLabel(label.name),
              },
              label.name
            ))
          )
        ),
        // 提示
        createElement(
          "div",
          { style: styles.hint },
          "日期支持自然语言，如「明天」「下周一」「3月15日 14:00」"
        ),
        // 错误提示
        error && createElement("div", { style: styles.error }, error),
        // 按钮
        createElement(
          "div",
          { style: styles.actions },
          createElement(
            Button,
            { variant: "outline", onClick: onClose },
            "取消"
          ),
          createElement(
            Button,
            {
              variant: "solid",
              onClick: handleSubmit,
              disabled: !content.trim() || isSubmitting,
            },
            isSubmitting ? "添加中..." : "添加任务"
          )
        )
      )
    )
  );
}
