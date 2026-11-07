"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import ReactMarkdown from "react-markdown";
import {
  UploadCloud,
  FileText,
  Trash2,
  RefreshCw,
  Send,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Loader2,
  BookOpen,
  Network,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

interface DocItem {
  id: string;
  name: string;
  status: string;
}

interface GraphRel {
  source: string;
  target: string;
  type: string;
}

interface GraphNode extends d3.SimulationNodeDatum {
  key: string;
  name: string;
  type: string;
  mentions: number;
  rels?: GraphRel[];
}

interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
}

interface SourceCitation {
  document: string;
  text: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceCitation[];
  loading?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  Supplier: "#10b981",
  Manufacturer: "#3b82f6",
  Company: "#8b5cf6",
  Component: "#f97316",
  Product: "#f59e0b",
  Facility: "#eab308",
  Region: "#06b6d4",
  Country: "#14b8a6",
  Port: "#d946ef",
  RiskEvent: "#ef4444",
  Regulation: "#64748b",
  Person: "#ec4899",
  Entity: "#94a3b8",
};

const LEGEND_ITEMS = [
  { label: "Supplier", color: "#10b981" },
  { label: "Manufacturer", color: "#3b82f6" },
  { label: "Company", color: "#8b5cf6" },
  { label: "RiskEvent", color: "#ef4444" },
  { label: "Region", color: "#06b6d4" },
  { label: "Component", color: "#f97316" },
  { label: "Other", color: "#94a3b8" },
];

const STARTER_PROMPTS = [
  "Which suppliers or manufacturers are mentioned in the reports?",
  "What supply chain risks or disruptions are identified?",
  "Which regions or countries are connected to key suppliers?",
];

