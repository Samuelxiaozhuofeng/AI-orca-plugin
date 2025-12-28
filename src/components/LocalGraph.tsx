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
 * - Shows block aliases if available
 */

import * as d3Force from "d3-force";

const React = window.React as any;
const { createElement, useState, useEffect, useRef, useMemo, useCallback } = React;

interface GraphNode {
  id: number;
  title: string;
  isCenter: boolean;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphLink {
  source: number | GraphNode;
  target: number | GraphNode;
}

interface LocalGraphProps {
  blockId: number;
}

// Get block title helper - prioritize alias, then content
function getBlockTitle(blockId: number): string {
  const block = orca.state.blocks[blockId];
  if (!block) return `Block ${blockId}`;
  
  // First try aliases (array of strings)
  if (block.aliases && Array.isArray(block.aliases) && block.aliases.length > 0) {
    const alias = block.aliases[0];
    if (typeof alias === "string" && alias.trim()) {
      const trimmed = alias.trim();
      return trimmed.length > 30 ? trimmed.substring(0, 30) + "..." : trimmed;
    }
  }
  
  // Then try text field
  const rawText = block.text;
  if (typeof rawText === "string" && rawText.trim()) {
    // Get first line, remove markdown formatting
    let text = rawText.split("\n")[0]?.trim() || "";
    // Remove common markdown prefixes
    text = text.replace(/^#+\s*/, ""); // headings
    text = text.replace(/^[-*+]\s*/, ""); // list items
    text = text.replace(/^\d+\.\s*/, ""); // numbered list
    text = text.replace(/^>\s*/, ""); // blockquote
    text = text.trim();
    if (text) {
      return text.length > 30 ? text.substring(0, 30) + "..." : text;
    }
  }
  
  // Then try content field (some blocks use this instead of text)
  const rawContent = (block as any).content;
  if (typeof rawContent === "string" && rawContent.trim()) {
    let content = rawContent.split("\n")[0]?.trim() || "";
    content = content.replace(/^#+\s*/, "");
    content = content.replace(/^[-*+]\s*/, "");
    content = content.trim();
    if (content) {
      return content.length > 30 ? content.substring(0, 30) + "..." : content;
    }
  }
  
  // Fallback to block ID
  return `Block ${blockId}`;
}

// Build graph data from block refs
function buildGraphData(centerBlockId: number): { nodes: GraphNode[]; links: GraphLink[] } {
  const block = orca.state.blocks[centerBlockId];
  if (!block) {
    return { nodes: [], links: [] };
  }

  const nodesMap = new Map<number, GraphNode>();
  const links: GraphLink[] = [];

  // Add center node
  nodesMap.set(centerBlockId, {
    id: centerBlockId,
    title: getBlockTitle(centerBlockId),
    isCenter: true,
  });

  // Add outgoing refs
  if (block.refs && Array.isArray(block.refs)) {
    for (const ref of block.refs) {
      const targetId = ref.to;
      if (!nodesMap.has(targetId)) {
        nodesMap.set(targetId, {
          id: targetId,
          title: getBlockTitle(targetId),
          isCenter: false,
        });
      }
      links.push({ source: centerBlockId, target: targetId });
    }
  }

  // Add incoming refs (backlinks)
  if (block.backRefs && Array.isArray(block.backRefs)) {
    for (const ref of block.backRefs) {
      const sourceId = ref.from;
      if (!nodesMap.has(sourceId)) {
        nodesMap.set(sourceId, {
          id: sourceId,
          title: getBlockTitle(sourceId),
          isCenter: false,
        });
      }
      links.push({ source: sourceId, target: centerBlockId });
    }
  }

  return {
    nodes: Array.from(nodesMap.values()),
    links,
  };
}

export default function LocalGraph({ blockId }: LocalGraphProps) {
  const containerRef = useRef(null) as any;
  const svgRef = useRef(null) as any;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 100, height: 300 });
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [nodes, setNodes] = useState([] as GraphNode[]);
  const [links, setLinks] = useState([] as GraphLink[]);
  const [draggedNode, setDraggedNode] = useState(null as GraphNode | null);
  const simulationRef = useRef(null) as any;
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  // Build graph data
  const graphData = useMemo(() => buildGraphData(blockId), [blockId]);

  // Measure container width and update dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (isFullscreen) {
        setDimensions({ width: window.innerWidth - 40, height: window.innerHeight - 100 });
      } else if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth || 400;
        // Calculate height based on node count, min 250, max 400
        const nodeCount = graphData.nodes.length;
        const baseHeight = Math.min(400, Math.max(250, 150 + nodeCount * 20));
        setDimensions({ width: containerWidth - 2, height: baseHeight });
      }
    };
    
    updateDimensions();
    
    // Use ResizeObserver for responsive updates
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current && !isFullscreen) {
      resizeObserver.observe(containerRef.current);
    }
    
    // Also listen to window resize for fullscreen mode
    window.addEventListener("resize", updateDimensions);
    
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateDimensions);
    };
  }, [isFullscreen, graphData.nodes.length]);


  // Initialize simulation
  useEffect(() => {
    if (graphData.nodes.length === 0) return;

    const { width, height } = dimensions;
    const nodesCopy: GraphNode[] = graphData.nodes.map((n: GraphNode) => ({ ...n }));
    const linksCopy: GraphLink[] = graphData.links.map((l: GraphLink) => ({ ...l }));

    const simulation = d3Force.forceSimulation<GraphNode>(nodesCopy)
      .force("link", d3Force.forceLink<GraphNode, GraphLink>(linksCopy)
        .id(d => d.id)
        .distance(80))
      .force("charge", d3Force.forceManyBody().strength(-200))
      .force("center", d3Force.forceCenter(width / 2, height / 2))
      .force("collision", d3Force.forceCollide().radius(35));

    simulationRef.current = simulation;

    simulation.on("tick", () => {
      setNodes([...nodesCopy]);
      setLinks([...linksCopy]);
    });

    return () => {
      simulation.stop();
    };
  }, [graphData, dimensions]);

  // Handle node drag
  const handleNodeMouseDown = useCallback((e: any, node: GraphNode) => {
    e.stopPropagation();
    isDraggingRef.current = true;
    setDraggedNode(node);
    
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    lastMouseRef.current = {
      x: (e.clientX - rect.left - transform.x) / transform.scale,
      y: (e.clientY - rect.top - transform.y) / transform.scale,
    };

    // Fix node position
    node.fx = node.x;
    node.fy = node.y;
    simulationRef.current?.alphaTarget(0.3).restart();
  }, [transform]);

  const handleMouseMove = useCallback((e: any) => {
    if (!isDraggingRef.current || !draggedNode) return;
    
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left - transform.x) / transform.scale;
    const y = (e.clientY - rect.top - transform.y) / transform.scale;

    draggedNode.fx = x;
    draggedNode.fy = y;
  }, [draggedNode, transform]);

  const handleMouseUp = useCallback(() => {
    if (draggedNode) {
      draggedNode.fx = null;
      draggedNode.fy = null;
      simulationRef.current?.alphaTarget(0);
    }
    isDraggingRef.current = false;
    setDraggedNode(null);
  }, [draggedNode]);

  // Handle zoom
  const handleWheel = useCallback((e: any) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.3, Math.min(3, transform.scale * delta));
    
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setTransform((prev: { x: number; y: number; scale: number }) => ({
      x: mouseX - (mouseX - prev.x) * (newScale / prev.scale),
      y: mouseY - (mouseY - prev.y) * (newScale / prev.scale),
      scale: newScale,
    }));
  }, [transform.scale]);

  // Handle pan (drag background)
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  const handleBackgroundMouseDown = useCallback((e: any) => {
    if (e.target === svgRef.current || e.target.tagName === "svg") {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
    }
  }, [transform]);

  const handlePanMove = useCallback((e: any) => {
    if (isPanning) {
      setTransform((prev: { x: number; y: number; scale: number }) => ({
        ...prev,
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      }));
    }
  }, [isPanning]);

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Handle node click - navigate to block
  const handleNodeClick = useCallback((nodeId: number) => {
    if (isDraggingRef.current) return;
    try {
      orca.nav.openInLastPanel("block", { blockId: nodeId });
    } catch (error) {
      console.error("[LocalGraph] Navigation failed:", error);
    }
  }, []);

  // Reset view
  const resetView = useCallback(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
  }, []);

  // Node colors
  const getNodeColor = (node: GraphNode) => {
    if (node.isCenter) return "#007bff";
    return "#6c757d";
  };

  if (graphData.nodes.length === 0) {
    return createElement(
      "div",
      { className: "local-graph-empty" },
      "暂无链接关系"
    );
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
      } : undefined,
    },
    // Toolbar
    createElement(
      "div",
      { className: "local-graph-toolbar" },
      createElement(
        "span",
        { className: "local-graph-title" },
        `链接图谱 (${nodes.length} 节点)`
      ),
      createElement(
        "div",
        { className: "local-graph-actions" },
        createElement(
          "button",
          { 
            className: "local-graph-btn",
            onClick: resetView,
            title: "重置视图",
          },
          createElement("i", { className: "ti ti-refresh" })
        ),
        createElement(
          "button",
          { 
            className: "local-graph-btn",
            onClick: () => setIsFullscreen(!isFullscreen),
            title: isFullscreen ? "退出全屏" : "全屏",
          },
          createElement("i", { className: isFullscreen ? "ti ti-minimize" : "ti ti-maximize" })
        )
      )
    ),
    // SVG Graph
    createElement(
      "svg",
      {
        ref: svgRef,
        width,
        height,
        className: "local-graph-svg",
        onMouseDown: handleBackgroundMouseDown,
        onMouseMove: (e: any) => { handleMouseMove(e); handlePanMove(e); },
        onMouseUp: () => { handleMouseUp(); handlePanEnd(); },
        onMouseLeave: () => { handleMouseUp(); handlePanEnd(); },
        onWheel: handleWheel,
        style: { cursor: isPanning ? "grabbing" : "grab" },
      },
      createElement(
        "g",
        { transform: `translate(${transform.x}, ${transform.y}) scale(${transform.scale})` },
        // Links
        createElement(
          "g",
          { className: "local-graph-links" },
          ...links.map((link: GraphLink, i: number) => {
            const source = link.source as GraphNode;
            const target = link.target as GraphNode;
            if (!source.x || !source.y || !target.x || !target.y) return null;
            
            return createElement("line", {
              key: `link-${i}`,
              x1: source.x,
              y1: source.y,
              x2: target.x,
              y2: target.y,
              className: "local-graph-link",
            });
          })
        ),
        // Nodes
        createElement(
          "g",
          { className: "local-graph-nodes" },
          ...nodes.map((node: GraphNode) => {
            if (!node.x || !node.y) return null;
            
            return createElement(
              "g",
              {
                key: `node-${node.id}`,
                transform: `translate(${node.x}, ${node.y})`,
                className: "local-graph-node",
                onMouseDown: (e: any) => handleNodeMouseDown(e, node),
                onClick: () => handleNodeClick(node.id),
                style: { cursor: "pointer" },
              },
              // Circle
              createElement("circle", {
                r: node.isCenter ? 10 : 7,
                fill: getNodeColor(node),
                className: "local-graph-circle",
              }),
              // Label
              createElement(
                "text",
                {
                  dy: node.isCenter ? -14 : -10,
                  textAnchor: "middle",
                  className: "local-graph-label",
                },
                node.title
              )
            );
          })
        )
      )
    ),
    // Zoom indicator
    createElement(
      "div",
      { className: "local-graph-zoom" },
      `${Math.round(transform.scale * 100)}%`
    )
  );
}
