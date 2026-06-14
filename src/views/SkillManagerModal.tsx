/**
 * Skill Manager Modal — 全面重构版
 *
 * 布局：
 * - Tab 导航：全部 | 内置 | 全局 | 局部
 * - 卡片网格（2-3列自适应）
 * - 每张卡片：名称、描述（两行截断）、标签 chips、作用域徽章、toggle 开关
 * - 点击卡片展开编辑侧栏
 * - 块技能只读，提示跳转到源块
 */

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useMemo: <T>(fn: () => T, deps: any[]) => T;
};
const { createElement, useState, useEffect, useCallback, useMemo } = React;
const { Button } = orca.components;

import { withTooltip } from "../utils/orca-tooltip";
import {
  listSkills,
  getSkill,
  createSkill,
  updateSkill,
  deleteSkill,
  exportSkill,
  importSkill,
  setSkillMode,
} from "../services/ai/skills-manager";
import type { Skill, SkillRef, SkillScope, SkillMode } from "../types/skills";
import MarkdownMessage from "../components/MarkdownMessage";

const SKILL_NAME_MAX_LENGTH = 100;
const SKILL_DESCRIPTION_MAX_LENGTH = 500;

type ScopeTab = "all" | "internal" | "global" | "local";

const SCOPE_TABS: Array<{ key: ScopeTab; label: string; icon: string }> = [
  { key: "all", label: "全部", icon: "ti ti-apps" },
  { key: "local", label: "内置", icon: "ti ti-puzzle" },
  { key: "internal", label: "局部", icon: "ti ti-file-text" },
  { key: "global", label: "全局", icon: "ti ti-world" },
];

const SCOPE_BADGE: Record<SkillScope, { label: string; icon: string; color: string }> = {
  internal: { label: "局部", icon: "ti ti-file-text", color: "var(--orca-color-warning, #f59e0b)" },
  global: { label: "全局", icon: "ti ti-world", color: "var(--orca-color-success, #10b981)" },
  local: { label: "内置", icon: "ti ti-puzzle", color: "var(--orca-color-primary)" },
};