export default function SupplyChainExplorerPage() {
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [searchFilter, setSearchFilter] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{
    text: string;
    type: "info" | "success" | "error";
  } | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<{
    node: GraphNode;
    x: number;
    y: number;
  } | null>(null);

  const graphContainerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(
    null
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      if (!res.ok) throw new Error("Failed to load documents");
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : []);
    } catch {
      setStatusMsg({
        text: "Backend or Neo4j is unreachable.",
        type: "error",
      });
    }
  }, []);

  const fetchGraph = useCallback(async () => {
    try {
      const res = await fetch("/api/graph");
      if (!res.ok) throw new Error("Failed to load graph");
      const data = await res.json();
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
    } catch {
      // Keep existing state on transient error
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
    fetchGraph();
  }, [fetchDocuments, fetchGraph]);

  // Auto-resize textarea up to 140px max threshold
  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [question, adjustTextareaHeight]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Upload file handler
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setStatusMsg({
      text: `Extracting entities from ${file.name}…`,
      type: "info",
    });

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Upload failed");
      }
      setStatusMsg({
        text: `Indexed ${data.chunks} passages from ${file.name}.`,
        type: "success",
      });
      await fetchDocuments();
      await fetchGraph();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setStatusMsg({ text: message, type: "error" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Delete document handler
  const handleDeleteDocument = async (id: string, name: string) => {
    setDeletingId(id);
    setStatusMsg({ text: `Deleting ${name}…`, type: "info" });
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Could not delete document");
      }
      setStatusMsg({ text: `Deleted ${name}.`, type: "success" });
      await fetchDocuments();
      await fetchGraph();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Could not delete document";
      setStatusMsg({ text: message, type: "error" });
    } finally {
      setDeletingId(null);
    }
  };

  // Submit question handler
  const handleAsk = async (customQuestion?: string) => {
    const text = (customQuestion ?? question).trim();
    if (!text || asking) return;

    if (!customQuestion) {
      setQuestion("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }

    const userMsgId = `${Date.now()}-user`;
    const assistantMsgId = `${Date.now()}-assistant`;

    setAsking(true);
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: text },
      {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        loading: true,
      },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Request failed");
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: data.answer || "No response generated.",
                sources: data.sources || [],
                loading: false,
              }
            : m
        )
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Request failed";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: `⚠️ ${message}`,
                loading: false,
              }
            : m
        )
      );
    } finally {
      setAsking(false);
    }
  };

  // Render D3 Force Graph
  useEffect(() => {
    const container = graphContainerRef.current;
    if (!container) return;

    container.innerHTML = "";
    if (!nodes.length) return;

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 460;

    const query = searchFilter.trim().toLowerCase();
    const filteredNodes: GraphNode[] = nodes
      .filter((n) => !query || n.name.toLowerCase().includes(query) || n.type.toLowerCase().includes(query))
      .map((n) => ({ ...n }));

    const nodeKeySet = new Set(filteredNodes.map((n) => n.key));
    const filteredLinks: GraphEdge[] = edges
      .filter(
        (e) =>
          nodeKeySet.has(String(e.source)) && nodeKeySet.has(String(e.target))
      )
      .map((e) => ({
        source: String(e.source),
        target: String(e.target),
        type: e.type,
      }));

    const getRadius = (n: GraphNode) =>
      Math.min(7 + Number(n.mentions || 0) * 1.5, 22);

    const topKeys = new Set(
      filteredNodes
        .slice()
        .sort((a, b) => (b.mentions || 0) - (a.mentions || 0))
        .slice(0, 20)
        .map((n) => n.key)
    );

    const svg = d3
      .select(container)
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .style("position", "absolute")
      .style("inset", "0");

    svgRef.current = svg.node();

    svg
      .append("defs")
      .append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -4 8 8")
      .attr("refX", 8)
      .attr("refY", 0)
      .attr("markerWidth", 5)
      .attr("markerHeight", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4L8,0L0,4")
      .attr("fill", "#cbd5e1");

    const g = svg.append("g");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 5])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    zoomBehaviorRef.current = zoom;
    svg.call(zoom);

    const simulation = d3
      .forceSimulation<GraphNode>(filteredNodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphEdge>(filteredLinks)
          .id((d) => d.key)
          .distance(85)
          .strength(0.35)
      )
      .force("charge", d3.forceManyBody().strength(-230))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collide",
        d3.forceCollide<GraphNode>().radius((d) => getRadius(d) + 12)
      );

    const link = g
      .append("g")
      .selectAll("line")
      .data(filteredLinks)
      .join("line")
      .attr("stroke", "#cbd5e1")
      .attr("stroke-width", 1.25)
      .attr("stroke-opacity", 0.7)
      .attr("marker-end", "url(#arrow)");

    const node = g
      .append("g")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(filteredNodes)
      .join("g")
      .style("cursor", "pointer")
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    node
      .append("circle")
      .attr("r", (d) => getRadius(d))
      .attr("fill", (d) => TYPE_COLORS[d.type] || "#94a3b8")
      .attr("fill-opacity", 0.88)
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2);

    node
      .filter((d) => topKeys.has(d.key) || Boolean(query))
      .append("text")
      .attr("dy", (d) => getRadius(d) + 12)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("font-weight", 500)
      .attr("fill", "#334155")
      .attr("pointer-events", "none")
      .text((d) => (d.name.length > 18 ? `${d.name.slice(0, 16)}…` : d.name));

    node
      .on("mousemove", (event, d) => {
        setHoveredNode({
          node: d,
          x: event.clientX,
          y: event.clientY,
        });
      })
      .on("mouseleave", () => {
        setHoveredNode(null);
      })
      .on("click", (_, d) => {
        const rels = (d.rels || [])
          .filter((x) => x.target)
          .map((x) => `${x.type} → ${x.target}`)
          .join(", ");
        setQuestion(
          `Tell me about ${d.name}${
            rels ? ` and its connections: ${rels}` : ""
          }`
        );
      });

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
        .attr("y1", (d) => (d.source as GraphNode).y ?? 0)
        .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
        .attr("y2", (d) => (d.target as GraphNode).y ?? 0);

      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, searchFilter]);

  const handleZoom = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(250)
      .call(zoomBehaviorRef.current.scaleBy, factor);
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(300)
      .call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-full lg:w-72 shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 p-5 flex flex-col gap-6 min-w-0">
        {/* Clean Brand Header — no redundant G icon */}
        <div className="border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2 text-teal-600 font-semibold text-xs uppercase tracking-wider mb-1">
            <Network className="w-3.5 h-3.5" />
            <span>Graph RAG</span>
          </div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">
            Supply Chain Explorer
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Supplier &amp; logistics risk intelligence
          </p>
        </div>

        {/* Upload & Sources Section */}
        <div className="flex flex-col gap-3 min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Documents
            </h2>
            <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full">
              {documents.length} {documents.length === 1 ? "file" : "files"}
            </span>
          </div>

          <label
            htmlFor="file-upload"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFileUpload(f);
            }}
            className={`group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition cursor-pointer ${
              uploading
                ? "border-teal-300 bg-teal-50/40 pointer-events-none"
                : "border-slate-200 hover:border-teal-500 hover:bg-teal-50/30 bg-slate-50/60"
            }`}
          >
            {uploading ? (
              <>
                <Loader2 className="w-6 h-6 text-teal-600 animate-spin mb-2" />
                <span className="text-xs font-semibold text-teal-700">
                  Processing document…
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5">
                  Extracting entities &amp; graph links
                </span>
              </>
            ) : (
              <>
                <UploadCloud className="w-6 h-6 text-teal-600 group-hover:scale-110 transition-transform mb-1.5" />
                <span className="text-xs font-semibold text-slate-800">
                  Upload supply-chain report
                </span>
                <span className="text-[11px] text-slate-400 mt-0.5">
                  PDF, DOCX, TXT, MD, CSV (max 20 MB)
                </span>
              </>
            )}
            <input
              ref={fileInputRef}
              id="file-upload"
              type="file"
              accept=".pdf,.docx,.txt,.md,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
              }}
            />
          </label>

          {/* Status Toast */}
          {statusMsg && (
            <div
              className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs border ${
                statusMsg.type === "error"
                  ? "bg-red-50 border-red-200 text-red-700"
                  : statusMsg.type === "success"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-slate-100 border-slate-200 text-slate-600"
              }`}
            >
              {statusMsg.type === "error" ? (
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              ) : statusMsg.type === "success" ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              ) : (
                <Loader2 className="w-3.5 h-3.5 shrink-0 mt-0.5 animate-spin" />
              )}
              <span className="break-words min-w-0 flex-1">
                {statusMsg.text}
              </span>
            </div>
          )}

          {/* Document List */}
          <div className="flex flex-col gap-2 mt-1 overflow-y-auto max-h-80 lg:max-h-none min-w-0">
            {documents.length === 0 ? (
              <div className="text-center py-6 px-3 rounded-xl border border-slate-100 bg-slate-50/50 text-xs text-slate-400">
                No reports indexed yet. Upload a document above to build the
                graph.
              </div>
            ) : (
              documents.map((doc) => {
                const isDeleting = deletingId === doc.id;
                return (
                  <div
                    key={doc.id}
                    className={`flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm transition hover:border-slate-300 min-w-0 ${
                      isDeleting ? "opacity-50 pointer-events-none" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p
                          title={doc.name}
                          className="text-xs font-medium text-slate-800 truncate"
                        >
                          {doc.name}
                        </p>
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          {doc.status}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      title={`Delete ${doc.name}`}
                      onClick={() => handleDeleteDocument(doc.id, doc.name)}
                      className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                    >
                      {isDeleting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header — clean, no Local Workspace pill */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Trace Supply Chain Connections
            </h2>
            <p className="text-xs text-slate-500">
              Inspect multi-hop supplier relationships and query risks grounded
              in source passages.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 font-medium text-slate-700">
              {nodes.length} Entities
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 font-medium text-slate-700">
              {edges.length} Relationships
            </span>
          </div>
        </header>

        {/* Workspace Grid */}
        <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-4 p-4 sm:p-5 overflow-y-auto xl:overflow-hidden min-h-0">
          {/* Graph Panel (7 cols on xl) */}
          <section className="xl:col-span-7 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden min-h-[420px]">
            {/* Graph Toolbar */}
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Knowledge Graph
                </h3>
                <p className="text-[11px] text-slate-400">
                  Drag nodes to rearrange · Click any node to query its
                  connections
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Filter entities…"
                    className="pl-7 pr-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-teal-500 w-36 sm:w-44 transition"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleZoom(1.25)}
                  title="Zoom In"
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleZoom(0.8)}
                  title="Zoom Out"
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleResetZoom}
                  title="Reset View"
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={fetchGraph}
                  title="Refresh Graph"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Graph Canvas */}
            <div className="relative flex-1 bg-slate-50/40 min-h-[320px]">
              <div ref={graphContainerRef} className="absolute inset-0" />
              {nodes.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                  <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mb-2">
                    <Network className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-medium text-slate-600">
                    No graph entities yet
                  </p>
                  <p className="text-[11px] text-slate-400 max-w-xs mt-0.5">
                    Upload a supplier report or disclosure from the left sidebar
                    to extract entities and build the graph.
                  </p>
                </div>
              )}
            </div>

            {/* Graph Legend */}
            <div className="px-4 py-2.5 border-t border-slate-100 bg-white flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
              {LEGEND_ITEMS.map((item) => (
                <span key={item.label} className="inline-flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  {item.label}
                </span>
              ))}
            </div>
          </section>

          {/* Chat Panel (5 cols on xl) */}
          <section className="xl:col-span-5 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden min-h-[450px]">
            {/* Chat Header */}
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Ask the Supply Chain Graph
                </h3>
                <p className="text-[11px] text-slate-400">
                  Multi-hop graph traversal with cited source passages
                </p>
              </div>
            </div>

            {/* Messages Container */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8">
                  <p className="text-xs font-medium text-slate-600 mb-3">
                    Ask a question about suppliers, components, facilities, or
                    risks:
                  </p>
                  <div className="flex flex-col gap-2 w-full max-w-sm">
                    {STARTER_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => handleAsk(prompt)}
                        className="text-left text-xs px-3.5 py-2.5 rounded-xl border border-slate-200/90 bg-slate-50/70 hover:bg-teal-50/50 hover:border-teal-300 text-slate-700 transition"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.role === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`max-w-[92%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                        msg.role === "user"
                          ? "bg-teal-600 text-white rounded-br-sm whitespace-pre-wrap"
                          : "bg-slate-50 border border-slate-200/80 text-slate-800 rounded-bl-sm"
                      }`}
                    >
                      {msg.loading ? (
                        <div className="flex items-center gap-2 text-slate-500 italic">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                          <span>Traversing graph and gathering evidence…</span>
                        </div>
                      ) : msg.role === "assistant" ? (
                        <div className="markdown-prose">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        msg.content
                      )}

                      {/* Cited Sources */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex flex-col gap-2">
                          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-teal-700">
                            <BookOpen className="w-3 h-3" />
                            <span>Supporting Evidence ({msg.sources.length})</span>
                          </div>
                          {msg.sources.map((src, idx) => (
                            <div
                              key={idx}
                              className="rounded-lg bg-white border border-slate-200/90 p-2.5 text-[11px] text-slate-600"
                            >
                              <p className="font-semibold text-teal-700 mb-1 truncate">
                                Source {idx + 1} · {src.document}
                              </p>
                              <p className="leading-snug text-slate-600">
                                {src.text.length > 320
                                  ? `${src.text.slice(0, 320)}…`
                                  : src.text}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input Box with Auto-Grow up to 140px */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAsk();
              }}
              className="p-3 border-t border-slate-100 bg-white"
            >
              <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/60 focus-within:bg-white focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/15 px-3 py-2 transition">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAsk();
                    }
                  }}
                  placeholder="Ask a supply-chain question…"
                  style={{ maxHeight: "140px", minHeight: "24px" }}
                  className="flex-1 resize-none bg-transparent border-0 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none overflow-y-auto leading-relaxed"
                />
                <button
                  type="submit"
                  disabled={!question.trim() || asking}
                  className="shrink-0 w-8 h-8 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-400 text-white flex items-center justify-center transition"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[10px] text-center text-slate-400 mt-1.5">
                Enter to send · Shift + Enter for a new line
              </p>
            </form>
          </section>
        </div>
      </main>

      {/* Floating Graph Tooltip */}
      {hoveredNode && (
        <div
          style={{
            left: hoveredNode.x + 14,
            top: hoveredNode.y - 10,
          }}
          className="fixed z-50 pointer-events-none bg-slate-900 text-slate-100 rounded-xl p-3 text-xs shadow-xl max-w-xs border border-slate-700"
        >
          <p className="font-semibold text-teal-300 text-sm">
            {hoveredNode.node.name}
          </p>
          <span className="inline-block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
            {hoveredNode.node.type} · {hoveredNode.node.mentions} mention
            {hoveredNode.node.mentions === 1 ? "" : "s"}
          </span>
          {hoveredNode.node.rels &&
            hoveredNode.node.rels.filter((r) => r.target).length > 0 && (
              <div className="mt-1.5 pt-1.5 border-t border-slate-700/80 space-y-1 text-[11px] text-slate-300">
                {hoveredNode.node.rels
                  .filter((r) => r.target)
                  .slice(0, 5)
                  .map((r, i) => (
                    <div key={i}>
                      <span className="text-teal-400 font-medium">
                        {r.type}
                      </span>{" "}
                      → {r.target}
                    </div>
                  ))}
              </div>
            )}
        </div>
      )}
    </div>
  );
}

