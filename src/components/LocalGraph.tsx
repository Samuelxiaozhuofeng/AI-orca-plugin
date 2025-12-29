/**
 * Local Graph Component
 * 
 * Displays a force-directed graph showing the relationships between blocks.
 * Similar to Obsidian's local graph view.
 * 
 * Features:
 * - Drag nodes to reposition
 * - Zoom and pan with mouse wheel / drag
 * - Fullscreen mode
 * - Arrow markers on links
 * - Different node types: page (alias), block, tag, property
 */

import * as d3Force from "d3-force";

const React = window.React as any;
const { createElement, useState, useEffect, useRef, useCallback } = React;

// 节点类型
type NodeType = "center" | "page" | "block" | "tag" | "property";

interface GraphNode {
  id: number;
  title: string;
  nodeType: NodeType;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

// 链接类型
type LinkType = "ref" | "backref" | "tag" | "property";

interface GraphLink {
  source: number | GraphNode;
  target: number | GraphNode;
  linkType: LinkType;
}

interface LocalGraphProps {
  blockId: number;
}

// 清理标题：去掉标签
function cleanTitle(text: string): string {
  if (!text) return "";
  // 去掉 #标签 格式
  return text.replace(/#[\w\u4e00-\u9fa5]+/g, "").trim();
}

// 获取块标题
async function getBlockTitleAsync(id: number): Promise<{ title: string; isPage: boolean }> {
  let b = orca.state.blocks[id];
  if (!b) {
    try {
      b = await orca.invokeBackend("get-block", id);
    } catch {}
  }
  if (!b) return { title: `Block ${id}`, isPage: false };
  
  // 判断是否是页面（有 aliases）
  const isPage = b.aliases && Array.isArray(b.aliases) && b.aliases.length > 0;
  
  // 优先用 alias
  if (isPage) {
    const alias = b.aliases[0];
    if (typeof alias === "string" && alias.trim()) {
      let trimmed = cleanTitle(alias.trim());
      return { 
        title: trimmed.length > 25 ? trimmed.substring(0, 25) + "..." : trimmed,
        isPage: true 
      };
    }
  }
  
  // 否则用 text
  const rawText = b.text || b.content || "";
  let text = typeof rawText === "string" ? rawText.split("\n")[0]?.trim() || "" : "";
  text = text.replace(/^#+\s*/, "").replace(/^[-*+]\s*/, "").trim();
  text = cleanTitle(text);
  return { 
    title: text.length > 25 ? text.substring(0, 25) + "..." : (text || `Block ${id}`),
    isPage: false 
  };
}

// 构建图谱数据
async function buildGraphDataAsync(centerBlockId: number): Promise<{ nodes: GraphNode[]; links: GraphLink[] }> {
  let block = orca.state.blocks[centerBlockId];
  if (!block) {
    try {
      block = await orca.invokeBackend("get-block", centerBlockId);
    } catch {}
  }
  
  if (!block) {
    return { nodes: [], links: [] };
  }

  const nodesMap = new Map<number, GraphNode>();
  const links: GraphLink[] = [];

  // 添加中心节点
  const centerInfo = await getBlockTitleAsync(centerBlockId);
  nodesMap.set(centerBlockId, {
    id: centerBlockId,
    title: centerInfo.title,
    nodeType: "center",
  });

  // 处理出链 refs
  if (block.refs && Array.isArray(block.refs)) {
    for (const ref of block.refs) {
      const targetId = ref.to;
      if (!nodesMap.has(targetId)) {
        const info = await getBlockTitleAsync(targetId);
        
        // 判断引用类型
        let nodeType: NodeType = info.isPage ? "page" : "block";
        let linkType: LinkType = "ref";
        
        // 检查是否是标签引用（目标块是标签页面）
        const targetBlock = orca.state.blocks[targetId];
        if (targetBlock?.aliases?.[0]?.startsWith("#")) {
          nodeType = "tag";
          linkType = "tag";
        }
        
        // 检查是否是属性引用
        if ((ref as any).type === "property" || (ref as any).propertyName) {
          nodeType = "property";
          linkType = "property";
        }
        
        nodesMap.set(targetId, {
          id: targetId,
          title: info.title,
          nodeType,
        });
        links.push({ source: centerBlockId, target: targetId, linkType });
      }
    }
  }

  // 处理入链 backRefs
  if (block.backRefs && Array.isArray(block.backRefs)) {
    for (const ref of block.backRefs) {
      const sourceId = ref.from;
      if (!nodesMap.has(sourceId)) {
        const info = await getBlockTitleAsync(sourceId);
        nodesMap.set(sourceId, {
          id: sourceId,
          title: info.title,
          nodeType: info.isPage ? "page" : "block",
        });
      }
      links.push({ source: sourceId, target: centerBlockId, linkType: "backref" });
    }
  }

  return {
    nodes: Array.from(nodesMap.values()),
    links,
  };
}

// 节点颜色配置
const nodeColors: Record<NodeType, string> = {
  center: "#007bff",   // 蓝色 - 中心节点
  page: "#28a745",     // 绿色 - 页面/别名块
  block: "#6c757d",    // 灰色 - 普通块
  tag: "#fd7e14",      // 橙色 - 标签
  property: "#6f42c1", // 紫色 - 属性
};

// 链接颜色配置
const linkColors: Record<LinkType, string> = {
  ref: "#999",         // 灰色 - 普通引用
  backref: "#17a2b8",  // 青色 - 反向引用
  tag: "#fd7e14",      // 橙色 - 标签引用
  property: "#6f42c1", // 紫色 - 属性引用
};

export default function LocalGraph({ blockId }: LocalGraphProps) {
  const containerRef = useRef(null) as any;
  const svgRef = useRef(null) as any;
  const gRef = useRef(null) as any;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 100, height: 300 });
  const [graphData, setGraphData] = useState({ nodes: [] as GraphNode[], links: [] as GraphLink[] });
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0); // 用于强制更新
  
