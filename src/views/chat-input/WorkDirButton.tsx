/**
 * WorkDirButton - 本机 AI 的工作文件夹选择（每个对话单独选）
 * 按钮显示文件夹末级名；点开可粘贴路径、点选最近用过、或清除回中转默认文件夹
 */

import { modelButtonStyle, modelLabelStyle, menuContainerStyle, measureMenu } from "./chat-input-styles";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
};
const { createElement, useState } = React;

const { Button, ContextMenu } = orca.components;

const RECENT_KEY = "ai-chat-local-cli-recent-workdirs";
const RECENT_MAX = 5;

/** 最近用过的文件夹只是便利：读写失败当作没有 */
function loadRecent(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(list) ? list.filter((d) => typeof d === "string" && d).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function rememberRecent(dir: string): void {
  try {
    const next = [dir, ...loadRecent().filter((d) => d !== dir)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}

function folderName(dir: string): string {
  return dir.replace(/\/+$/, "").split("/").pop() || dir;
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "6px 8px",
  fontSize: 12,
  borderRadius: 6,
  border: "1px solid var(--orca-color-border)",
  background: "var(--orca-color-bg-2)",
  color: "var(--orca-color-text-1)",
  outline: "none",
};

const itemStyle = {
  padding: "6px 8px",
  borderRadius: 6,
  fontSize: 12,
  cursor: "pointer",
  color: "var(--orca-color-text-2)",
  overflow: "hidden" as const,
  textOverflow: "ellipsis" as const,
  whiteSpace: "nowrap" as const,
};

const sectionTitleStyle = { fontSize: 11, fontWeight: 600, color: "var(--orca-color-text-3)", margin: "10px 0 4px" };

type MenuProps = {
  workDir?: string;
  onChange: (dir: string | undefined) => void;
  close: () => void;
  width: number;
};

// 按下就生效：Orca 弹层在按下后不再接收指针，松开落到页面上，click 不会触发（实测 mouseup 目标是 HTML）
const pick = (fn: () => void) => (e: any) => {
  if (e.button !== 0) return;
  e.preventDefault();
  fn();
};

function WorkDirMenu({ workDir, onChange, close, width }: MenuProps) {
  const [draft, setDraft] = useState(workDir ?? "");
  const [recent] = useState(loadRecent);

  const choose = (raw: string) => {
    const dir = raw.trim();
    if (dir) rememberRecent(dir);
    onChange(dir || undefined);
    close();
  };

  return createElement(
    "div",
    { style: { ...menuContainerStyle, padding: 12, width } },
    createElement("div", { style: { ...sectionTitleStyle, marginTop: 0 } }, "本机 AI 在哪个文件夹里工作"),
    createElement(
      "div",
      { style: { display: "flex", gap: 6 } },
      createElement("input", {
        autoFocus: true,
        value: draft,
        placeholder: "粘贴文件夹路径，如 ~/Projects/demo",
        onChange: (e: any) => setDraft(e.target.value),
        onKeyDown: (e: any) => {
          if (e.nativeEvent?.isComposing || e.keyCode === 229) return;
          if (e.key === "Enter") {
            e.preventDefault();
            choose(draft);
          }
        },
        style: { ...inputStyle, flex: 1, minWidth: 0 },
      }),
      createElement(Button, { variant: "solid", onMouseDown: pick(() => choose(draft)) }, "确定"),
    ),
    recent.length > 0 && createElement("div", { style: sectionTitleStyle }, "最近用过"),
    ...recent.map((dir) =>
      createElement(
        "div",
        {
          key: dir,
          title: dir,
          style: { ...itemStyle, background: dir === workDir ? "var(--orca-color-bg-3)" : undefined },
          onMouseDown: pick(() => choose(dir)),
        },
        dir,
      ),
    ),
    createElement(
      "div",
      {
        style: { ...itemStyle, marginTop: 8, borderTop: "1px solid var(--orca-color-border)", borderRadius: 0, paddingTop: 8 },
        onMouseDown: pick(() => choose("")),
      },
      createElement("i", { className: "ti ti-arrow-back-up", style: { marginRight: 6 } }),
      "用默认文件夹",
    ),
  );
}

type Props = {
  workDir?: string;
  onChange: (dir: string | undefined) => void;
};

export default function WorkDirButton({ workDir, onChange }: Props) {
  const [menuLayout, setMenuLayout] = useState<{ width: number; alignment: "left" | "right" }>({ width: 320, alignment: "left" });
  const dir = workDir?.trim();

  return createElement(
    ContextMenu as any,
    {
      defaultPlacement: "top",
      placement: "vertical",
      alignment: menuLayout.alignment,
      allowBeyondContainer: true,
      offset: 8,
      menu: (close: () => void) =>
        createElement(WorkDirMenu, { workDir: dir, onChange, close, width: menuLayout.width }),
    },
    // 用原生 title，不用 withTooltip：浮层提示会盖在菜单底部「用默认文件夹」上，点不到
    (openMenu: (e: any) => void) =>
      createElement(
        Button,
        {
          variant: "plain",
          title: dir ? `本机 AI 工作文件夹：${dir}` : "本机 AI 工作文件夹：中转配置里的默认文件夹",
          onClick: (e: any) => {
            setMenuLayout(measureMenu(e.currentTarget, "left", 220, 360));
            openMenu(e);
          },
          style: modelButtonStyle,
        },
        createElement("i", { className: "ti ti-folder" }),
        createElement("span", { style: { ...modelLabelStyle, maxWidth: 120 } }, dir ? folderName(dir) : "默认文件夹"),
      ),
  );
}