interface SkillManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SkillManagerModal({ isOpen, onClose }: SkillManagerModalProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<ScopeTab>("all");

  // 编辑侧栏
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editInstruction, setEditInstruction] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // 创建弹窗
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createInstruction, setCreateInstruction] = useState("");
  const [createScope, setCreateScope] = useState<"global" | "local">("local");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);

  // 导入
  const [importPending, setImportPending] = useState<any[] | null>(null);
  const [importScope, setImportScope] = useState<"global" | "local">("local");
  const [importLoading, setImportLoading] = useState(false);

  // 导出选择
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) loadSkills();
  }, [isOpen]);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 100));
      const refs = await listSkills();
      const data: Skill[] = [];
      for (const ref of refs) {
        const skill = await getSkill(ref.id, ref.scope === "global");
        if (skill) data.push(skill);
      }
      setSkills(data);
    } catch (err) {
      console.error("[SkillManager] load failed:", err);
      orca.notify("error", "加载技能列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  // 过滤 + 搜索
  const filteredSkills = useMemo(() => {
    let list = skills;
    if (activeTab !== "all") list = list.filter((s) => s.scope === activeTab);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q)
      );
    }
    // 排序：内置(local) → 局部(internal) → 全局(global)
    const order: Record<string, number> = { local: 0, internal: 1, global: 2 };
    list = [...list].sort((a, b) => (order[a.scope] ?? 3) - (order[b.scope] ?? 3));
    return list;
  }, [skills, activeTab, searchQuery]);

  // ─── Mode 切换 ───
  const handleModeChange = useCallback(
    async (skill: Skill, newMode: SkillMode) => {
      await setSkillMode(skill.id, newMode, skill.scope);
      setSkills((prev) =>
        prev.map((s) =>
          s.id === skill.id && s.scope === skill.scope
            ? { ...s, mode: newMode }
            : s
        )
      );
    },
    []
  );

  // ─── 编辑侧栏 ───
  const openEditor = useCallback((skill: Skill) => {
    setEditingSkill(skill);
    setEditName(skill.name);
    setEditDesc(skill.description || "");
    setEditInstruction(skill.instruction);
    setEditError(null);
  }, []);

  const closeEditor = useCallback(() => {
    setEditingSkill(null);
    setEditError(null);
  }, []);

  const saveEditor = useCallback(async () => {
    if (!editingSkill) return;
    const name = editName.trim();
    if (!name) { setEditError("请输入技能名称"); return; }
    if (name.length > SKILL_NAME_MAX_LENGTH) {
      setEditError(`名称不能超过 ${SKILL_NAME_MAX_LENGTH} 字符`); return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await updateSkill(
        editingSkill.id,
        { name, description: editDesc },
        editInstruction,
        editingSkill.scope === "global"
      );
      await loadSkills();
      closeEditor();
      orca.notify("success", "技能已保存");
    } catch (err: any) {
      setEditError(err?.message ?? "保存失败");
    } finally {
      setEditSaving(false);
    }
  }, [editingSkill, editName, editDesc, editInstruction, loadSkills, closeEditor]);

  // ─── 删除 ───
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteSkill(deleteTarget.id, deleteTarget.scope === "global");
      await loadSkills();
      orca.notify("success", "技能已删除");
    } catch (err: any) {
      orca.notify("error", err?.message ?? "删除失败");
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, loadSkills]);

  // ─── 创建 ───
  const handleCreate = useCallback(async () => {
    const name = createName.trim();
    if (!name) { setCreateError("请输入技能名称"); return; }
    setCreateLoading(true);
    setCreateError(null);
    try {
      await createSkill(name, { name, description: createDesc }, createInstruction, createScope === "global");
      await loadSkills();
      setShowCreate(false);
      setCreateName("");
      setCreateDesc("");
      setCreateInstruction("");
      orca.notify("success", `技能已创建 (${createScope === "global" ? "全局" : "内置"})`);
    } catch (err: any) {
      setCreateError(err?.message ?? "创建失败");
    } finally {
      setCreateLoading(false);
    }
  }, [createName, createDesc, createInstruction, createScope, loadSkills]);

  // ─── 导出 ───
  const handleExport = useCallback(async () => {
    const selected = skills.filter((s) => selectedIds.has(`${s.scope}:${s.id}`));
    if (selected.length === 0) return;
    if (selected.length === 1) {
      const s = selected[0];
      const content = await exportSkill(s.id, s.scope === "global");
      if (!content) { orca.notify("error", "导出失败"); return; }
      const blob = new Blob([content], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${s.name}.json`;
      a.click();
      return;
    }
    const items: any[] = [];
    for (const s of selected) {
      const content = await exportSkill(s.id, s.scope === "global");
      if (content) items.push(JSON.parse(content));
    }
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `skills-${Date.now()}.json`;
    a.click();
  }, [skills, selectedIds]);

  // ─── 导入 ───
  const handleImportPick = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        setImportPending(Array.isArray(data) ? data : [data]);
        setImportScope("local");
      } catch (err: any) {
        orca.notify("error", "解析文件失败");
      }
    };
    input.click();
  }, []);

  const handleImportConfirm = useCallback(async () => {
    if (!importPending) return;
    setImportLoading(true);
    let count = 0;
    try {
      for (const item of importPending) {
        const skillName = item.metadata?.name || item.name || item.id;
        if (!skillName) continue;
        const ok = await importSkill(skillName, JSON.stringify(item), importScope === "global");
        if (ok) count++;
      }
      await loadSkills();
      if (count > 0) orca.notify("success", `成功导入 ${count} 个技能`);
      else orca.notify("warn", "没有技能被导入");
    } catch (err: any) {
      orca.notify("error", err?.message ?? "导入失败");
    } finally {
      setImportPending(null);
      setImportLoading(false);
    }
  }, [importPending, importScope, loadSkills]);

  // ─── 跳转到块 ───
  const handleJumpToBlock = useCallback((skill: Skill) => {
    if (skill.blockSource?.blockId) {
      try {
        orca.nav.goTo("block", { blockId: skill.blockSource.blockId });
      } catch {
        // Fallback: try backend invoke
        try { orca.invokeBackend("navigate-to-block", skill.blockSource.blockId); } catch {}
      }
    }
  }, []);

  // ─── 查看技能详情 ───
  const handleViewSkill = useCallback((skill: Skill) => {
    if (skill.sourceType === "block") {
      handleJumpToBlock(skill);
    } else {
      openEditor(skill);
    }
  }, [handleJumpToBlock, openEditor]);

  if (!isOpen) return null;

  // ════════════════════════════════════════════════════════════
  // Styles
  // ════════════════════════════════════════════════════════════

  const overlayStyle: React.CSSProperties = {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.45)", display: "flex",
    alignItems: "center", justifyContent: "center", zIndex: 50,
  };

  const modalStyle: React.CSSProperties = {
    background: "var(--orca-color-bg-1)", borderRadius: "var(--orca-radius-lg, 12px)",
    padding: 24, width: "min(900px, 94vw)", maxHeight: "90vh",
    display: "flex", flexDirection: "column",
    boxShadow: "0 12px 40px rgba(0,0,0,0.2)", zIndex: 1,
  };

  const tabBarStyle: React.CSSProperties = {
    display: "flex", gap: 4, marginTop: 16,
    borderBottom: "1px solid var(--orca-color-border)", paddingBottom: 8,
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "6px 14px", borderRadius: "var(--orca-radius-sm, 4px)",
    fontSize: 13, fontWeight: active ? 600 : 400,
    cursor: "pointer", border: "none",
    background: active ? "var(--orca-color-bg-3)" : "transparent",
    color: active ? "var(--orca-color-primary)" : "var(--orca-color-text-2)",
    display: "flex", alignItems: "center", gap: 6,
    transition: "all 0.15s ease",
  });

  const cardGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 12, marginTop: 12, flex: 1,
    overflowY: "auto", paddingRight: 4,
  };

  const cardStyle: React.CSSProperties = {
    background: "var(--orca-color-bg-2)", borderRadius: "var(--orca-radius-md, 8px)",
    border: "1px solid var(--orca-color-border)", padding: 14,
    cursor: "pointer", display: "flex", flexDirection: "column", gap: 8,
    transition: "all 0.15s ease", position: "relative",
  };

  const scopeBadgeStyle = (scope: SkillScope): React.CSSProperties => ({
    fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 100,
    color: SCOPE_BADGE[scope].color,
    background: `color-mix(in srgb, ${SCOPE_BADGE[scope].color} 12%, transparent)`,
    display: "inline-flex", alignItems: "center", gap: 3,
    width: "fit-content",
  });

  const tagChipStyle: React.CSSProperties = {
    fontSize: 10, padding: "1px 6px", borderRadius: 100,
    background: "var(--orca-color-bg-3)", color: "var(--orca-color-text-3)",
    whiteSpace: "nowrap",
  };

  const searchInputStyle: React.CSSProperties = {
    flex: 1, padding: "8px 12px", borderRadius: "var(--orca-radius-sm, 4px)",
    border: "1px solid var(--orca-color-border)",
    background: "var(--orca-color-bg-2)", color: "var(--orca-color-text-1)",
    fontSize: 13, outline: "none", minWidth: 0,
  };

  const editOverlayStyle: React.CSSProperties = {
    ...overlayStyle, zIndex: 60,
  };

  const editDrawerStyle: React.CSSProperties = {
    background: "var(--orca-color-bg-1)", width: "min(700px, 94vw)",
    maxHeight: "92vh", borderRadius: "var(--orca-radius-lg, 12px)",
    padding: 24, display: "flex", flexDirection: "column",
    boxShadow: "0 12px 40px rgba(0,0,0,0.25)", overflow: "hidden",
  };

  // ─── 三态分段控件 ───
  const modeControlStyle: React.CSSProperties = {
    display: "flex", borderRadius: "var(--orca-radius-sm, 4px)",
    border: "1px solid var(--orca-color-border)",
    overflow: "hidden", flexShrink: 0,
  };

  const modeOptionStyle = (active: boolean): React.CSSProperties => ({
    padding: "3px 6px", fontSize: 11, cursor: "pointer",
    border: "none", lineHeight: 1,
    background: active ? "var(--orca-color-primary)" : "transparent",
    color: active ? "#fff" : "var(--orca-color-text-3)",
    transition: "all 0.15s ease",
    display: "flex", alignItems: "center", gap: 2,
  });

  const renderModeControl = (skill: Skill) =>
    createElement(
      "div",
      { style: modeControlStyle, onClick: (e: any) => e.stopPropagation() },
      createElement(
        "button",
        { style: modeOptionStyle(skill.mode === "auto"), onClick: () => handleModeChange(skill, "auto"), title: "自动执行" },
        createElement("i", { className: "ti ti-bolt", style: { fontSize: 12 } })
      ),
      createElement(
        "button",
        { style: modeOptionStyle(skill.mode === "ask"), onClick: () => handleModeChange(skill, "ask"), title: "询问用户" },
        createElement("i", { className: "ti ti-help", style: { fontSize: 12 } })
      ),
      createElement(
        "button",
        { style: modeOptionStyle(skill.mode === "disabled"), onClick: () => handleModeChange(skill, "disabled"), title: "禁用" },
        createElement("i", { className: "ti ti-ban", style: { fontSize: 12 } })
      )
    );

  // ════════════════════════════════════════════════════════════
  // Render helpers
  // ════════════════════════════════════════════════════════════

  const renderCard = (skill: Skill) => {
    const badge = SCOPE_BADGE[skill.scope];
    const isSelected = selectedIds.has(`${skill.scope}:${skill.id}`);

    return createElement(
      "div",
      {
        key: `${skill.scope}:${skill.id}`,
        style: {
          ...cardStyle,
          borderColor: isSelected ? "var(--orca-color-primary)" : "var(--orca-color-border)",
        },
        onClick: () => handleViewSkill(skill),
      },
      // 头行：图标 + 名称 + 开关
      createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 8 } },
        createElement("i", {
          className: badge.icon,
          style: { fontSize: 16, color: badge.color },
        }),
        createElement(
          "div",
          { style: { fontSize: 14, fontWeight: 600, color: "var(--orca-color-text-1)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
          skill.name
        ),
        // 三态模式切换
        renderModeControl(skill)
      ),
      // 描述（两行截断）
      skill.description &&
        createElement(
          "div",
          {
            style: {
              fontSize: 12, color: "var(--orca-color-text-3)", lineHeight: 1.4,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              overflow: "hidden",
            },
          },
          skill.description
        ),
      // 作用域徽章 + 块来源
      createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" } },
        createElement(
          "div",
          { style: scopeBadgeStyle(skill.scope) },
          createElement("i", { className: badge.icon, style: { fontSize: 10 } }),
          badge.label
        ),
        skill.blockSource &&
          createElement(
            "div",
            {
              style: {
                fontSize: 10, color: "var(--orca-color-text-4)",
                display: "flex", alignItems: "center", gap: 2,
              },
            },
            `块 #${skill.blockSource.blockId}`
          ),
        skill.mode === "disabled" &&
          createElement(
            "div",
            {
              style: {
                fontSize: 10, color: "var(--orca-color-text-4)",
                fontStyle: "italic", marginLeft: "auto",
              },
            },
            "已禁用"
          ),
        skill.mode === "ask" &&
          createElement(
            "div",
            {
              style: {
                fontSize: 10, color: "var(--orca-color-warning, #f59e0b)",
                fontStyle: "italic", marginLeft: "auto",
              },
            },
            "需确认"
          )
      ),
      // 标签 chips
      skill.tags && skill.tags.length > 0 &&
        createElement(
          "div",
          { style: { display: "flex", gap: 4, flexWrap: "wrap" } },
          ...skill.tags.slice(0, 4).map((t) =>
            createElement("span", { key: t, style: tagChipStyle }, t)
          ),
          skill.tags.length > 4 &&
            createElement("span", { style: tagChipStyle }, `+${skill.tags.length - 4}`)
        ),
      // 块技能操作
      skill.sourceType === "block" &&
        createElement(
          "button",
          {
            onClick: (e: any) => { e.stopPropagation(); handleJumpToBlock(skill); },
            style: {
              marginTop: 4, padding: "4px 10px", borderRadius: "var(--orca-radius-sm, 4px)",
              border: "1px solid var(--orca-color-border)", background: "var(--orca-color-bg-1)",
              color: "var(--orca-color-text-2)", fontSize: 11, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 4, width: "fit-content",
            },
          },
          createElement("i", { className: "ti ti-arrow-up-right", style: { fontSize: 12 } }),
          "跳转到源块"
        )
    );
  };

  // ════════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════════

  return createElement(
    "div",
    { style: overlayStyle, onClick: onClose },
    // ── 主弹窗 ──
    createElement(
      "div",
      { style: modalStyle, onClick: (e: any) => e.stopPropagation() },

      // Header
      createElement(
        "div",
        { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
        createElement("div", { style: { fontSize: 18, fontWeight: 600, color: "var(--orca-color-text-1)" } }, "技能管理"),
        withTooltip(
          "关闭",
          createElement(Button, { variant: "plain", onClick: onClose },
            createElement("i", { className: "ti ti-x" })
          )
        )
      ),

      // Toolbar: 搜索 + 操作
      createElement(
        "div",
        { style: { display: "flex", gap: 8, marginTop: 12, alignItems: "center" } },
        createElement("i", { className: "ti ti-search", style: { fontSize: 14, color: "var(--orca-color-text-3)" } }),
        createElement("input", {
          value: searchQuery,
          onChange: (e: any) => setSearchQuery(e.target.value),
          style: searchInputStyle,
          placeholder: "搜索技能...",
        }),
        withTooltip(
          "新建技能",
          createElement(Button, { variant: "secondary", onClick: () => setShowCreate(true) },
            createElement("i", { className: "ti ti-plus" })
          )
        ),
        withTooltip(
          "导入技能",
          createElement(Button, { variant: "plain", onClick: handleImportPick },
            createElement("i", { className: "ti ti-upload" })
          )
        ),
        withTooltip(
          selectedIds.size > 0 ? `导出 ${selectedIds.size} 个` : "选择技能导出",
          createElement(Button, { variant: "plain", onClick: handleExport, disabled: selectedIds.size === 0 },
            createElement("i", { className: "ti ti-download" })
          )
        ),
        createElement(Button, { variant: "plain", onClick: loadSkills },
          createElement("i", { className: "ti ti-refresh" })
        )
      ),

      // Tab 导航
      createElement(
        "div",
        { style: tabBarStyle },
        ...SCOPE_TABS.map((tab) =>
          createElement(
            "button",
            {
              key: tab.key,
              style: tabStyle(activeTab === tab.key),
              onClick: () => setActiveTab(tab.key),
            },
            createElement("i", { className: tab.icon, style: { fontSize: 14 } }),
            tab.label,
            activeTab === tab.key &&
              createElement(
                "span",
                {
                  style: {
                    fontSize: 10, color: "var(--orca-color-text-4)",
                    background: "var(--orca-color-bg-2)", borderRadius: 10,
                    padding: "0 6px", lineHeight: "18px",
                  },
                },
                String(filteredSkills.length)
              )
          )
        )
      ),

      // 选中计数
      selectedIds.size > 0 &&
        createElement(
          "div",
          {
            style: {
              marginTop: 8, fontSize: 11, color: "var(--orca-color-text-3)",
              display: "flex", alignItems: "center", gap: 8,
            },
          },
          `已选择 ${selectedIds.size} 个技能`,
          createElement(
            "button",
            {
              onClick: () => setSelectedIds(new Set()),
              style: {
                border: "none", background: "transparent", cursor: "pointer",
                color: "var(--orca-color-text-3)", fontSize: 11,
              },
            },
            "取消选择"
          )
        ),

      // 卡片网格
      createElement(
        "div",
        { style: cardGridStyle },
        loading
          ? createElement(
              "div",
              { style: { gridColumn: "1 / -1", textAlign: "center", padding: 40, color: "var(--orca-color-text-3)", fontSize: 13 } },
              "加载中..."
            )
          : filteredSkills.length === 0
            ? createElement(
                "div",
                { style: { gridColumn: "1 / -1", textAlign: "center", padding: 40, color: "var(--orca-color-text-3)", fontSize: 13 } },
                searchQuery ? "未找到匹配的技能" : "暂无技能"
              )
            : filteredSkills.map(renderCard)
      )
    ),

    // ════════════════════════════════════════════════════
    // 编辑侧栏
    // ════════════════════════════════════════════════════
    editingSkill &&
      createElement(
        "div",
        { style: editOverlayStyle, onClick: closeEditor },
        createElement(
          "div",
          { style: editDrawerStyle, onClick: (e: any) => e.stopPropagation() },
          // Header
          createElement(
            "div",
            { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
            createElement(
              "div",
              { style: { fontSize: 16, fontWeight: 600, color: "var(--orca-color-text-1)" } },
              `${editingSkill.scope === "internal" ? "查看内置" : "编辑"}技能: ${editingSkill.name}`
            ),
            withTooltip(
              "关闭",
              createElement(Button, { variant: "plain", onClick: closeEditor },
                createElement("i", { className: "ti ti-x" })
              )
            )
          ),
          // Body
          createElement(
            "div",
            {
              style: {
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16,
                marginTop: 16, flex: 1, minHeight: 400, overflow: "hidden",
              },
            },
            // 左列：表单
            createElement(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" } },
              // 名称
              createElement(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: 4 } },
                createElement("span", { style: { fontSize: 12, fontWeight: 500, color: "var(--orca-color-text-2)" } }, "名称"),
                createElement("input", {
                  value: editName,
                  onChange: (e: any) => setEditName(e.target.value),
                  disabled: editingSkill.scope === "internal",
                  style: {
                    padding: "8px 12px", borderRadius: "var(--orca-radius-sm, 4px)",
                    border: "1px solid var(--orca-color-border)",
                    background: "var(--orca-color-bg-2)", color: "var(--orca-color-text-1)", fontSize: 13,
                  },
                })
              ),
              // 描述
              createElement(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: 4 } },
                createElement("span", { style: { fontSize: 12, fontWeight: 500, color: "var(--orca-color-text-2)" } }, "描述"),
                createElement("textarea", {
                  value: editDesc,
                  onChange: (e: any) => setEditDesc(e.target.value),
                  disabled: editingSkill.scope === "internal",
                  rows: 3,
                  style: {
                    padding: "8px 12px", borderRadius: "var(--orca-radius-sm, 4px)",
                    border: "1px solid var(--orca-color-border)",
                    background: "var(--orca-color-bg-2)", color: "var(--orca-color-text-1)",
                    fontSize: 13, resize: "vertical", fontFamily: "inherit",
                  },
                })
              ),
              // 指令
              createElement(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: 4, flex: 1 } },
                createElement("span", { style: { fontSize: 12, fontWeight: 500, color: "var(--orca-color-text-2)" } }, "指令 (Markdown)"),
                createElement("textarea", {
                  value: editInstruction,
                  onChange: (e: any) => setEditInstruction(e.target.value),
                  disabled: editingSkill.scope === "internal",
                  style: {
                    flex: 1, minHeight: 200, padding: "8px 12px",
                    borderRadius: "var(--orca-radius-sm, 4px)",
                    border: "1px solid var(--orca-color-border)",
                    background: "var(--orca-color-bg-2)", color: "var(--orca-color-text-1)",
                    fontSize: 12, resize: "vertical", fontFamily: "monospace",
                  },
                })
              ),
              editError &&
                createElement("div", { style: { fontSize: 12, color: "var(--orca-color-error, #dc3545)" } }, editError)
            ),
            // 右列：预览
            createElement(
              "div",
              {
                style: {
                  border: "1px solid var(--orca-color-border)", borderRadius: "var(--orca-radius-md, 8px)",
                  padding: 12, background: "var(--orca-color-bg-2)", overflowY: "auto",
                },
              },
              createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--orca-color-text-3)", marginBottom: 8 } }, "预览"),
              editInstruction
                ? createElement(MarkdownMessage, { content: editInstruction, role: "assistant" })
                : createElement("div", { style: { fontSize: 12, color: "var(--orca-color-text-3)" } }, "在左侧输入指令内容")
            )
          ),
          // Footer
          createElement(
            "div",
            { style: { display: "flex", justifyContent: editingSkill.scope === "internal" ? "flex-end" : "space-between", marginTop: 16 } },
            editingSkill.scope !== "internal" && createElement(Button, {
              variant: "plain",
              onClick: () => setDeleteTarget(editingSkill),
              style: { color: "var(--orca-color-error, #dc3545)" },
            }, "删除"),
            createElement(
              "div",
              { style: { display: "flex", gap: 8 } },
              editingSkill.scope === "internal"
                ? createElement(Button, { variant: "secondary", onClick: closeEditor }, "关闭")
                : createElement(Button, { variant: "secondary", onClick: closeEditor }, "取消"),
              editingSkill.scope !== "internal" && createElement(Button, { variant: "secondary", onClick: saveEditor, disabled: editSaving },
                editSaving ? "保存中..." : "保存"
              )
            )
          )
        )
      ),

    // ════════════════════════════════════════════════════
    // 创建弹窗
    // ════════════════════════════════════════════════════
    showCreate &&
      createElement(
        "div",
        { style: editOverlayStyle, onClick: () => setShowCreate(false) },
        createElement(
          "div",
          {
            style: { ...editDrawerStyle, width: "min(550px, 94vw)" },
            onClick: (e: any) => e.stopPropagation(),
          },
          createElement(
            "div",
            { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
            createElement("div", { style: { fontSize: 16, fontWeight: 600, color: "var(--orca-color-text-1)" } }, "新建技能"),
            withTooltip("关闭", createElement(Button, { variant: "plain", onClick: () => setShowCreate(false) },
              createElement("i", { className: "ti ti-x" })
            ))
          ),
          createElement(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: 12, marginTop: 16, overflowY: "auto" } },
            // 名称
            createElement(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: 4 } },
              createElement("span", { style: { fontSize: 12, fontWeight: 500, color: "var(--orca-color-text-2)" } }, "名称"),
              createElement("input", {
                value: createName,
                onChange: (e: any) => setCreateName(e.target.value),
                placeholder: "技能名称",
                style: {
                  padding: "8px 12px", borderRadius: "var(--orca-radius-sm, 4px)",
                  border: "1px solid var(--orca-color-border)",
                  background: "var(--orca-color-bg-2)", color: "var(--orca-color-text-1)", fontSize: 13,
                },
              })
            ),
            // 描述
            createElement(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: 4 } },
              createElement("span", { style: { fontSize: 12, fontWeight: 500, color: "var(--orca-color-text-2)" } }, "描述"),
              createElement("textarea", {
                value: createDesc,
                onChange: (e: any) => setCreateDesc(e.target.value),
                rows: 2,
                placeholder: "简述技能的功能和触发场景",
                style: {
                  padding: "8px 12px", borderRadius: "var(--orca-radius-sm, 4px)",
                  border: "1px solid var(--orca-color-border)",
                  background: "var(--orca-color-bg-2)", color: "var(--orca-color-text-1)",
                  fontSize: 13, resize: "vertical", fontFamily: "inherit",
                },
              })
            ),
            // 指令
            createElement(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: 4 } },
              createElement("span", { style: { fontSize: 12, fontWeight: 500, color: "var(--orca-color-text-2)" } }, "指令 (Markdown)"),
              createElement("textarea", {
                value: createInstruction,
                onChange: (e: any) => setCreateInstruction(e.target.value),
                rows: 6,
                placeholder: "# 技能名称\n\n## 执行流程\n...",
                style: {
                  padding: "8px 12px", borderRadius: "var(--orca-radius-sm, 4px)",
                  border: "1px solid var(--orca-color-border)",
                  background: "var(--orca-color-bg-2)", color: "var(--orca-color-text-1)",
                  fontSize: 12, resize: "vertical", fontFamily: "monospace", minHeight: 120,
                },
              })
            ),
            // 作用域选择
            createElement(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: 4 } },
              createElement("span", { style: { fontSize: 12, fontWeight: 500, color: "var(--orca-color-text-2)" } }, "存储位置"),
              createElement(
                "div",
                { style: { display: "flex", gap: 16 } },
                createElement(
                  "label",
                  { style: { display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 } },
                  createElement("input", {
                    type: "radio", name: "createScope",
                    checked: createScope === "local",
                    onChange: () => setCreateScope("local"),
                  }),
                  createElement("i", { className: "ti ti-file-text", style: { fontSize: 14 } }),
                  "当前仓库"
                ),
                createElement(
                  "label",
                  { style: { display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 } },
                  createElement("input", {
                    type: "radio", name: "createScope",
                    checked: createScope === "global",
                    onChange: () => setCreateScope("global"),
                  }),
                  createElement("i", { className: "ti ti-world", style: { fontSize: 14 } }),
                  "全局"
                )
              )
            ),
            createError &&
              createElement("div", { style: { fontSize: 12, color: "var(--orca-color-error, #dc3545)" } }, createError)
          ),
          createElement(
            "div",
            { style: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 } },
            createElement(Button, { variant: "secondary", onClick: () => setShowCreate(false) }, "取消"),
            createElement(Button, { variant: "secondary", onClick: handleCreate, disabled: createLoading },
              createLoading ? "创建中..." : "创建"
            )
          )
        )
      ),

    // ════════════════════════════════════════════════════
    // 删除确认
    // ════════════════════════════════════════════════════
    deleteTarget &&
      createElement(
        "div",
        { style: editOverlayStyle, onClick: () => setDeleteTarget(null) },
        createElement(
          "div",
          {
            style: {
              background: "var(--orca-color-bg-1)", padding: 24, borderRadius: "var(--orca-radius-lg, 12px)",
              width: 380, boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            },
            onClick: (e: any) => e.stopPropagation(),
          },
          createElement("div", { style: { fontSize: 16, fontWeight: 600, color: "var(--orca-color-text-1)" } }, "删除技能"),
          createElement(
            "div",
            { style: { marginTop: 8, fontSize: 13, color: "var(--orca-color-text-2)" } },
            `确定要删除「${deleteTarget.name}」吗？此操作不可撤销。`
          ),
          createElement(
            "div",
            { style: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 } },
            createElement(Button, { variant: "secondary", onClick: () => setDeleteTarget(null) }, "取消"),
            createElement(Button, {
              variant: "secondary",
              onClick: confirmDelete,
              style: { color: "var(--orca-color-error, #dc3545)" },
            }, "删除")
          )
        )
      ),

    // ════════════════════════════════════════════════════
    // 导入位置选择
    // ════════════════════════════════════════════════════
    importPending &&
      createElement(
        "div",
        { style: editOverlayStyle, onClick: () => setImportPending(null) },
        createElement(
          "div",
          {
            style: {
              background: "var(--orca-color-bg-1)", padding: 24, borderRadius: "var(--orca-radius-lg, 12px)",
              width: 400, boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            },
            onClick: (e: any) => e.stopPropagation(),
          },
          createElement("div", { style: { fontSize: 16, fontWeight: 600, color: "var(--orca-color-text-1)" } }, "选择导入位置"),
          createElement(
            "div",
            { style: { marginTop: 8, fontSize: 12, color: "var(--orca-color-text-2)" } },
            `即将导入 ${importPending.length} 个技能`
          ),
          createElement(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: 10, marginTop: 16 } },
            createElement(
              "label",
              {
                style: {
                  display: "flex", alignItems: "center", gap: 10, padding: 12,
                  borderRadius: "var(--orca-radius-md, 8px)", cursor: "pointer",
                  border: `2px solid ${importScope === "local" ? "var(--orca-color-primary)" : "var(--orca-color-border)"}`,
                  background: importScope === "local" ? "var(--orca-color-primary-bg, rgba(0,123,255,0.06))" : "transparent",
                },
                onClick: () => setImportScope("local"),
              },
              createElement("input", { type: "radio", checked: importScope === "local", onChange: () => {} }),
              createElement("div", null,
                createElement("div", { style: { fontWeight: 500, fontSize: 13 } }, "📁 当前仓库（内置）"),
                createElement("div", { style: { fontSize: 11, color: "var(--orca-color-text-3)", marginTop: 2 } }, "仅当前仓库可见")
              )
            ),
            createElement(
              "label",
              {
                style: {
                  display: "flex", alignItems: "center", gap: 10, padding: 12,
                  borderRadius: "var(--orca-radius-md, 8px)", cursor: "pointer",
                  border: `2px solid ${importScope === "global" ? "var(--orca-color-primary)" : "var(--orca-color-border)"}`,
                  background: importScope === "global" ? "var(--orca-color-primary-bg, rgba(0,123,255,0.06))" : "transparent",
                },
                onClick: () => setImportScope("global"),
              },
              createElement("input", { type: "radio", checked: importScope === "global", onChange: () => {} }),
              createElement("div", null,
                createElement("div", { style: { fontWeight: 500, fontSize: 13 } }, "🌐 全局"),
                createElement("div", { style: { fontSize: 11, color: "var(--orca-color-text-3)", marginTop: 2 } }, "所有仓库可见")
              )
            )
          ),
          createElement(
            "div",
            { style: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 } },
            createElement(Button, { variant: "secondary", onClick: () => setImportPending(null) }, "取消"),
            createElement(Button, { variant: "secondary", onClick: handleImportConfirm, disabled: importLoading },
              importLoading ? "导入中..." : "确认导入"
            )
          )
        )
      )
  );
}
