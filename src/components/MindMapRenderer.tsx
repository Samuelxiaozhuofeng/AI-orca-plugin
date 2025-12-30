/**
 * MindMap Renderer Component
 * 思维导图渲染组件，支持拖拽平移、缩放、折叠/展开、全屏
 */

const React = window.React as typeof import("react");
const { createElement, useState, useEffect, useRef, useCallback } = React;

interface MindMapNode {
  id: number;
  content: string;
  children: MindMapNode[];
  depth: number;
}

interface MindMapRendererProps {
  blockId: number;
}

// 节点颜色配置（按深度）
const DEPTH_COLORS = [
  "var(--orca-color-primary)",
  "var(--orca-color-green, #22c55e)",
  "var(--orca-color-yellow, #eab308)",
  "var(--orca-color-purple, #a855f7)",
  "var(--orca-color-pink, #ec4899)",
  "var(--orca-color-cyan, #06b6d4)",
];

// 提取块的纯文本内容
function extractBlockText(content: any): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((fragment: any) => {
      if (!fragment) return "";
      if (typeof fragment.v === "string") return fragment.v;
      if (typeof fragment.v === "number") return String(fragment.v);
      if (fragment.v && typeof fragment.v === "object") {
        return fragment.v.text || fragment.v.title || fragment.v.name || "";
      }
      return "";
    }).join("");
  }
  try {
    return String(content);
  } catch {
    return "";
  }
}

// 递归构建思维导图节点树
async function buildMindMapTree(
  blockId: number,
  depth: number = 0,
  maxDepth: number = 5
): Promise<MindMapNode | null> {
  if (depth > maxDepth) return null;
  
  try {
    const block = orca.state.blocks[blockId] || await orca.invokeBackend("get-block", blockId);
    if (!block) return null;
    
    const content = extractBlockText(block.content);
    const aliases = block.aliases || block.tags || [];
    const title = aliases.length > 0 ? aliases[0] : (content.slice(0, 60) || `Block ${blockId}`);
    
    const node: MindMapNode = {
      id: blockId,
      content: title,
      children: [],
      depth,
    };
    
    const childIds = block.children || [];
    for (const childId of childIds.slice(0, 30)) {
      const childNode = await buildMindMapTree(childId, depth + 1, maxDepth);
      if (childNode) {
        node.children.push(childNode);
      }
    }
    
    return node;
  } catch (err) {
    console.error("[MindMap] Error building tree:", err);
    return null;
  }
}

// 节点位置信息
interface NodePosition {
  node: MindMapNode;
  x: number;
  y: number;
  width: number;
  height: number;
  collapsed: boolean;
}

// 计算节点布局
function calculateLayout(
  node: MindMapNode,
  startX: number,
  startY: number,
  positions: NodePosition[],
  collapsedNodes: Set<number>,
  nodeHeight: number = 32,
  nodeGapY: number = 8,
  levelGapX: number = 200
): { totalHeight: number } {
  const nodeWidth = 160;
  const isCollapsed = collapsedNodes.has(node.id);
  
  if (node.children.length === 0 || isCollapsed) {
    positions.push({
      node,
      x: startX,
      y: startY,
      width: nodeWidth,
      height: nodeHeight,
      collapsed: isCollapsed && node.children.length > 0,
    });
    return { totalHeight: nodeHeight };
  }
  
  let childY = startY;
  let totalChildHeight = 0;
  
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const result = calculateLayout(
      child,
      startX + levelGapX,
      childY,
      positions,
      collapsedNodes,
      nodeHeight,
      nodeGapY,
      levelGapX
    );
    childY += result.totalHeight + nodeGapY;
    totalChildHeight += result.totalHeight + (i < node.children.length - 1 ? nodeGapY : 0);
  }
  
  const nodeY = startY + (totalChildHeight - nodeHeight) / 2;
  positions.push({
    node,
    x: startX,
    y: Math.max(startY, nodeY),
    width: nodeWidth,
    height: nodeHeight,
    collapsed: false,
  });
  
  return { totalHeight: Math.max(nodeHeight, totalChildHeight) };
}


