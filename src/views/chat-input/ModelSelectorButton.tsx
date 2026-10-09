/**
 * ModelSelectorButton - 模型选择器触发按钮
 * 显示当前选中的模型，点击打开模型选择菜单
 */

import type { AiChatSettings } from "../../settings/ai-chat-settings";
import { getSelectedProvider, getSelectedModel } from "../../settings/ai-chat-settings";
import { modelButtonStyle, modelLabelStyle, measureMenu } from "./chat-input-styles";
import ModelSelectorMenu from "./ModelSelectorMenu";
import { withTooltip } from "../../utils/orca-tooltip";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useMemo: <T>(fn: () => T, deps: any[]) => T;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
};
const { createElement, useMemo, useState } = React;

const { Button, ContextMenu } = orca.components;

type Props = {
  settings: AiChatSettings;
  onSelect: (providerId: string, modelId: string) => void;
  onUpdateSettings: (settings: AiChatSettings) => void;
};

export default function ModelSelectorButton({
  settings,
  onSelect,
  onUpdateSettings,
}: Props) {
  const [menuLayout, setMenuLayout] = useState<{ width: number; alignment: "left" | "right" }>({ width: 360, alignment: "left" });
  const displayInfo = useMemo(() => {
    const provider = getSelectedProvider(settings);
    const model = getSelectedModel(settings);
    
    const modelLabel = model?.label || model?.id || settings.selectedModelId || "选择模型";
    const providerName = provider?.name || "";
    const hasApiKey = provider?.apiKey && provider.apiKey.trim().length > 0;
    
    return { modelLabel, providerName, hasApiKey };
  }, [settings]);

  return createElement(
    ContextMenu as any,
    {
      defaultPlacement: "top",
      placement: "vertical",
      alignment: menuLayout.alignment,
      allowBeyondContainer: true,
      offset: 8,
      menu: (close: () => void) =>
        createElement(ModelSelectorMenu, {
          settings,
          selectedProviderId: settings.selectedProviderId,
          selectedModelId: settings.selectedModelId,
          onSelect,
          onUpdateSettings,
          close,
          width: menuLayout.width,
        }),
    },
    (openMenu: (e: any) => void) =>
      withTooltip(
        `${displayInfo.providerName}: ${settings.selectedModelId}`,
        createElement(
          Button,
          {
            variant: "plain",
            onClick: (e: any) => {
              setMenuLayout(measureMenu(e.currentTarget, "left", 240, 420));
              openMenu(e);
            },
            style: {
              ...modelButtonStyle,
              borderColor: displayInfo.hasApiKey ? undefined : "var(--orca-color-warning)",
            },
          },
          createElement("i", { className: "ti ti-cpu" }),
          createElement(
            "span",
            { style: modelLabelStyle },
            displayInfo.modelLabel
          ),
          !displayInfo.hasApiKey && withTooltip(
            "未配置 API 密钥",
            createElement(
              "i",
              { 
                className: "ti ti-alert-triangle", 
                style: { color: "var(--orca-color-warning)", fontSize: "12px" },
              }
            )
          ),
          createElement("i", { className: "ti ti-chevron-up" })
        )
      )
  );
}
