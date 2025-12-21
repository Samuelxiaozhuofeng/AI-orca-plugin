/**
 * ModelSelectorButton - 模型选择器触发按钮
 * 显示当前选中的模型，点击打开模型选择菜单
 */

import type { AiModelOption } from "../../settings/ai-chat-settings";
import { modelButtonStyle, modelLabelStyle } from "./chat-input-styles";
import ModelSelectorMenu from "./ModelSelectorMenu";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useMemo: <T>(fn: () => T, deps: any[]) => T;
};
const { createElement, useMemo } = React;

const { Button, ContextMenu } = orca.components;

type Props = {
  modelOptions: AiModelOption[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  onAddModel?: (model: string) => void | Promise<void>;
};

export default function ModelSelectorButton({
  modelOptions,
  selectedModel,
  onModelChange,
  onAddModel,
}: Props) {
  const selectedModelLabel = useMemo(() => {
    const hit = modelOptions.find((o) => o.value === selectedModel);
    return hit?.label || selectedModel || "Select model";
  }, [modelOptions, selectedModel]);

  return createElement(
    ContextMenu as any,
    {
      defaultPlacement: "top",
      placement: "vertical",
      alignment: "right",
      allowBeyondContainer: true,
      offset: 8,
      menu: (close: () => void) =>
        createElement(ModelSelectorMenu, {
          modelOptions,
          selectedModel,
          onModelChange,
          onAddModel,
          close,
        }),
    },
    (openMenu: (e: any) => void) =>
      createElement(
        Button,
        {
          variant: "plain",
          onClick: openMenu,
          title: `Model: ${selectedModel}`,
          style: modelButtonStyle,
        },
        createElement("i", { className: "ti ti-cpu" }),
        createElement("span", { style: modelLabelStyle }, selectedModelLabel),
        createElement("i", { className: "ti ti-chevron-up" })
      )
  );
}