  const simulationRef = useRef(null) as any;
  const nodesRef = useRef([] as GraphNode[]);
  const linksRef = useRef([] as GraphLink[]);
  
  // 变换状态 - 同时用 ref 和 state
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  
  // 拖拽状态 - 全部用 ref
  const dragRef = useRef({
    type: null as "node" | "pan" | null,
    node: null as GraphNode | null,
    startX: 0,
    startY: 0,
    moved: false,
  });

  // 加载图谱数据
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    buildGraphDataAsync(blockId).then(data => {
      if (!cancelled) {
        setGraphData(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [blockId]);

  // 计算尺寸
  useEffect(() => {
    const updateDimensions = () => {
      if (isFullscreen) {
        setDimensions({ width: window.innerWidth - 100, height: window.innerHeight - 150 });
      } else if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth || 400;
        const nodeCount = graphData.nodes.length;
        const baseHeight = Math.min(400, Math.max(280, 180 + nodeCount * 15));
        setDimensions({ width: Math.max(containerWidth - 2, 350), height: baseHeight });
      }
    };
    
    updateDimensions();
    
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current && !isFullscreen) {
      resizeObserver.observe(containerRef.current);
    }
    
    window.addEventListener("resize", updateDimensions);
    
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateDimensions);
    };
  }, [isFullscreen, graphData.nodes.length]);

  // 初始化力导向模拟
  useEffect(() => {
    if (graphData.nodes.length === 0) return;

    const { width, height } = dimensions;
    const nodesCopy: GraphNode[] = graphData.nodes.map((n: GraphNode) => ({ ...n }));
    const linksCopy: GraphLink[] = graphData.links.map((l: GraphLink) => ({ ...l }));
    
    nodesRef.current = nodesCopy;
    linksRef.current = linksCopy;

    const simulation = d3Force.forceSimulation<GraphNode>(nodesCopy)
      .force("link", d3Force.forceLink<GraphNode, GraphLink>(linksCopy)
        .id(d => d.id)
        .distance(100))
      .force("charge", d3Force.forceManyBody().strength(-250))
      .force("center", d3Force.forceCenter(width / 2, height / 2))
      .force("collision", d3Force.forceCollide().radius(40));

    simulationRef.current = simulation;

    simulation.on("tick", () => {
      setTick((t: number) => t + 1);
    });

    return () => {
      simulation.stop();
    };
  }, [graphData, dimensions]);

  // 鼠标事件处理 - 使用原生事件绑定到 SVG
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
      
      // 检查是否点击了节点
      const nodeGroup = target.closest(".local-graph-node");
      if (nodeGroup) {
        const nodeId = parseInt(nodeGroup.getAttribute("data-id") || "0", 10);
        const node = nodesRef.current.find((n: GraphNode) => n.id === nodeId);
        if (node) {
          e.preventDefault();
          e.stopPropagation();
          dragRef.current = { type: "node", node, startX: e.clientX, startY: e.clientY, moved: false };
          node.fx = node.x;
          node.fy = node.y;
          // 拖拽时停止模拟的自动衰减
          simulationRef.current?.alphaTarget(0.3).restart();
          return;
        }
      }
      
      // 否则是平移
      e.preventDefault();
      const t = transformRef.current;
      dragRef.current = { type: "pan", node: null, startX: e.clientX - t.x, startY: e.clientY - t.y, moved: false };
    };

    // 鼠标移动
    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag.type) return;
      
      drag.moved = true;
      
      if (drag.type === "node" && drag.node) {
        const rect = svg.getBoundingClientRect();
        const t = transformRef.current;
        // 转换到 SVG 坐标
        drag.node.fx = (e.clientX - rect.left - t.x) / t.scale;
        drag.node.fy = (e.clientY - rect.top - t.y) / t.scale;
      } else if (drag.type === "pan") {
        const newX = e.clientX - drag.startX;
        const newY = e.clientY - drag.startY;
        transformRef.current = { ...transformRef.current, x: newX, y: newY };
        setTransform((prev: { x: number; y: number; scale: number }) => ({ ...prev, x: newX, y: newY }));
      }
    };

    // 鼠标释放
    const handleMouseUp = () => {
      const drag = dragRef.current;
      if (drag.type === "node" && drag.node) {
        drag.node.fx = null;
        drag.node.fy = null;
        simulationRef.current?.alphaTarget(0);
      }
      dragRef.current = { type: null, node: null, startX: 0, startY: 0, moved: false };
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
  }, [graphData]); // 依赖 graphData 确保节点数据更新后重新绑定

  // 点击节点跳转
  const handleNodeClick = useCallback((e: any, nodeId: number) => {
    // 如果拖拽过，不触发点击
    if (dragRef.current.moved) return;
    e.stopPropagation();
    try {
      orca.nav.openInLastPanel("block", { blockId: nodeId });
    } catch (error) {
      console.error("[LocalGraph] Navigation failed:", error);
    }
  }, []);

  // 重置视图
  const resetView = useCallback(() => {
    transformRef.current = { x: 0, y: 0, scale: 1 };
    setTransform({ x: 0, y: 0, scale: 1 });
  }, []);

  // 切换全屏
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev: boolean) => {
      transformRef.current = { x: 0, y: 0, scale: 1 };
      setTransform({ x: 0, y: 0, scale: 1 });
      return !prev;
    });
  }, []);

  if (loading) {
    return createElement("div", { className: "local-graph-empty" }, "加载中...");
  }

  if (graphData.nodes.length === 0) {
    return createElement("div", { className: "local-graph-empty" }, "暂无链接关系");
  }

  const { width, height } = dimensions;

  return createElement(
    "div",
    { 
      ref: containerRef,
      className: `local-graph-container ${isFullscreen ? "local-graph-fullscreen" : ""}`,
      style: isFullscreen ? {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        background: "var(--orca-color-bg-1)",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
      } : {
        width: "100%",
        minWidth: "350px",
      },
    },
    // 工具栏
    createElement(
      "div",
      { 
        className: "local-graph-toolbar",
        style: { 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center",
          marginBottom: "8px",
          padding: "4px 8px",
          background: "var(--orca-color-bg-2)",
          borderRadius: "6px",
        }
      },
      createElement("span", { style: { fontSize: "12px", color: "var(--orca-color-text-2)" } },
        `链接图谱 (${nodesRef.current.length} 节点)`
      ),
      createElement(
        "div",
        { style: { display: "flex", gap: "4px" } },
        createElement("button", { 
          className: "local-graph-btn",
          onClick: resetView,
          title: "重置视图",
          style: { padding: "4px 8px", cursor: "pointer", background: "transparent", border: "none", color: "var(--orca-color-text-2)" },
        }, createElement("i", { className: "ti ti-refresh" })),
        createElement("button", { 
          className: "local-graph-btn",
          onClick: toggleFullscreen,
          title: isFullscreen ? "退出全屏" : "全屏",
          style: { padding: "4px 8px", cursor: "pointer", background: "transparent", border: "none", color: "var(--orca-color-text-2)" },
        }, createElement("i", { className: isFullscreen ? "ti ti-minimize" : "ti ti-maximize" }))
      )
    ),
    // SVG 图谱
    createElement(
      "svg",
      {
        ref: svgRef,
        width: isFullscreen ? "100%" : width,
        height: isFullscreen ? "calc(100% - 50px)" : height,
        className: "local-graph-svg",
        style: { 
          cursor: "grab",
          background: "var(--orca-color-bg-2)",
          borderRadius: "8px",
          flex: isFullscreen ? 1 : undefined,
          touchAction: "none",
          userSelect: "none",
        },
      },
      // 背景矩形
      createElement("rect", {
        width: "100%",
        height: "100%",
        fill: "transparent",
      }),
      // 箭头定义
      createElement("defs", null,
        ...Object.entries(linkColors).map(([type, color]) =>
          createElement("marker", {
            key: `arrow-${type}`,
            id: `arrow-${type}`,
            viewBox: "0 -5 10 10",
            refX: 20,
            refY: 0,
            markerWidth: 6,
            markerHeight: 6,
            orient: "auto",
          }, createElement("path", {
            d: "M0,-5L10,0L0,5",
            fill: color,
          }))
        )
      ),
      createElement(
        "g",
        { ref: gRef, transform: `translate(${transform.x}, ${transform.y}) scale(${transform.scale})` },
        // 链接线
        createElement(
          "g",
          { className: "local-graph-links" },
          ...linksRef.current.map((link: GraphLink, i: number) => {
            const source = link.source as GraphNode;
            const target = link.target as GraphNode;
            if (!source.x || !source.y || !target.x || !target.y) return null;
            
            return createElement("line", {
              key: `link-${i}`,
              x1: source.x,
              y1: source.y,
              x2: target.x,
              y2: target.y,
              stroke: linkColors[link.linkType],
              strokeWidth: 1.5,
              markerEnd: `url(#arrow-${link.linkType})`,
              opacity: 0.7,
            });
          })
        ),
        // 节点
        createElement(
          "g",
          { className: "local-graph-nodes" },
          ...nodesRef.current.map((node: GraphNode) => {
            if (!node.x || !node.y) return null;
            
            const isCenter = node.nodeType === "center";
            const radius = isCenter ? 12 : (node.nodeType === "page" ? 9 : 7);
            
            return createElement(
              "g",
              {
                key: `node-${node.id}`,
                "data-id": node.id,
                transform: `translate(${node.x}, ${node.y})`,
                className: "local-graph-node",
                onClick: (e: any) => handleNodeClick(e, node.id),
                style: { cursor: "pointer" },
              },
              // 圆形节点
              createElement("circle", {
                r: radius,
                fill: nodeColors[node.nodeType],
                stroke: isCenter ? "#fff" : "none",
                strokeWidth: isCenter ? 2 : 0,
              }),
              // 标签
              createElement("text", {
                dy: -radius - 4,
                textAnchor: "middle",
                style: {
                  fontSize: isCenter ? "12px" : "10px",
                  fill: "var(--orca-color-text-1)",
                  fontWeight: isCenter ? 600 : 400,
                  pointerEvents: "none",
                },
              }, node.title)
            );
          })
        )
      )
    ),
    // 图例
    createElement(
      "div",
      { 
        style: { 
          display: "flex", 
          gap: "12px", 
          marginTop: "8px", 
          fontSize: "10px",
          color: "var(--orca-color-text-2)",
          flexWrap: "wrap",
        } 
      },
      createElement("span", null, 
        createElement("span", { style: { display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: nodeColors.page, marginRight: 4 } }),
        "页面"
      ),
      createElement("span", null,
        createElement("span", { style: { display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: nodeColors.block, marginRight: 4 } }),
        "块"
      ),
      createElement("span", null,
        createElement("span", { style: { display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: nodeColors.tag, marginRight: 4 } }),
        "标签"
      ),
      createElement("span", null,
        createElement("span", { style: { display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: nodeColors.property, marginRight: 4 } }),
        "属性"
      )
    ),
    // 缩放指示
    createElement(
      "div",
      { 
        style: { 
          position: "absolute", 
          bottom: isFullscreen ? 30 : 10, 
          right: 10, 
          fontSize: "10px", 
          color: "var(--orca-color-text-3)",
          background: "var(--orca-color-bg-1)",
          padding: "2px 6px",
          borderRadius: "4px",
        } 
      },
      `${Math.round(transform.scale * 100)}%`
    )
  );
}
