/**
 * Web Search Settings Modal - 联网搜索设置（支持多引擎故障转移）
 */
import { getAiChatPluginName } from "../ui/ai-chat-ui";
import { getAiChatSettings, updateAiChatSettings, type SearchProvider, type WebSearchConfig, type SearchProviderInstance } from "../settings/ai-chat-settings";
import { isInstanceConfigured, getProviderDisplayName, testSearchInstance, type ConnectivityTestResult } from "../services/external/web-search-service";
import { withTooltip } from "../utils/orca-tooltip";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
};
const { createElement, useState, useEffect, useCallback } = React;
const { Button } = orca.components;

interface Props { isOpen: boolean; onClose: () => void; }

const PROVIDERS: { value: SearchProvider; label: string; needsKey: boolean; imageOnly?: boolean }[] = [
  { value: "google", label: "Google", needsKey: true },
  { value: "tavily", label: "Tavily", needsKey: true },
  { value: "brave", label: "Brave", needsKey: true },
  { value: "bing", label: "Bing", needsKey: true },
  { value: "serpapi", label: "SerpApi (图片)", needsKey: true, imageOnly: true },
  { value: "searxng", label: "SearXNG (免费)", needsKey: false },
  { value: "duckduckgo", label: "DuckDuckGo (免费)", needsKey: false },
];

