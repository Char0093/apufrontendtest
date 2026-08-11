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
  CheckCircle2
} from 'lucide-react';

interface KnowledgeGraphViewProps {
  data?: GraphData;
  meetings?: Meeting[];
  currentMeetingId?: string;
  onSelectMeetingId?: (meetingId: string) => void;
  onSendDirectMessage?: (recipientName: string, text: string) => void;
}

export const KnowledgeGraphView: React.FC<KnowledgeGraphViewProps> = ({ 
  data, 
  meetings,
  currentMeetingId,
  onSendDirectMessage
}) => {
  const { openDmWithUser, sendDirectMessage } = useApp();
  const fgRef = useRef<any>();
  
  const completedMeetings = useMemo(() => {
    return (meetings || []).filter(m => m.status === 'Completed');
  }, [meetings]);

  // Initial selected meeting ID state
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>(
    currentMeetingId || completedMeetings[0]?.id || 'ALL'
  );

  const [selectedParticipant, setSelectedParticipant] = useState<GraphNode | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Sync state if currentMeetingId prop updates
  useEffect(() => {
    if (currentMeetingId) {
      setSelectedMeetingId(currentMeetingId);
    }
  }, [currentMeetingId]);

  // Helper/Selector function: get strictly filtered graph data by meeting ID
  const activeGraphData: GraphData = useMemo(() => {
    // Case 1: Specific meeting selected from dropdown or props
    if (selectedMeetingId !== 'ALL' && completedMeetings.length > 0) {
      const targetMtg = completedMeetings.find(m => m.id === selectedMeetingId);
      if (targetMtg && targetMtg.graphData && targetMtg.graphData.nodes.length > 0) {
        return {
          nodes: targetMtg.graphData.nodes.map(n => ({ ...n })),
          links: targetMtg.graphData.links.map(l => ({ ...l }))
        };
      }
    }

    // Case 2: Filter by meetingId tag on data nodes/links if data prop provided
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

    // Default Fallback
    const firstMtg = completedMeetings[0];
    if (firstMtg?.graphData) {
      return {
        nodes: firstMtg.graphData.nodes.map(n => ({ ...n })),
        links: firstMtg.graphData.links.map(l => ({ ...l }))
      };
    }

    return {
      nodes: [
        { id: 'Alice Chen', name: 'Alice Chen (VP Eng)', type: 'participant', val: 18, color: '#4f46e5', role: 'VP of Engineering & Cloud Infra', email: 'alice.chen@corporatebrain.ai', phone: '+60 12-345 6789' },
        { id: 'Elena Rostova', name: 'Elena Rostova (Lead Arch)', type: 'participant', val: 18, color: '#4f46e5', role: 'Principal Software Architect', email: 'elena.rostova@corporatebrain.ai', phone: '+60 12-456 7890' },
        { id: 'Neptune DB', name: 'Migrate to GCP Anthos', type: 'decision', val: 20, color: '#16a34a' },
        { id: 'Redis Cache', name: 'Implement Redis Caching', type: 'decision', val: 18, color: '#16a34a' },
        { id: 'Benchmarking', name: 'Run Latency Tests', type: 'action', val: 14, color: '#d97706' },
      ],
      links: [
        { source: 'Alice Chen', target: 'Neptune DB', label: 'Approved' },
        { source: 'Elena Rostova', target: 'Redis Cache', label: 'Proposed' },
        { source: 'Elena Rostova', target: 'Benchmarking', label: 'Assigned' }
      ]
    };
  }, [selectedMeetingId, data, completedMeetings]);

  // Dynamically extract ONLY active meeting participants for quick contact pills
  const activeParticipants = useMemo(() => {
    const pMap = new Map<string, GraphNode>();
    (activeGraphData.nodes || []).forEach(n => {
      if (n.type === 'participant' || n.role || n.email) {
        pMap.set(n.id, n);
      }
    });
    return Array.from(pMap.values());
  }, [activeGraphData]);

  // Configure force layout parameters & auto zoom-to-fit when active graph data changes
  useEffect(() => {
    setSelectedParticipant(null);
    setShowMessageModal(false);

    if (fgRef.current) {
      fgRef.current.d3Force('charge')?.strength(-350).distanceMax(500);
      fgRef.current.d3Force('link')?.distance(90);
      fgRef.current.d3ReheatSimulation();

      const timer = setTimeout(() => {
        if (fgRef.current && fgRef.current.zoomToFit) {
          fgRef.current.zoomToFit(400, 50);
        }
      }, 250);

      return () => clearTimeout(timer);
    }
  }, [selectedMeetingId, activeGraphData]);

  // Handle node click
  const handleNodeClick = (node: any) => {
    if (node) {
      const participantName = node.id || node.name;
      const matchedNode = activeParticipants.find(
        p => p.id === participantName || p.name === participantName || p.name.includes(participantName)
      ) || node;

      if (matchedNode.type === 'participant' || matchedNode.email || matchedNode.role) {
        setSelectedParticipant(matchedNode as GraphNode);
        setIsCopied(false);
      }
    }
  };

  // Copy contact details to clipboard
  const handleCopyContact = () => {
    if (!selectedParticipant) return;
    const text = `Name: ${selectedParticipant.name}\nRole: ${selectedParticipant.role || 'Team Member'}\nEmail: ${selectedParticipant.email || 'N/A'}\nPhone: ${selectedParticipant.phone || 'N/A'}`;
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Send Direct Message handler
  const handleSendMessage = () => {
    if (!selectedParticipant || !messageText.trim()) return;

    sendDirectMessage(selectedParticipant.name, messageText.trim());

    if (onSendDirectMessage) {
      onSendDirectMessage(selectedParticipant.name, messageText.trim());
    }

    setToastMessage(`Message sent to ${selectedParticipant.name}!`);
    setShowToast(true);
    setShowMessageModal(false);
    setMessageText('');

    setTimeout(() => setShowToast(false), 3500);
  };

  return (
    <div className="w-full h-[520px] bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 relative overflow-hidden flex flex-col justify-between shadow-sm font-sans">
      {/* Toast Alert */}
      {showToast && (
        <div className="absolute top-4 right-4 z-50 flex items-center gap-3 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-emerald-500/30 animate-in fade-in slide-in-from-top-2 duration-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Top Toolbar: Legend, Meeting Dropdown & Quick Contact Directory */}
      <div className="absolute top-3 left-3 right-3 z-10 bg-white/95 dark:bg-slate-900/95 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm backdrop-blur-md space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Graph Legend */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Legend:</span>
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" /> Participant (Click for Contact)
            </div>
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /> Decision
            </div>
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block" /> Action Item
            </div>
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block" /> Risk/Blocker
            </div>
          </div>

          {/* Meeting Dropdown Selector */}
          {completedMeetings.length > 0 && (
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <select
                value={selectedMeetingId}
                onChange={(e) => setSelectedMeetingId(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-white text-xs font-semibold focus:outline-hidden focus:border-indigo-600 shadow-2xs cursor-pointer"
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

        {/* Quick Participant Contact Pills */}
        {activeParticipants.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="text-[11px] font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1">
              <User className="w-3 h-3 text-indigo-600 dark:text-indigo-400" /> Meeting Participants:
            </span>
            {activeParticipants.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedParticipant(p);
                  setIsCopied(false);
                  setShowMessageModal(false);
                }}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all cursor-pointer ${
                  selectedParticipant?.id === p.id
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                    : 'bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                }`}
              >
                👤 {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Force Graph Canvas */}
      <ForceGraph2D
        ref={fgRef}
        graphData={activeGraphData}
        cooldownTicks={100}
        d3VelocityDecay={0.3}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalParticleWidth={2}
        nodeRelSize={6}
        onNodeClick={handleNodeClick}
        nodeLabel={(node: any) => 
          node.type === 'participant'
            ? `👤 ${node.name} • ${node.role || 'Click for Direct Messaging'}`
            : `${node.name} (${node.type})`
        }
        nodeColor={(node: any) => node.color || (
          node.type === 'participant' ? '#4f46e5' :
          node.type === 'decision' ? '#16a34a' :
          node.type === 'action' ? '#d97706' : '#dc2626'
        )}
        linkLabel={(link: any) => link.label || ''}
        linkColor={() => '#94a3b8'}
        linkWidth={1.5}
        backgroundColor="transparent"
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const label = node.name;
          const fontSize = 12 / globalScale;
          ctx.font = `${fontSize}px Inter, sans-serif`;
          const textWidth = ctx.measureText(label).width;
          const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.4);

          // Node Circle
          ctx.beginPath();
          ctx.arc(node.x, node.y, 7, 0, 2 * Math.PI, false);
          ctx.fillStyle = node.color || (node.type === 'participant' ? '#4f46e5' : '#16a34a');
          ctx.fill();
          ctx.strokeStyle = node.type === 'participant' ? '#818cf8' : '#ffffff';
          ctx.lineWidth = 2 / globalScale;
          ctx.stroke();

          // Label background
          ctx.fillStyle = node.type === 'participant' ? 'rgba(238, 242, 255, 0.95)' : 'rgba(255, 255, 255, 0.9)';
          ctx.fillRect(
            node.x - bckgDimensions[0] / 2,
            node.y + 9,
            bckgDimensions[0],
            bckgDimensions[1]
          );

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = node.type === 'participant' ? '#312e81' : '#1e293b';
          ctx.fillText(label, node.x, node.y + 9 + bckgDimensions[1] / 2);
        }}
      />

      {/* Participant Contact Info Side Drawer */}
      {selectedParticipant && (
        <div className="absolute top-24 right-4 z-30 w-84 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xl backdrop-blur-md animate-fade-in space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-md shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{selectedParticipant.name}</h4>
                <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold">{selectedParticipant.role || 'Participant'}</p>
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedParticipant(null);
                setShowMessageModal(false);
              }}
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Contact Details List */}
          <div className="space-y-2.5 text-xs">
            {/* Email */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Mail className="w-3 h-3 text-indigo-600 dark:text-indigo-400" /> Gmail / Email Address
              </div>
              <a
                href={`mailto:${selectedParticipant.email || 'contact@corporatebrain.ai'}`}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1.5 truncate"
              >
                <span>{selectedParticipant.email || 'contact@corporatebrain.ai'}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>

            {/* Phone */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Phone className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> Direct Phone Number
              </div>
              <a
                href={`tel:${selectedParticipant.phone || '+60 12-345 6789'}`}
                className="text-xs font-semibold text-slate-800 dark:text-slate-200 hover:text-indigo-600 flex items-center gap-1.5"
              >
                <span>{selectedParticipant.phone || '+60 12-345 6789'}</span>
              </a>
            </div>

            {/* Organization Tag */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Corporate Brain Verified
              </span>
              <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-slate-600 dark:text-slate-400 font-bold">
                ID: {selectedParticipant.id}
              </span>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => {
                setShowMessageModal(true);
                if (!messageText) {
                  setMessageText(`Hi ${selectedParticipant.name.split(' ')[0]}, regarding our recent meeting decision: `);
                }
              }}
              className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer text-center"
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

      {/* In-App Quick Direct Message Modal */}
      {showMessageModal && selectedParticipant && (
        <div className="absolute inset-0 z-40 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-md">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Send Message to {selectedParticipant.name}
                  </h4>
                  <span className="inline-block px-2 py-0.2 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 text-[10px] font-bold">
                    {selectedParticipant.role || 'Team Member'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowMessageModal(false)}
                className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Template Tag Chips */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Quick Template Tags:</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setMessageText(`Hi ${selectedParticipant.name.split(' ')[0]}, following up on the GCP Migration decision.`)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950 text-slate-700 dark:text-slate-300 text-[11px] font-medium border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                >
                  GCP Migration Decision
                </button>
                <button
                  type="button"
                  onClick={() => setMessageText(`Hi ${selectedParticipant.name.split(' ')[0]}, checking in on your assigned action item.`)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950 text-slate-700 dark:text-slate-300 text-[11px] font-medium border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                >
                  Action Item Follow-up
                </button>
              </div>
            </div>

            {/* Message Area */}
            <div className="space-y-1">
              <textarea
                rows={3}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type your direct message here..."
                className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:border-indigo-600 transition-all"
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
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50 transition-all cursor-pointer"
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
