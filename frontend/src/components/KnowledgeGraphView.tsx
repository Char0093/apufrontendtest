import React, { useRef, useEffect, useState, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { GraphData, GraphNode, Meeting } from '../types';
import { useApp } from '../context/AppContext';
import {
  Filter,
  X,
  Mail,
  Phone,
  User,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  MessageSquare,
  Send,
  CheckCircle2,
  Plus,
  Minus,
  Maximize2,
  Info
} from 'lucide-react';

interface KnowledgeGraphViewProps {
  data?: GraphData;
  meetings?: Meeting[];
  currentMeetingId?: string;
  onSelectMeetingId?: (meetingId: string) => void;
  onSendDirectMessage?: (recipientName: string, text: string) => void;
}

// Node type styling — backend node types are capitalized (Meeting, Person,
// Decision, ActionItem, Project); this is the single source of truth for
// color/label/short-tag per type so the legend, node canvas rendering, and
// detail panel all agree.
const TYPE_STYLE: Record<string, { color: string; tag: string; label: string }> = {
  Meeting: { color: '#3b82f6', tag: 'M', label: 'Meeting' },
  Decision: { color: '#16a34a', tag: 'D', label: 'Decision' },
  Person: { color: '#9333ea', tag: 'P', label: 'Person' },
  Project: { color: '#f97316', tag: 'Pr', label: 'Project' },
  ActionItem: { color: '#d97706', tag: 'A', label: 'Action Item' },
};
const DEFAULT_STYLE = { color: '#64748b', tag: '?', label: 'Node' };

function styleFor(type: string | undefined) {
  return TYPE_STYLE[type || ''] || DEFAULT_STYLE;
}

// Relationship edge types -> human-readable phrasing for the connections
// list, from the perspective of the clicked node ("outgoing" = clicked node
// is the link's source, "incoming" = clicked node is the target).
const RELATION_PHRASING: Record<string, [string, string]> = {
  PARTICIPATED_IN: ['participated in', 'has participant'],
  MADE_IN: ['made in', 'produced'],
  MADE_BY: ['made by', 'authored'],
  ASSIGNED_TO: ['assigned to', 'assignee of'],
  RELATES_TO: ['relates to', 'related from'],
  CONTRADICTS: ['contradicts', 'contradicted by'],
};

function relationPhrase(linkType: string | undefined, incoming: boolean): string {
  const pair = RELATION_PHRASING[linkType || ''];
  if (pair) return incoming ? pair[1] : pair[0];
  return (linkType || 'related').toLowerCase().replace(/_/g, ' ');
}

export const KnowledgeGraphView: React.FC<KnowledgeGraphViewProps> = ({
  data,
  meetings,
  currentMeetingId,
  onSendDirectMessage
}) => {
  const { sendDirectMessage } = useApp();
  const fgRef = useRef<any>();
  const containerRef = useRef<HTMLDivElement>(null);

  // react-force-graph-2d's own auto-sizing measures the container on mount
  // and doesn't reliably react to CSS-driven size changes (e.g. this box's
  // height depending on vh, or a flex-column parent that gives it no
  // intrinsic height) — it can silently fall back to raw window dimensions.
  // Measuring the wrapper ourselves and passing explicit width/height keeps
  // the canvas locked to its actual box at all times.
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => setDimensions({ width: el.clientWidth, height: el.clientHeight });
    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const completedMeetings = useMemo(() => {
    return (meetings || []).filter(m => m.status === 'Completed');
  }, [meetings]);

  const [selectedMeetingId, setSelectedMeetingId] = useState<string>(
    currentMeetingId || completedMeetings[0]?.id || 'ALL'
  );

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    if (currentMeetingId) {
      setSelectedMeetingId(currentMeetingId);
    }
  }, [currentMeetingId]);

  const activeGraphData: GraphData = useMemo(() => {
    if (selectedMeetingId !== 'ALL' && completedMeetings.length > 0) {
      const targetMtg = completedMeetings.find(m => m.id === selectedMeetingId);
      if (targetMtg && targetMtg.graphData && targetMtg.graphData.nodes.length > 0) {
        return {
          nodes: targetMtg.graphData.nodes.map(n => ({ ...n })),
          links: targetMtg.graphData.links.map(l => ({ ...l }))
        };
      }
    }

    if (data && data.nodes && data.nodes.length > 0) {
      if (selectedMeetingId !== 'ALL') {
        const filteredNodes = data.nodes.filter(n => n.meetingId === selectedMeetingId);
        const nodeIds = new Set(filteredNodes.map(n => n.id));
        const filteredLinks = data.links.filter(l => nodeIds.has(l.source as string) && nodeIds.has(l.target as string));

        if (filteredNodes.length > 0) {
          return {
            nodes: filteredNodes.map(n => ({ ...n })),
            links: filteredLinks.map(l => ({ ...l }))
          };
        }
      }

      return {
        nodes: data.nodes.map(n => ({ ...n })),
        links: data.links.map(l => ({ ...l }))
      };
    }

    const firstMtg = completedMeetings[0];
    if (firstMtg?.graphData) {
      return {
        nodes: firstMtg.graphData.nodes.map(n => ({ ...n })),
        links: firstMtg.graphData.links.map(l => ({ ...l }))
      };
    }

    return { nodes: [], links: [] };
  }, [selectedMeetingId, data, completedMeetings]);

  // Configure force layout parameters & auto zoom-to-fit when active graph data changes
  useEffect(() => {
    setSelectedNode(null);
    setShowMessageModal(false);

    if (fgRef.current) {
      fgRef.current.d3Force('charge')?.strength(-1000).distanceMax(1200);
      fgRef.current.d3Force('link')?.distance(220);
      fgRef.current.d3ReheatSimulation();

      const timer = setTimeout(() => {
        if (fgRef.current && fgRef.current.zoomToFit) {
          fgRef.current.zoomToFit(400, 50);
        }
      }, 250);

      return () => clearTimeout(timer);
    }
  }, [selectedMeetingId, activeGraphData]);

  // Any node click opens the generic detail panel (Meeting/Decision/
  // Person/Project/ActionItem alike) — previously only Person nodes did.
  const handleNodeClick = (node: any) => {
    if (!node) return;
    setSelectedNode(node as GraphNode);
    setIsCopied(false);
    setShowMessageModal(false);
  };

  // Every node/link this one touches, with a human-readable relationship —
  // this is what renders as "CONNECTIONS (N)" in the detail panel.
  const nodeConnections = useMemo(() => {
    if (!selectedNode) return [];
    const nodeMap = new Map(activeGraphData.nodes.map(n => [n.id, n]));
    const seen = new Set<string>();
    const results: { node: GraphNode; relation: string }[] = [];

    for (const link of activeGraphData.links) {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as any)?.id;
      const targetId = typeof link.target === 'string' ? link.target : (link.target as any)?.id;

      let other: GraphNode | undefined;
      let incoming = false;
      if (sourceId === selectedNode.id) {
        other = nodeMap.get(targetId);
      } else if (targetId === selectedNode.id) {
        other = nodeMap.get(sourceId);
        incoming = true;
      }

      if (other && !seen.has(`${other.id}:${link.label}:${incoming}`)) {
        seen.add(`${other.id}:${link.label}:${incoming}`);
        results.push({ node: other, relation: relationPhrase(link.label, incoming) });
      }
    }
    return results;
  }, [selectedNode, activeGraphData]);

  const handleCopyContact = () => {
    if (!selectedNode) return;
    const text = `Name: ${selectedNode.name}\nRole: ${selectedNode.role || 'Team Member'}\nEmail: ${selectedNode.email || 'N/A'}\nPhone: ${selectedNode.phone || 'N/A'}`;
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleSendMessage = () => {
    if (!selectedNode || !messageText.trim()) return;

    sendDirectMessage(selectedNode.name, messageText.trim());

    if (onSendDirectMessage) {
      onSendDirectMessage(selectedNode.name, messageText.trim());
    }

    setToastMessage(`Message sent to ${selectedNode.name}!`);
    setShowToast(true);
    setShowMessageModal(false);
    setMessageText('');

    setTimeout(() => setShowToast(false), 3500);
  };

  const zoomBy = (factor: number) => {
    if (fgRef.current) {
      fgRef.current.zoom(fgRef.current.zoom() * factor, 300);
    }
  };
  const zoomToFit = () => {
    fgRef.current?.zoomToFit(400, 50);
  };

  return (
    <div ref={containerRef} className="w-full h-[calc(100vh-260px)] min-h-[700px] bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 relative overflow-hidden flex flex-col justify-between shadow-sm font-sans">
      {/* Toast Alert */}
      {showToast && (
        <div className="absolute top-4 right-4 z-50 flex items-center gap-3 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-emerald-500/30 animate-in fade-in slide-in-from-top-2 duration-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Legend + Meeting Filter (top-left) */}
      <div className="absolute top-3 left-3 z-10 bg-white/95 dark:bg-slate-900/95 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm backdrop-blur-md space-y-2 max-w-[calc(100%-6rem)]">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Legend:</span>
          {Object.entries(TYPE_STYLE).map(([type, style]) => (
            <div key={type} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-medium">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: style.color }} />
              {style.label}
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-medium">
            <span className="w-3.5 h-0.5 rounded-full inline-block bg-red-500" style={{ borderTop: '2px dashed #ef4444', height: 0 }} />
            Contradicts
          </div>
        </div>

        {completedMeetings.length > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Filter className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <select
              value={selectedMeetingId}
              onChange={(e) => setSelectedMeetingId(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-white text-xs font-semibold focus:outline-hidden focus:border-blue-600 shadow-2xs cursor-pointer"
            >
              <option value="ALL">All Meetings (Combined Nodes)</option>
              {completedMeetings.map((mtg) => (
                <option key={mtg.id} value={mtg.id}>
                  {mtg.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Zoom Controls (top-right) */}
      <div className="absolute top-3 right-3 z-20 flex flex-col gap-1.5">
        <button
          onClick={() => zoomBy(1.3)}
          title="Zoom in"
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 shadow-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={() => zoomBy(1 / 1.3)}
          title="Zoom out"
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 shadow-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={zoomToFit}
          title="Fit to view"
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 shadow-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {activeGraphData.nodes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          No graph data yet.
        </div>
      ) : dimensions.width === 0 || dimensions.height === 0 ? null : (
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={activeGraphData}
          cooldownTicks={100}
          d3VelocityDecay={0.3}
          linkDirectionalParticles={2}
          linkDirectionalParticleSpeed={0.005}
          linkDirectionalParticleWidth={2}
          nodeRelSize={6}
          onNodeClick={handleNodeClick}
          nodeLabel={(node: any) => `${node.name} (${styleFor(node.type).label})`}
          nodeColor={(node: any) => node.color || styleFor(node.type).color}
          linkLabel={(link: any) => link.isContradiction ? `⚠ CONTRADICTS — ${link.message || link.label || ''}` : (link.label || '')}
          linkColor={(link: any) => link.isContradiction ? '#ef4444' : '#94a3b8'}
          linkLineDash={(link: any) => link.isContradiction ? [4, 2] : null}
          linkWidth={(link: any) => link.isContradiction ? 2.5 : 1.5}
          backgroundColor="transparent"
          nodeCanvasObject={(node: any, ctx, globalScale) => {
            const style = styleFor(node.type);
            const isSelected = selectedNode?.id === node.id;
            // Full name is always in the hover tooltip (nodeLabel) and the
            // detail panel — the canvas label is truncated and only drawn
            // past a zoom threshold (or for the selected node) so a graph
            // with many long decision/action sentences doesn't turn into
            // unreadable overlapping text at the default fit-to-view zoom.
            const rawLabel: string = node.name || '';
            const label = rawLabel.length > 22 ? `${rawLabel.slice(0, 21)}…` : rawLabel;
            const showLabel = isSelected || globalScale > 1.1;
            const fontSize = 12 / globalScale;
            // World-space draws scale with zoom by default (that's how the
            // giant-circle bug happened) — dividing by globalScale, same as
            // fontSize above, keeps the node's on-screen size constant.
            const radius = 7 / globalScale;

            // Node Circle
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
            ctx.fillStyle = node.color || style.color;
            ctx.fill();
            ctx.strokeStyle = isSelected ? '#1e293b' : '#ffffff';
            ctx.lineWidth = (isSelected ? 3 : 2) / globalScale;
            ctx.stroke();

            // Type tag inside the node
            const tagFontSize = 7 / globalScale;
            ctx.font = `bold ${tagFontSize}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(style.tag, node.x, node.y);

            if (!showLabel) return;

            ctx.font = `${fontSize}px Inter, sans-serif`;
            const textWidth = ctx.measureText(label).width;
            const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.4);
            const labelY = node.y + radius + 2;

            // Label background
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillRect(
              node.x - bckgDimensions[0] / 2,
              labelY,
              bckgDimensions[0],
              bckgDimensions[1]
            );

            ctx.fillStyle = '#1e293b';
            ctx.fillText(label, node.x, labelY + bckgDimensions[1] / 2);
          }}
        />
      )}

      {/* Node Detail Panel — any node type, not just Person */}
      {selectedNode && (
        <div className="absolute top-24 right-4 z-30 w-84 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xl backdrop-blur-md animate-fade-in space-y-4 max-h-[calc(100%-7rem)] overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl text-white flex items-center justify-center font-bold text-sm shadow-md shrink-0"
                style={{ backgroundColor: styleFor(selectedNode.type).color }}
              >
                {styleFor(selectedNode.type).tag}
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{selectedNode.name}</h4>
                <span
                  className="inline-block px-2 py-0.2 rounded-md text-[10px] font-bold text-white"
                  style={{ backgroundColor: styleFor(selectedNode.type).color }}
                >
                  {styleFor(selectedNode.type).label}
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedNode(null);
                setShowMessageModal(false);
              }}
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Connections list */}
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Info className="w-3 h-3" /> Connections ({nodeConnections.length})
            </div>
            {nodeConnections.length === 0 ? (
              <p className="text-xs text-slate-400">No connections found.</p>
            ) : (
              <div className="space-y-1.5">
                {nodeConnections.map((c, i) => (
                  <div
                    key={`${c.node.id}-${i}`}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full inline-block shrink-0"
                        style={{ backgroundColor: styleFor(c.node.type).color }}
                      />
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{c.node.name}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 pl-3.5">
                      {c.relation} · {styleFor(c.node.type).label.toLowerCase()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Person-specific: contact + message actions */}
          {selectedNode.type === 'Person' && (
            <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Mail className="w-3 h-3 text-blue-600 dark:text-blue-400" /> Email
                </div>
                <a
                  href={`mailto:${selectedNode.email || 'contact@corporatebrain.ai'}`}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1.5 truncate"
                >
                  <span>{selectedNode.email || 'contact@corporatebrain.ai'}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Phone className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> Phone
                </div>
                <a
                  href={`tel:${selectedNode.phone || '+60 12-345 6789'}`}
                  className="text-xs font-semibold text-slate-800 dark:text-slate-200 hover:text-blue-600 flex items-center gap-1.5"
                >
                  <span>{selectedNode.phone || '+60 12-345 6789'}</span>
                </a>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Corporate Brain Verified
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => {
                    setShowMessageModal(true);
                    if (!messageText) {
                      setMessageText(`Hi ${selectedNode.name.split(' ')[0]}, regarding our recent meeting decision: `);
                    }
                  }}
                  className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer text-center"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Direct Message</span>
                </button>

                <button
                  onClick={handleCopyContact}
                  className="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                  <span>{isCopied ? 'Copied!' : 'Copy Info'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* In-App Quick Direct Message Modal */}
      {showMessageModal && selectedNode && (
        <div className="absolute inset-0 z-40 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-md">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Send Message to {selectedNode.name}
                  </h4>
                </div>
              </div>
              <button
                onClick={() => setShowMessageModal(false)}
                className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Message Area */}
            <div className="space-y-1">
              <textarea
                rows={3}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type your direct message here..."
                className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:border-blue-600 transition-all"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowMessageModal(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold text-xs hover:bg-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={!messageText.trim()}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50 transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Message</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeGraphView;
