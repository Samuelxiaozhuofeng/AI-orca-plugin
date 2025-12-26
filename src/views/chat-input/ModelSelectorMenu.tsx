/**
 * ModelSelectorMenu - 模型选择器菜单组件
 * 包含模型过滤、分组显示、添加自定义模型功能
 */

import type { AiModelOption } from "../../settings/ai-chat-settings";
import {
  menuContainerStyle,
  menuFlexStyle,
  modelListPanelStyle,
  modelListScrollStyle,
  addModelPanelStyle,
  addModelTitleStyle,
  addModelHintStyle,
} from "./chat-input-styles";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useMemo: <T>(fn: () => T, deps: any[]) => T;
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
};
const { createElement, useState, useMemo, useCallback } = React;

const { Button, Menu, MenuText, MenuTitle, MenuSeparator, Input } = orca.components;

type ModelGroup = {
  group: string;
  options: AiModelOption[];
};

type Props = {
  modelOptions: AiModelOption[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  onAddModel?: (model: string) => void | Promise<void>;
  close: () => void;
};

/**
 * 对模型列表进行分组和过滤
 */
function useModelGroups(modelOptions: AiModelOption[], filterQuery: string): ModelGroup[] {
  return useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    
    // 过滤模型
    const filtered = q
      ? modelOptions.filter((o) => {
          const label = (o.label || "").toLowerCase();
          const value = (o.value || "").toLowerCase();
          return label.includes(q) || value.includes(q);
        })
      : modelOptions;

    // 分组模型
    const order = ["Built-in", "Custom", "Other"];
    const grouped = new Map<string, AiModelOption[]>();
    
    for (const opt of filtered) {
      const g = opt.group || "Other";
      const arr = grouped.get(g);
      if (arr) arr.push(opt);
      else grouped.set(g, [opt]);
    }

    // 按预定义顺序排列分组
    const keys = [
      ...order.filter((k) => grouped.has(k)),
      ...[...grouped.keys()].filter((k) => !order.includes(k)).sort(),
    ];

    return keys.map((k) => ({ group: k, options: grouped.get(k) || [] }));
  }, [modelOptions, filterQuery]);
}

/**
 * 模型列表面板
 */
function ModelListPanel({
  modelGroups,
  selectedModel,
  onModelChange,
  modelFilter,
  onFilterChange,
  close,
}: {
  modelGroups: ModelGroup[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  modelFilter: string;
  onFilterChange: (value: string) => void;
  close: () => void;
}) {
  const menuItems: any[] = [];

  if (modelGroups.length === 0) {
    menuItems.push(
      createElement(MenuText as any, {
        key: "empty",
        title: "No models found",
        disabled: true,
      })
    );
  } else {
    for (let i = 0; i < modelGroups.length; i++) {
      const { group, options } = modelGroups[i];
      
      menuItems.push(
        createElement(MenuTitle as any, { key: `t:${group}`, title: group })
      );
      
      menuItems.push(
        ...options.map((opt) => {
          const isSelected = opt.value === selectedModel;
          const subtitle = opt.label === opt.value ? undefined : opt.value;
          return createElement(MenuText as any, {
            key: opt.value,
            title: opt.label,
            subtitle,
            postIcon: isSelected ? "ti ti-check" : undefined,
            onClick: () => {
              if (opt.value !== selectedModel) onModelChange(opt.value);
              close();
            },
          });
        })
      );

      if (i !== modelGroups.length - 1) {
        menuItems.push(
          createElement(MenuSeparator as any, { key: `s:${group}` })
        );
      }
    }
  }

  return createElement(
    "div",
    { style: modelListPanelStyle },
    createElement(Input as any, {
      placeholder: "Filter models…",
      value: modelFilter,
      onChange: (e: any) => onFilterChange(e.target.value),
      pre: createElement("i", { className: "ti ti-search" }),
      style: { width: "100%", maxWidth: "100%", boxSizing: "border-box" },
    }),
    createElement(
      "div",
      { style: modelListScrollStyle },
      createElement(Menu as any, { 
        keyboardNav: true, 
        navDirection: "vertical", 
        style: { width: "100%", borderRadius: 0, background: "transparent" } 
      }, ...menuItems)
    )
  );
}

/**
 * 添加模型面板
 */
function AddModelPanel({
  modelDraft,
  onDraftChange,
  onAdd,
  isAdding,
}: {
  modelDraft: string;
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  isAdding: boolean;
}) {
  return createElement(
    "div",
    { style: addModelPanelStyle },
    createElement("div", { style: addModelTitleStyle }, "Add model"),
    createElement(Input as any, {
      placeholder: "e.g. gpt-4.1-mini",
      value: modelDraft,
      onChange: (e: any) => onDraftChange(e.target.value),
      onKeyDown: (e: any) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onAdd();
        }
      },
      pre: createElement("i", { className: "ti ti-plus" }),
      style: { width: "100%", maxWidth: "100%", boxSizing: "border-box", overflow: "hidden", minWidth: 0 },
    }),
    createElement(
      Button,
      {
        variant: "solid",
        disabled: isAdding || !modelDraft.trim(),
        onClick: onAdd,
        style: { marginTop: 8, width: "100%", boxSizing: "border-box" },
      },
      isAdding ? "Adding..." : "Add"
    ),
    createElement("div", { style: addModelHintStyle }, "Models share the same API URL/Key (for now).")
  );
}

/**
 * ModelSelectorMenu - 主组件
 */
export default function ModelSelectorMenu({
  modelOptions,
  selectedModel,
  onModelChange,
  onAddModel,
  close,
}: Props) {
  const [modelFilter, setModelFilter] = useState("");
  const [modelDraft, setModelDraft] = useState("");
  const [addingModel, setAddingModel] = useState(false);

  const modelGroups = useModelGroups(modelOptions, modelFilter);

  const handleAddModel = useCallback(async () => {
    const next = modelDraft.trim();
    if (!next) return;

    // If already exists, just select it.
    if (modelOptions.some((o) => o.value === next)) {
      onModelChange(next);
      setModelDraft("");
      close();
      return;
    }

    if (!onAddModel) {
      onModelChange(next);
      setModelDraft("");
      close();
      return;
    }

    try {
      setAddingModel(true);
      await onAddModel(next);
      onModelChange(next);
      setModelDraft("");
      close();
    } finally {
      setAddingModel(false);
    }
  }, [modelDraft, modelOptions, onAddModel, onModelChange, close]);

  return createElement(
    "div",
    { style: menuContainerStyle },
    createElement(
      "div",
      { style: menuFlexStyle },
      createElement(ModelListPanel, {
        modelGroups,
        selectedModel,
        onModelChange,
        modelFilter,
        onFilterChange: setModelFilter,
        close,
      }),
      createElement(AddModelPanel, {
        modelDraft,
        onDraftChange: setModelDraft,
        onAdd: handleAddModel,
        isAdding: addingModel,
      })
    )
  );
}