const MAX_RESULTS = [3, 5, 8, 10, 15, 20];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default function WebSearchSettingsModal({ isOpen, onClose }: Props) {
  const [maxResults, setMaxResults] = useState(5);
  const [instances, setInstances] = useState<SearchProviderInstance[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, ConnectivityTestResult>>({});

  useEffect(() => {
    if (isOpen) {
      const s = getAiChatSettings(getAiChatPluginName());
      setMaxResults(s.webSearch?.maxResults || 5);
      setInstances(s.webSearch?.instances || []);
      setTestResults({});
    }
  }, [isOpen]);

  const testInstance = async (inst: SearchProviderInstance) => {
    if (!isInstanceConfigured(inst)) {
      orca.notify("warn", "请先配置 API Key");
      return;
    }
    setTestingId(inst.id);
    try {
      const result = await testSearchInstance(inst);
      setTestResults(prev => ({ ...prev, [inst.id]: result }));
      if (result.success) {
        orca.notify("success", `${inst.name || getProviderDisplayName(inst.provider)}: ${result.message}`);
      } else {
        orca.notify("error", `${inst.name || getProviderDisplayName(inst.provider)}: ${result.message}`);
      }
    } catch (e: any) {
      setTestResults(prev => ({ ...prev, [inst.id]: { success: false, message: e.message || "测试失败" } }));
      orca.notify("error", e.message || "测试失败");
    } finally {
      setTestingId(null);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateAiChatSettings("app", getAiChatPluginName(), {
        webSearch: { 
          enabled: true, 
          maxResults, 
          instances,
          imageSearchEnabled: true,
          maxImageResults: 3,
        },
      });
      orca.notify("success", "设置已保存");
      onClose();
    } catch { orca.notify("error", "保存失败"); }
    finally { setSaving(false); }
  };

  const addInstance = (provider: SearchProvider) => {
    const newInstance: SearchProviderInstance = {
      id: generateId(),
      provider,
      enabled: true,
      name: getProviderDisplayName(provider),
      tavilySearchDepth: "basic",
      tavilyIncludeAnswer: true,
      bingMarket: "en-US",
      duckduckgoRegion: "wt-wt",
      braveCountry: "US",
      braveSearchLang: "en",
      searxngLanguage: "en",
      googleHl: "zh-CN",
      googleSafe: "off",
    };
    setInstances([...instances, newInstance]);
    setEditingId(newInstance.id);
  };

  const updateInstance = (id: string, updates: Partial<SearchProviderInstance>) => {
    setInstances(instances.map(i => i.id === id ? { ...i, ...updates } : i));
  };

  const removeInstance = (id: string) => {
    setInstances(instances.filter(i => i.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const moveInstance = (id: string, dir: -1 | 1) => {
    const idx = instances.findIndex(i => i.id === id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= instances.length) return;
    const arr = [...instances];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setInstances(arr);
  };

  if (!isOpen) return null;

  const overlay: React.CSSProperties = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
  const modal: React.CSSProperties = { background: "var(--orca-color-bg-1)", borderRadius: 12, padding: 24, width: 520, maxWidth: "90vw", maxHeight: "85vh", overflow: "auto" };
  const title: React.CSSProperties = { fontSize: 18, fontWeight: 600, marginBottom: 16, color: "var(--orca-color-text-1)", display: "flex", alignItems: "center", gap: 8 };
  const section: React.CSSProperties = { marginBottom: 16, padding: 12, background: "var(--orca-color-bg-2)", borderRadius: 8 };
  const row: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 };
  const label: React.CSSProperties = { fontSize: 14, color: "var(--orca-color-text-1)" };
  const desc: React.CSSProperties = { fontSize: 12, color: "var(--orca-color-text-3)" };
  const input: React.CSSProperties = { padding: "6px 10px", borderRadius: 6, border: "1px solid var(--orca-color-border)", background: "var(--orca-color-bg-1)", color: "var(--orca-color-text-1)", fontSize: 13, width: "100%", boxSizing: "border-box" };
  const select: React.CSSProperties = { padding: "4px 8px", borderRadius: 6, border: "1px solid var(--orca-color-border)", background: "var(--orca-color-bg-1)", color: "var(--orca-color-text-1)", fontSize: 13 };
  const iconBtn: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--orca-color-text-2)", fontSize: 16 };
  const footer: React.CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 20 };

  return createElement("div", { style: overlay, onClick: onClose },
    createElement("div", { style: modal, onClick: (e: any) => e.stopPropagation() },
      createElement("div", { style: title },
        createElement("i", { className: "ti ti-world", style: { color: "var(--orca-color-primary)" } }),
        "联网搜索设置"
      ),

      // 全局设置
      createElement("div", { style: section },
        createElement("div", { style: row },
          createElement("div", { style: label }, "最大结果数"),
          createElement("select", { style: select, value: maxResults, onChange: (e: any) => setMaxResults(Number(e.target.value)) },
            MAX_RESULTS.map(n => createElement("option", { key: n, value: n }, n + " 条")))
        ),
        createElement("div", { style: desc }, "搜索引擎按列表顺序尝试，失败自动切换下一个")
      ),

      // 搜索引擎列表
      createElement("div", { style: { marginBottom: 16 } },
        createElement("div", { style: { ...label, marginBottom: 8, fontWeight: 600 } }, "搜索引擎 (" + instances.length + ")"),
        instances.length === 0 && createElement("div", { style: { ...desc, padding: 16, textAlign: "center", background: "var(--orca-color-bg-2)", borderRadius: 8 } },
          "还没有添加搜索引擎，点击下方按钮添加"
        ),
        instances.map((inst, idx) => createElement("div", {
          key: inst.id,
          style: { ...section, marginBottom: 8, border: editingId === inst.id ? "1px solid var(--orca-color-primary)" : "1px solid transparent" }
        },
          // 实例头部
          createElement("div", { style: { ...row, marginBottom: editingId === inst.id ? 12 : 0 } },
            createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
              createElement("input", { type: "checkbox", checked: inst.enabled, onChange: () => updateInstance(inst.id, { enabled: !inst.enabled }) }),
              createElement("span", { style: { ...label, fontWeight: 500 } }, inst.name || getProviderDisplayName(inst.provider)),
              !isInstanceConfigured(inst) && createElement("span", { style: { fontSize: 11, color: "var(--orca-color-warning)", marginLeft: 4 } }, "未配置")
            ),
            createElement("div", { style: { display: "flex", gap: 4 } },
              withTooltip(
                testResults[inst.id] ? testResults[inst.id].message : "测试连接",
                createElement("button", { 
                  style: { ...iconBtn, color: testResults[inst.id]?.success ? "var(--orca-color-success)" : testResults[inst.id]?.success === false ? "var(--orca-color-danger)" : "var(--orca-color-text-2)" }, 
                  onClick: () => testInstance(inst), 
                  disabled: testingId === inst.id,
                },
                  createElement("i", { className: testingId === inst.id ? "ti ti-loader" : testResults[inst.id]?.success ? "ti ti-circle-check" : testResults[inst.id]?.success === false ? "ti ti-circle-x" : "ti ti-plug" }))
              ),
              withTooltip(
                "上移",
                createElement("button", { style: iconBtn, onClick: () => moveInstance(inst.id, -1), disabled: idx === 0 }, "")
              ),
              withTooltip(
                "下移",
                createElement("button", { style: iconBtn, onClick: () => moveInstance(inst.id, 1), disabled: idx === instances.length - 1 }, "")
              ),
              withTooltip(
                "编辑",
                createElement("button", { style: iconBtn, onClick: () => setEditingId(editingId === inst.id ? null : inst.id) },
                  createElement("i", { className: editingId === inst.id ? "ti ti-chevron-up" : "ti ti-settings" }))
              ),
              withTooltip(
                "删除",
                createElement("button", { style: { ...iconBtn, color: "var(--orca-color-danger)" }, onClick: () => removeInstance(inst.id) },
                  createElement("i", { className: "ti ti-trash" }))
              )
            )
          ),

          // 展开的编辑区域
          editingId === inst.id && createElement("div", { style: { marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--orca-color-border)" } },
            // 名称
            createElement("div", { style: { marginBottom: 8 } },
              createElement("div", { style: { ...label, fontSize: 12, marginBottom: 4 } }, "名称"),
              createElement("input", { style: input, value: inst.name || "", onChange: (e: any) => updateInstance(inst.id, { name: e.target.value }), placeholder: "自定义名称" })),
            
            // API Key (非 DuckDuckGo/SearXNG)
            inst.provider !== "duckduckgo" && inst.provider !== "searxng" && inst.provider !== "google" && createElement("div", { style: { marginBottom: 8 } },
              createElement("div", { style: { ...label, fontSize: 12, marginBottom: 4 } }, "API Key"),
              createElement("input", { 
                type: "password", style: input,
                value: inst.provider === "tavily" ? (inst.tavilyApiKey || "") 
                     : inst.provider === "bing" ? (inst.bingApiKey || "")
                     : inst.provider === "brave" ? (inst.braveApiKey || "")
                     : "",
                onChange: (e: any) => {
                  const key = e.target.value;
                  if (inst.provider === "tavily") updateInstance(inst.id, { tavilyApiKey: key });
                  else if (inst.provider === "bing") updateInstance(inst.id, { bingApiKey: key });
                  else if (inst.provider === "brave") updateInstance(inst.id, { braveApiKey: key });
                },
                placeholder: inst.provider === "tavily" ? "tvly-xxx" : "API Key"
              }),
              // Tavily 获取链接提示
              inst.provider === "tavily" && createElement("div", { style: { marginTop: 6, fontSize: 11, color: "var(--orca-color-text-3)" } },
                "免费 1000 次/月 → ",
                createElement("a", { 
                  href: "https://tavily.com", 
                  style: { color: "var(--orca-color-primary)", textDecoration: "none" },
                  onClick: (e: any) => { e.preventDefault(); orca.invokeBackend("shell-open", "https://tavily.com"); }
                }, "tavily.com")),
              // Bing 获取链接提示
              inst.provider === "bing" && createElement("div", { style: { marginTop: 6, fontSize: 11, color: "var(--orca-color-text-3)" } },
                "免费 1000 次/月 → ",
                createElement("a", { 
                  href: "https://www.microsoft.com/en-us/bing/apis/bing-web-search-api", 
                  style: { color: "var(--orca-color-primary)", textDecoration: "none" },
                  onClick: (e: any) => { e.preventDefault(); orca.invokeBackend("shell-open", "https://www.microsoft.com/en-us/bing/apis/bing-web-search-api"); }
                }, "Bing Search API")),
              // Brave 获取链接提示
              inst.provider === "brave" && createElement("div", { style: { marginTop: 6, fontSize: 11, color: "var(--orca-color-text-3)" } },
                "免费 2000 次/月 → ",
                createElement("a", { 
                  href: "https://brave.com/search/api/", 
                  style: { color: "var(--orca-color-primary)", textDecoration: "none" },
                  onClick: (e: any) => { e.preventDefault(); orca.invokeBackend("shell-open", "https://brave.com/search/api/"); }
                }, "brave.com/search/api"))),
            
            // Google Custom Search 设置
            inst.provider === "google" && createElement("div", null,
              createElement("div", { style: { marginBottom: 8 } },
                createElement("div", { style: { ...label, fontSize: 12, marginBottom: 4 } }, "API Key"),
                createElement("input", { 
                  type: "password", style: input,
                  value: inst.googleApiKey || "",
                  onChange: (e: any) => updateInstance(inst.id, { googleApiKey: e.target.value }),
                  placeholder: "AIzaSy..."
                })),
              createElement("div", { style: { marginBottom: 8 } },
                createElement("div", { style: { ...label, fontSize: 12, marginBottom: 4 } }, "Search Engine ID (cx)"),
                createElement("input", { 
                  style: input,
                  value: inst.googleSearchEngineId || "",
                  onChange: (e: any) => updateInstance(inst.id, { googleSearchEngineId: e.target.value }),
                  placeholder: "搜索引擎 ID"
                })),
              createElement("div", { style: { display: "flex", gap: 12, marginBottom: 8 } },
                createElement("div", { style: { flex: 1 } },
                  createElement("div", { style: { ...label, fontSize: 12, marginBottom: 4 } }, "界面语言"),
                  createElement("select", { style: { ...select, width: "100%" }, value: inst.googleHl || "zh-CN", onChange: (e: any) => updateInstance(inst.id, { googleHl: e.target.value }) },
                    createElement("option", { value: "zh-CN" }, "中文"),
                    createElement("option", { value: "en" }, "English"),
                    createElement("option", { value: "ja" }, "日本語"))),
                createElement("div", { style: { flex: 1 } },
                  createElement("div", { style: { ...label, fontSize: 12, marginBottom: 4 } }, "安全搜索"),
                  createElement("select", { style: { ...select, width: "100%" }, value: inst.googleSafe || "off", onChange: (e: any) => updateInstance(inst.id, { googleSafe: e.target.value }) },
                    createElement("option", { value: "off" }, "关闭"),
                    createElement("option", { value: "active" }, "开启")))),
              createElement("div", { style: { marginTop: 6, fontSize: 11, color: "var(--orca-color-text-3)", lineHeight: 1.5 } },
                "免费 100 次/天 → ",
                createElement("a", { 
                  href: "https://developers.google.com/custom-search/v1/overview", 
                  style: { color: "var(--orca-color-primary)", textDecoration: "none" },
                  onClick: (e: any) => { e.preventDefault(); orca.invokeBackend("shell-open", "https://developers.google.com/custom-search/v1/overview"); }
                }, "获取 API Key"),
                " | ",
                createElement("a", { 
                  href: "https://programmablesearchengine.google.com/", 
                  style: { color: "var(--orca-color-primary)", textDecoration: "none" },
                  onClick: (e: any) => { e.preventDefault(); orca.invokeBackend("shell-open", "https://programmablesearchengine.google.com/"); }
                }, "创建搜索引擎"))),
            
            // Tavily 特有设置
            inst.provider === "tavily" && createElement("div", { style: { display: "flex", gap: 12 } },
              createElement("div", { style: { flex: 1 } },
                createElement("div", { style: { ...label, fontSize: 12, marginBottom: 4 } }, "搜索深度"),
                createElement("select", { style: { ...select, width: "100%" }, value: inst.tavilySearchDepth || "basic", onChange: (e: any) => updateInstance(inst.id, { tavilySearchDepth: e.target.value }) },
                  createElement("option", { value: "basic" }, "基础"),
                  createElement("option", { value: "advanced" }, "深度"))),
              createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
                createElement("input", { type: "checkbox", checked: inst.tavilyIncludeAnswer !== false, onChange: (e: any) => updateInstance(inst.id, { tavilyIncludeAnswer: e.target.checked }) }),
                createElement("span", { style: { fontSize: 12 } }, "AI摘要"))),
            
            // Bing 设置
            inst.provider === "bing" && createElement("div", null,
              createElement("div", { style: { ...label, fontSize: 12, marginBottom: 4 } }, "市场"),
              createElement("select", { style: { ...select, width: "100%" }, value: inst.bingMarket || "en-US", onChange: (e: any) => updateInstance(inst.id, { bingMarket: e.target.value }) },
                createElement("option", { value: "zh-CN" }, "中国"), createElement("option", { value: "en-US" }, "美国"))),
            
            // DuckDuckGo 设置
            inst.provider === "duckduckgo" && createElement("div", null,
              createElement("div", { style: { ...label, fontSize: 12, marginBottom: 4 } }, "区域"),
              createElement("select", { style: { ...select, width: "100%" }, value: inst.duckduckgoRegion || "wt-wt", onChange: (e: any) => updateInstance(inst.id, { duckduckgoRegion: e.target.value }) },
                createElement("option", { value: "cn-zh" }, "中国"), createElement("option", { value: "us-en" }, "美国"), createElement("option", { value: "wt-wt" }, "全球"))),
            
            // Brave 设置
            inst.provider === "brave" && createElement("div", { style: { display: "flex", gap: 12 } },
              createElement("div", { style: { flex: 1 } },
                createElement("div", { style: { ...label, fontSize: 12, marginBottom: 4 } }, "国家"),
                createElement("select", { style: { ...select, width: "100%" }, value: inst.braveCountry || "US", onChange: (e: any) => updateInstance(inst.id, { braveCountry: e.target.value }) },
                  createElement("option", { value: "CN" }, "中国"), createElement("option", { value: "US" }, "美国"), createElement("option", { value: "JP" }, "日本"))),
              createElement("div", { style: { flex: 1 } },
                createElement("div", { style: { ...label, fontSize: 12, marginBottom: 4 } }, "语言"),
                createElement("select", { style: { ...select, width: "100%" }, value: inst.braveSearchLang || "en", onChange: (e: any) => updateInstance(inst.id, { braveSearchLang: e.target.value }) },
                  createElement("option", { value: "zh-hans" }, "中文"), createElement("option", { value: "en" }, "English")))),
            
            // SearXNG 设置
            inst.provider === "searxng" && createElement("div", null,
              createElement("div", { style: { marginBottom: 8 } },
                createElement("div", { style: { ...label, fontSize: 12, marginBottom: 4 } }, "实例 URL（可选，留空使用公共实例）"),
                createElement("input", { style: input, value: inst.searxngInstanceUrl || "", onChange: (e: any) => updateInstance(inst.id, { searxngInstanceUrl: e.target.value }), placeholder: "https://searx.be" })),
              createElement("div", null,
                createElement("div", { style: { ...label, fontSize: 12, marginBottom: 4 } }, "语言"),
                createElement("select", { style: { ...select, width: "100%" }, value: inst.searxngLanguage || "en", onChange: (e: any) => updateInstance(inst.id, { searxngLanguage: e.target.value }) },
                  createElement("option", { value: "zh-CN" }, "中文"), createElement("option", { value: "en" }, "English"), createElement("option", { value: "all" }, "全部"))),
              createElement("div", { style: { marginTop: 6, fontSize: 11, color: "var(--orca-color-text-3)" } },
                "开源免费，无需 API Key → ",
                createElement("a", { 
                  href: "https://searx.space", 
                  style: { color: "var(--orca-color-primary)", textDecoration: "none" },
                  onClick: (e: any) => { e.preventDefault(); orca.invokeBackend("shell-open", "https://searx.space"); }
                }, "公共实例列表"))),
            
            // SerpApi 设置（图片搜索）
            inst.provider === "serpapi" && createElement("div", null,
              createElement("div", { style: { marginBottom: 8 } },
                createElement("div", { style: { ...label, fontSize: 12, marginBottom: 4 } }, "API Key"),
                createElement("input", { 
                  type: "password", style: input,
                  value: inst.serpapiApiKey || "",
                  onChange: (e: any) => updateInstance(inst.id, { serpapiApiKey: e.target.value }),
                  placeholder: "SerpApi API Key"
                })),
              createElement("div", { style: { display: "flex", gap: 12 } },
                createElement("div", { style: { flex: 1 } },
                  createElement("div", { style: { ...label, fontSize: 12, marginBottom: 4 } }, "国家"),
                  createElement("select", { style: { ...select, width: "100%" }, value: inst.serpapiGl || "cn", onChange: (e: any) => updateInstance(inst.id, { serpapiGl: e.target.value }) },
                    createElement("option", { value: "cn" }, "中国"), createElement("option", { value: "us" }, "美国"), createElement("option", { value: "jp" }, "日本"))),
                createElement("div", { style: { flex: 1 } },
                  createElement("div", { style: { ...label, fontSize: 12, marginBottom: 4 } }, "语言"),
                  createElement("select", { style: { ...select, width: "100%" }, value: inst.serpapiHl || "zh-cn", onChange: (e: any) => updateInstance(inst.id, { serpapiHl: e.target.value }) },
                    createElement("option", { value: "zh-cn" }, "中文"), createElement("option", { value: "en" }, "English")))),
              createElement("div", { style: { marginTop: 6, fontSize: 11, color: "var(--orca-color-text-3)" } },
                "🖼️ 专用于图片搜索，免费 100 次/月 → ",
                createElement("a", { 
                  href: "https://serpapi.com", 
                  style: { color: "var(--orca-color-primary)", textDecoration: "none" },
                  onClick: (e: any) => { e.preventDefault(); orca.invokeBackend("shell-open", "https://serpapi.com"); }
                }, "serpapi.com")))
          )
        ))
      ),

      // 添加按钮
      createElement("div", { style: { marginBottom: 16 } },
        createElement("div", { style: { ...label, marginBottom: 8 } }, "添加搜索引擎"),
        createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
          PROVIDERS.map(p => createElement("button", {
            key: p.value,
            style: { padding: "6px 12px", borderRadius: 6, border: "1px solid var(--orca-color-border)", background: "var(--orca-color-bg-2)", color: "var(--orca-color-text-1)", cursor: "pointer", fontSize: 13 },
            onClick: () => addInstance(p.value)
          }, "+ " + p.label)))),

      // 提示
      createElement("div", { style: { padding: 10, background: "var(--orca-color-bg-2)", borderRadius: 6, fontSize: 12, color: "var(--orca-color-text-3)", lineHeight: 1.5 } },
        "搜索引擎按列表顺序尝试，第一个失败会自动使用下一个。可以添加多个相同类型的引擎（如多个 Tavily API Key）。"),

      // 底部按钮
      createElement("div", { style: footer },
        createElement(Button, { variant: "plain", onClick: onClose }, "取消"),
        createElement(Button, { variant: "primary", onClick: save, disabled: saving }, saving ? "保存中..." : "保存"))
    )
  );
}