export default function MindMapRenderer({ blockId }: MindMapRendererProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rootNode, setRootNode] = useState<MindMapNode | null>(null);
  const [positions, setPositions] = useState<NodePosition[]>([]);
  const [svgSize, setSvgSize] = useState({ width: 800, height: 400 });
  const [collapsedNodes, setCollapsedNodes] = useState<Set<number>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // 变换状态（平移+缩放）
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  
  // 拖拽状态
  const dragRef = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
  });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // 加载数据
  useEffect(() => {
    let cancelled = false;
    
    async function load() {
      setLoading(true);
      setError(null);
      
      try {
        const tree = await buildMindMapTree(blockId, 0, 4);
        
        if (cancelled) return;
        
        if (!tree) {
          setError("无法加载块数据");
          setLoading(false);
          return;
        }
        
        setRootNode(tree);
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "加载失败");
          setLoading(false);
        }
      }
    }
    
    load();
    return () => { cancelled = true; };
  }, [blockId]);

  // 重新计算布局
  useEffect(() => {
    if (!rootNode) return;
    
    const nodePositions: NodePosition[] = [];
    calculateLayout(rootNode, 40, 40, nodePositions, collapsedNodes);
    
    let maxX = 0, maxY = 0;
    for (const pos of nodePositions) {
      maxX = Math.max(maxX, pos.x + pos.width);
      maxY = Math.max(maxY, pos.y + pos.height);
    }
    
    setPositions(nodePositions);
    setSvgSize({ width: maxX + 60, height: maxY + 60 });
  }, [rootNode, collapsedNodes]);

  // SVG 事件绑定（缩放+拖拽）
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    // 滚轮缩放
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const t = transformRef.current;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.2, Math.min(4, t.scale * factor));
      
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      
      // 以鼠标为中心缩放
      const newX = mx - (mx - t.x) * (newScale / t.scale);
      const newY = my - (my - t.y) * (newScale / t.scale);
      
      transformRef.current = { x: newX, y: newY, scale: newScale };
      setTransform({ x: newX, y: newY, scale: newScale });
    };

    // 鼠标按下
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.closest('.mindmap-node')) return;
      
      e.preventDefault();
      const t = transformRef.current;
      dragRef.current = { isDragging: true, startX: e.clientX - t.x, startY: e.clientY - t.y };
    };

    // 鼠标移动
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.isDragging) return;
      
      const newX = e.clientX - dragRef.current.startX;
      const newY = e.clientY - dragRef.current.startY;
      transformRef.current = { ...transformRef.current, x: newX, y: newY };
      setTransform(prev => ({ ...prev, x: newX, y: newY }));
    };

    // 鼠标释放
    const handleMouseUp = () => {
      dragRef.current.isDragging = false;
    };

    svg.addEventListener("wheel", handleWheel, { passive: false });
    svg.addEventListener("mousedown", handleMouseDown);
    svg.addEventListener("mousemove", handleMouseMove);
    svg.addEventListener("mouseup", handleMouseUp);
    svg.addEventListener("mouseleave", handleMouseUp);

    return () => {
      svg.removeEventListener("wheel", handleWheel);
      svg.removeEventListener("mousedown", handleMouseDown);
      svg.removeEventListener("mousemove", handleMouseMove);
      svg.removeEventListener("mouseup", handleMouseUp);
      svg.removeEventListener("mouseleave", handleMouseUp);
    };
  }, [positions]);

  // 切换折叠状态
  const toggleCollapse = useCallback((nodeId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // 点击节点跳转
  const handleNodeClick = useCallback((nodeId: number) => {
    orca.nav.openInLastPanel("block", { blockId: nodeId });
  }, []);

  // 重置视图
  const resetView = useCallback(() => {
    transformRef.current = { x: 0, y: 0, scale: 1 };
    setTransform({ x: 0, y: 0, scale: 1 });
  }, []);

  // 全部展开
  const expandAll = useCallback(() => {
    setCollapsedNodes(new Set());
  }, []);

  // 全部折叠
  const collapseAll = useCallback(() => {
    if (!rootNode) return;
    const allIds = new Set<number>();
    function collectIds(node: MindMapNode) {
      if (node.children.length > 0) {
        allIds.add(node.id);
        node.children.forEach(collectIds);
      }
    }
    collectIds(rootNode);
    setCollapsedNodes(allIds);
  }, [rootNode]);

  // 切换全屏
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => {
      transformRef.current = { x: 0, y: 0, scale: 1 };
      setTransform({ x: 0, y: 0, scale: 1 });
      return !prev;
    });
  }, []);

  if (loading) {
    return createElement(
      "div",
      { style: { padding: 20, textAlign: "center", color: "var(--orca-color-text-2)" } },
      createElement("i", { className: "ti ti-loader", style: { animation: "spin 1s linear infinite", marginRight: 8 } }),
      "加载思维导图..."
    );
  }

  if (error) {
    return createElement(
      "div",
      { style: { padding: 16, color: "var(--orca-color-error, #ef4444)", background: "var(--orca-color-error-bg, rgba(239,68,68,0.1))", borderRadius: 8 } },
      error
    );
  }

  if (!rootNode || positions.length === 0) {
    return createElement("div", { style: { padding: 16, color: "var(--orca-color-text-2)" } }, "无数据");
  }

  // 构建位置映射
  const positionMap = new Map<number, NodePosition>();
  for (const pos of positions) {
    positionMap.set(pos.node.id, pos);
  }

  // 生成连接线
  const lines: React.ReactElement[] = [];
  for (const pos of positions) {
    if (pos.collapsed) continue;
    for (const child of pos.node.children) {
      const childPos = positionMap.get(child.id);
      if (childPos) {
        const startX = pos.x + pos.width;
        const startY = pos.y + pos.height / 2;
        const endX = childPos.x;
        const endY = childPos.y + childPos.height / 2;
        const midX = (startX + endX) / 2;
        
        lines.push(
          createElement("path", {
            key: `line-${pos.node.id}-${child.id}`,
            d: `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`,
            stroke: "var(--orca-color-border)",
            strokeWidth: 1.5,
            fill: "none",
            opacity: 0.6,
          })
        );
      }
    }
  }

  // 生成节点
  const nodes = positions.map(pos => {
    const color = DEPTH_COLORS[pos.node.depth % DEPTH_COLORS.length];
    const hasChildren = pos.node.children.length > 0;
    const truncatedContent = pos.node.content.length > 25 ? pos.node.content.slice(0, 23) + "..." : pos.node.content;
    
    return createElement(
      "g",
      { key: `node-${pos.node.id}`, className: "mindmap-node", style: { cursor: "pointer" } },
      createElement("rect", {
        x: pos.x, y: pos.y, width: pos.width, height: pos.height, rx: 6, ry: 6,
        fill: "var(--orca-color-bg-1)", stroke: color, strokeWidth: 2,
        onClick: () => handleNodeClick(pos.node.id),
      }),
      createElement("text", {
        x: pos.x + (hasChildren ? 24 : 10), y: pos.y + pos.height / 2 + 4,
        fontSize: 12, fill: "var(--orca-color-text-1)",
        onClick: () => handleNodeClick(pos.node.id),
        style: { pointerEvents: "none" },
      }, truncatedContent),
      hasChildren && createElement(
        "g",
        { onClick: (e: React.MouseEvent) => toggleCollapse(pos.node.id, e), style: { cursor: "pointer" } },
        createElement("circle", { cx: pos.x + 12, cy: pos.y + pos.height / 2, r: 8, fill: color }),
        createElement("text", {
          x: pos.x + 12, y: pos.y + pos.height / 2 + 4,
          fontSize: 10, fill: "#fff", textAnchor: "middle", fontWeight: "bold",
          style: { pointerEvents: "none" },
        }, pos.collapsed ? "+" : "−")
      ),
      pos.collapsed && createElement("text", {
        x: pos.x + pos.width + 6, y: pos.y + pos.height / 2 + 4,
        fontSize: 10, fill: "var(--orca-color-text-3)",
        style: { pointerEvents: "none" },
      }, `+${pos.node.children.length}`)
    );
  });

  const containerStyle: React.CSSProperties = isFullscreen ? {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 9999,
    background: "var(--orca-color-bg-1)",
    display: "flex",
    flexDirection: "column",
  } : {
    background: "var(--orca-color-bg-2)",
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  };

  return createElement(
    "div",
    { ref: containerRef, className: isFullscreen ? "local-graph-fullscreen" : "", style: containerStyle },
    // 工具栏
    createElement(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--orca-color-border)", background: "var(--orca-color-bg-1)" } },
      createElement("i", { className: "ti ti-binary-tree", style: { color: "var(--orca-color-primary)" } }),
      createElement("span", { style: { fontSize: 13, fontWeight: 500 } }, "思维导图"),
      createElement("span", { style: { fontSize: 11, color: "var(--orca-color-text-3)" } }, `(${positions.length} 个节点)`),
      createElement("div", { style: { flex: 1 } }),
      createElement("button", {
        onClick: expandAll,
        style: { padding: "4px 8px", fontSize: 11, border: "1px solid var(--orca-color-border)", borderRadius: 4, background: "var(--orca-color-bg-2)", color: "var(--orca-color-text-2)", cursor: "pointer" },
        title: "全部展开",
      }, "展开"),
      createElement("button", {
        onClick: collapseAll,
        style: { padding: "4px 8px", fontSize: 11, border: "1px solid var(--orca-color-border)", borderRadius: 4, background: "var(--orca-color-bg-2)", color: "var(--orca-color-text-2)", cursor: "pointer" },
        title: "全部折叠",
      }, "折叠"),
      createElement("button", {
        onClick: resetView,
        style: { padding: "4px 8px", fontSize: 11, border: "none", borderRadius: 4, background: "transparent", color: "var(--orca-color-text-2)", cursor: "pointer" },
        title: "重置视图",
      }, createElement("i", { className: "ti ti-refresh" })),
      createElement("button", {
        onClick: toggleFullscreen,
        style: { padding: "4px 8px", fontSize: 11, border: "none", borderRadius: 4, background: "transparent", color: "var(--orca-color-text-2)", cursor: "pointer" },
        title: isFullscreen ? "退出全屏" : "全屏",
      }, createElement("i", { className: isFullscreen ? "ti ti-minimize" : "ti ti-maximize" }))
    ),
    // SVG 容器
    createElement(
      "svg",
      {
        ref: svgRef,
        width: isFullscreen ? "100%" : svgSize.width,
        height: isFullscreen ? "calc(100% - 80px)" : Math.min(svgSize.height + 20, 450),
        style: { cursor: "grab", background: "var(--orca-color-bg-2)", flex: isFullscreen ? 1 : undefined, touchAction: "none", userSelect: "none" },
      },
      createElement("rect", { width: "100%", height: "100%", fill: "transparent" }),
      createElement(
        "g",
        { transform: `translate(${transform.x}, ${transform.y}) scale(${transform.scale})` },
        ...lines,
        ...nodes
      )
    ),
    // 底部提示 + 缩放比例
    createElement(
      "div",
      { style: { display: "flex", justifyContent: "space-between", padding: "6px 12px", fontSize: 10, color: "var(--orca-color-text-3)", borderTop: "1px solid var(--orca-color-border)", background: "var(--orca-color-bg-1)" } },
      createElement("span", null, "💡 拖拽平移 | 滚轮缩放 | 点击 +/− 折叠展开 | 点击节点跳转"),
      createElement("span", null, `${Math.round(transform.scale * 100)}%`)
    )
  );
}
