import React, { useState, useEffect } from 'react';
import { Meeting, GraphData, ActionItem } from '../types';
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  Users,
  ShieldCheck,
  FileText,
  BrainCircuit,
  Search,
  CheckSquare,
  Sparkles,
  Download,
  Trash2,
  ArrowUpRight,
  PenLine,
} from 'lucide-react';
import { ActionItemsTable } from './ActionItemsTable';
import { DecisionGraph } from './DecisionGraph';
import { useApp } from '../context/AppContext';
import { downloadMeetingReport, buildLocalMeetingGraph, getGraphData, toGraphData, getWhiteboard } from '../services/api';

interface MeetingDetailViewProps {
  meeting?: Meeting | null;
  selectedMeetingId?: string;
  meetings?: Meeting[];
  currentUser?: any;
  onBackToDashboard?: () => void;
  onClose?: () => void;
  onSendDirectMessage?: (recipientName: string, text: string) => void;
}

export const MeetingDetailView: React.FC<MeetingDetailViewProps> = ({
  meeting,
  onBackToDashboard,
  onClose,
}) => {
  const { meetings, currentUser, deleteMeeting, sendDirectMessage } = useApp();

  const currentMeeting =
    meetings?.find((m) => m.id === (meeting?.id || '')) ||
    meeting ||
    (meetings && meetings.length > 0 ? meetings[0] : null);

  const [activeTab, setActiveTab] = useState<'decisions' | 'actionItems' | 'transcript' | 'graph' | 'whiteboard'>('decisions');
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [highlightedSegmentId, setHighlightedSegmentId] = useState<string | null>(null);

  // Only ever set for live-meeting-sourced records (see the tab's own
  // conditional below) — fetched once per meeting, not per tab-click, so
  // switching to the tab doesn't flash a loading state every time.
  const [whiteboardUrl, setWhiteboardUrl] = useState<string | null>(null);
  const [whiteboardLoading, setWhiteboardLoading] = useState(false);

  useEffect(() => {
    if (!currentMeeting || currentMeeting.source !== 'live' || !currentMeeting.roomCode) {
      setWhiteboardUrl(null);
      return;
    }
    let cancelled = false;
    setWhiteboardLoading(true);
    getWhiteboard(currentMeeting.roomCode).then((blob) => {
      if (cancelled) return;
      setWhiteboardUrl(blob ? URL.createObjectURL(blob) : null);
      setWhiteboardLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMeeting?.id, currentMeeting?.roomCode, currentMeeting?.source]);

  // Revoke the blob URL when it's replaced or the component unmounts, so a
  // long session switching between several live meetings' whiteboards
  // doesn't leak object URLs.
  useEffect(() => {
    return () => {
      if (whiteboardUrl) URL.revokeObjectURL(whiteboardUrl);
    };
  }, [whiteboardUrl]);

  const handleJumpToTranscript = (timestamp?: string, speaker?: string, segmentId?: string) => {
    setActiveTab('transcript');
    setTranscriptSearch('');

    setTimeout(() => {
      const transcriptList = currentMeeting?.transcript || [];
      let match = segmentId ? transcriptList.find((t) => t.id === segmentId) : null;

      if (!match) {
        const cleanTs = timestamp ? timestamp.replace(/[\[\]()]/g, '').trim() : '';
        match = transcriptList.find((t) => {
          const tTime = (t.time || '').replace(/[\[\]()]/g, '').trim();
          if (cleanTs && (tTime === cleanTs || tTime.startsWith(cleanTs.slice(0, 5)) || cleanTs.includes(tTime))) {
            return true;
          }
          if (speaker && t.speaker && t.speaker.toLowerCase().includes(speaker.toLowerCase())) {
            return true;
          }
          return false;
        });
      }

      if (match) {
        setHighlightedSegmentId(match.id);
        const elem = document.getElementById(`seg-${match.id}`);
        if (elem) {
          elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        setTimeout(() => setHighlightedSegmentId(null), 4500);
      }
    }, 150);
  };

    const formatDisplayDateTime = (dateTimeStr?: string): string => {
    if (!dateTimeStr) return 'Recently';
    if (!dateTimeStr.includes('T') && !dateTimeStr.includes('Z')) return dateTimeStr;
    try {
      const d = new Date(dateTimeStr);
      if (isNaN(d.getTime())) return dateTimeStr;
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return dateTimeStr.split('T')[0] || dateTimeStr;
    }
  };

  const formatEvidenceText = (evidenceStr: string, speakerMap?: Record<string, string>): string => {
    if (!evidenceStr) return '';
    let cleaned = evidenceStr;
    const defaultMap: Record<string, string> = {
      SPEAKER_00: 'YAP',
      SPEAKER_0: 'YAP',
      SPEAKER_01: 'THIM',
      SPEAKER_1: 'THIM',
      SPEAKER_02: 'KAM',
      SPEAKER_2: 'KAM',
      SPEAKER_03: 'Duncan',
      SPEAKER_3: 'Duncan',
      'Yap En Yu': 'Duncan',
      ...(speakerMap || {}),
    };
    Object.entries(defaultMap).forEach(([rawTag, name]) => {
      if (name && !name.toLowerCase().includes('speaker')) {
        const regex = new RegExp(`\\b${rawTag}\\b`, 'gi');
        cleaned = cleaned.replace(regex, name);
      }
    });
    return cleaned;
  };

  const getEvidenceDetails = (decision: any, transcriptList: any[], speakerMap?: Record<string, string>) => {
    const rawEv = decision.evidence || '';
    let cleanedEv = formatEvidenceText(rawEv, speakerMap);

    let match = transcriptList.find((t) => {
      if (decision.timestamp && (t.time === decision.timestamp || t.time.includes(decision.timestamp) || decision.timestamp.includes(t.time))) {
        return true;
      }
      if (rawEv && t.text && (t.text.toLowerCase().includes(rawEv.toLowerCase().slice(0, 15)) || rawEv.toLowerCase().includes(t.text.toLowerCase().slice(0, 15)))) {
        return true;
      }
      return false;
    });

    const speaker = match?.speaker || decision.speaker || 'Participant';
    const timestamp = match?.time || decision.timestamp || '00:00:00';
    const segmentId = match?.id;

    return { cleanedEv, speaker, timestamp, segmentId };
  };

  const [meetingGraphData, setMeetingGraphData] = useState<GraphData | undefined>(() => {
    return currentMeeting ? buildLocalMeetingGraph(currentMeeting) : undefined;
  });

  useEffect(() => {
    if (!currentMeeting) {
      setMeetingGraphData(undefined);
      return;
    }
    let cancelled = false;
    const localGraph = buildLocalMeetingGraph(currentMeeting);
    setMeetingGraphData(localGraph);

    getGraphData(currentMeeting.id).then((backendGraph) => {
      if (!cancelled && backendGraph && backendGraph.nodes && backendGraph.nodes.length > 0) {
        const bgData = toGraphData(backendGraph);
        // If backend has decision/action nodes, use it; otherwise merge with local rich graph
        if (bgData.nodes.some((n) => n.type === 'Decision' || n.type === 'ActionItem')) {
          setMeetingGraphData(bgData);
        } else {
          // Merge local decisions and actions so graph always shows all nodes
          const nodeMap = new Map<string, any>();
          bgData.nodes.forEach((n) => nodeMap.set(n.id, n));
          localGraph.nodes.forEach((n) => {
            if (!nodeMap.has(n.id)) nodeMap.set(n.id, n);
          });
          const allLinks = [...bgData.links, ...localGraph.links.filter((l) => !bgData.links.some((bl) => bl.label === l.label && String(bl.source) === String(l.source) && String(bl.target) === String(l.target)))];
          setMeetingGraphData({ nodes: Array.from(nodeMap.values()), links: allLinks });
        }
      }
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [currentMeeting?.id, currentMeeting?.decisions?.length, currentMeeting?.actionItems?.length]);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportReport = async () => {
    if (!currentMeeting) return;
    setIsExporting(true);
    try {
      const filename = `${currentMeeting.title.replace(/\s+/g, '_')}_report.md`;
      await downloadMeetingReport(currentMeeting.id, filename);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteMeeting = async () => {
    if (!currentMeeting) return;
    if (window.confirm(`Are you sure you want to permanently delete "${currentMeeting.title}" and its storage artifacts?`)) {
      await deleteMeeting(currentMeeting.id);
      if (onClose) {
        onClose();
      } else if (onBackToDashboard) {
        onBackToDashboard();
      }
    }
  };

  useEffect(() => {
    if (!currentMeeting) {
      setMeetingGraphData(undefined);
      return;
    }
    setMeetingGraphData(currentMeeting.graphData);
  }, [currentMeeting]);

  if (!currentMeeting) {
    return (
      <div className="max-w-[1920px] w-full mx-auto px-8 py-12 text-center text-slate-500">
        No meeting selected.
      </div>
    );
  }

  const [actionItemsState, setActionItemsState] = useState<ActionItem[]>(currentMeeting.actionItems || []);
  useEffect(() => {
    setActionItemsState(currentMeeting.actionItems || []);
  }, [currentMeeting]);

  const transcriptList = currentMeeting.transcript || [];
  const filteredTranscript = transcriptList.filter(
    (t) =>
      t.speaker.toLowerCase().includes(transcriptSearch.toLowerCase()) ||
      t.text.toLowerCase().includes(transcriptSearch.toLowerCase())
  );

  const onSendDirectMessage = (recipientName: string, text: string) => {
    sendDirectMessage(recipientName, text);
  };

  return (
    <div className="max-w-[1920px] w-full mx-auto px-4 sm:px-8 py-6 space-y-6 animate-fade-in font-sans text-slate-900 dark:text-slate-100">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose || onBackToDashboard}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold transition-all shadow-2xs cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              {currentMeeting.title}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                {formatDisplayDateTime(currentMeeting.dateTime)}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                {currentMeeting.participants.length} Participants
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-800">
                {currentMeeting.project}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportReport}
            disabled={isExporting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold transition-all shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>{isExporting ? 'Exporting...' : 'Export Markdown'}</span>
          </button>
          <button
            onClick={handleDeleteMeeting}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/60 text-xs font-bold transition-all shadow-2xs cursor-pointer"
            title="Delete this meeting"
          >
            <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Tabs Header */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('decisions')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'decisions'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-300" /> Decisions Made ({currentMeeting.decisions?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('actionItems')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'actionItems'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <CheckSquare className="w-4 h-4" /> Action Items ({actionItemsState.length})
        </button>
        <button
          onClick={() => setActiveTab('transcript')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'transcript'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" /> Transcript ({transcriptList.length})
        </button>
        <button
          onClick={() => setActiveTab('graph')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'graph'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <BrainCircuit className="w-4 h-4" /> Memory Graph
        </button>
        {currentMeeting.source === 'live' && (
          <button
            onClick={() => setActiveTab('whiteboard')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'whiteboard'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <PenLine className="w-4 h-4" /> Whiteboard
          </button>
        )}
      </div>

      {/* SUB-VIEW 1: DECISIONS SECTION */}
      {activeTab === 'decisions' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" /> What Decisions Were Made
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              AI-extracted with confidence scoring
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {currentMeeting.decisions && currentMeeting.decisions.length > 0 ? (
              currentMeeting.decisions.map((decision) => (
                <div
                  key={decision.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4 hover:shadow-md transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {decision.category && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {decision.category}
                          </span>
                        )}
                        {decision.timestamp && (
                          <button
                            type="button"
                            onClick={() => handleJumpToTranscript(decision.timestamp, decision.speaker)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-blue-100/70 hover:bg-blue-200 dark:bg-blue-950/60 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700 text-xs font-bold font-mono transition-all cursor-pointer shadow-2xs"
                            title="Click to jump to this moment in Transcript"
                          >
                            <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            <span>{decision.timestamp}</span>
                            <ArrowUpRight className="w-3 h-3 ml-0.5" />
                          </button>
                        )}
                      </div>
                      <h4 className="text-base font-bold text-slate-900 dark:text-white">{decision.title}</h4>
                      {decision.speaker && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium border border-slate-200 dark:border-slate-700">
                          <User className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          <span>
                            Decided / Proposed by:{' '}
                            <strong className="text-slate-900 dark:text-white font-semibold">{decision.speaker}</strong>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Confidence Score Badge */}
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold shrink-0">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>{decision.confidenceScore}% AI Confidence</span>
                    </span>
                  </div>

                  {/* Rationale */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-1">
                    <div className="text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Reason / Rationale
                    </div>
                    <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">{decision.rationale}</p>
                  </div>

                  {/* Supporting Evidence */}
                  {decision.evidence &&
                    (() => {
                      const details = getEvidenceDetails(
                        decision,
                        currentMeeting?.transcript || [],
                        currentMeeting?.speaker_map
                      );
                      return (
                        <div
                          onClick={() => handleJumpToTranscript(details.timestamp, details.speaker, details.segmentId)}
                          className="p-4.5 rounded-2xl bg-amber-50/80 hover:bg-amber-100/90 dark:bg-amber-950/30 dark:hover:bg-amber-900/40 border border-amber-200/90 dark:border-amber-800/60 space-y-2.5 cursor-pointer group transition-all shadow-2xs hover:shadow-md hover:border-amber-300 dark:hover:border-amber-600"
                          title="Click to jump directly to this line in the Transcript"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/60 dark:border-amber-800/40 pb-2">
                            <div className="text-xs font-extrabold text-amber-900 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                              <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Supporting Transcript Evidence
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-200/80 dark:bg-amber-900/60 text-amber-950 dark:text-amber-200 text-xs font-bold border border-amber-300/80 dark:border-amber-700">
                                <User className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" /> {details.speaker}
                              </span>

                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-200 text-xs font-mono font-bold border border-blue-200 dark:border-blue-800 group-hover:bg-blue-200 dark:group-hover:bg-blue-900 transition-colors shadow-2xs">
                                <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> [{details.timestamp}]
                                <ArrowUpRight className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                              </span>
                            </div>
                          </div>

                          <blockquote className="text-xs sm:text-sm italic text-amber-950 dark:text-amber-100 font-serif leading-relaxed pl-2.5 border-l-2 border-amber-400 dark:border-amber-500">
                            "{details.cleanedEv}"
                          </blockquote>
                        </div>
                      );
                    })()}
                </div>
              ))
            ) : (
              <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm space-y-2">
                <Sparkles className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No decisions recorded</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">No decisions were extracted for this meeting.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: ACTION ITEMS SECTION */}
      {activeTab === 'actionItems' && (
        <div className="animate-fade-in">
          <ActionItemsTable
            actionItems={actionItemsState}
            meetingId={currentMeeting.id}
            currentUser={currentUser || { id: 'u1', name: 'Thim Yee Song', email: 'thimyee@company.com', role: 'VP of Product', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80', status: 'online' }}
            meetingHost={currentMeeting.participants[0]}
            onUpdateActionItems={setActionItemsState}
          />
        </div>
      )}

      {/* SUB-VIEW 3: TRANSCRIPT SECTION */}
      {activeTab === 'transcript' && (
        <div className="space-y-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 transition-colors">
            <div className="relative w-full max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search speaker or keyword in transcript..."
                value={transcriptSearch}
                onChange={(e) => setTranscriptSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-600"
              />
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Showing {filteredTranscript.length} segments
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm space-y-3 max-h-[550px] overflow-y-auto transition-colors">
            {filteredTranscript.length > 0 ? (
              filteredTranscript.map((t) => (
                <div
                  key={t.id}
                  id={`seg-${t.id}`}
                  className={`p-4 rounded-2xl border transition-all space-y-2 ${
                    highlightedSegmentId === t.id
                      ? 'bg-blue-50 dark:bg-blue-950/70 border-blue-500 shadow-md ring-2 ring-blue-400'
                      : 'bg-slate-50/80 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" /> {t.speaker}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 font-mono">[{t.time}]</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-sans">{t.text}</p>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-slate-500 dark:text-slate-400 text-sm">
                No transcript segments found matching "{transcriptSearch}".
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-VIEW 4: KNOWLEDGE GRAPH SECTION */}
      {activeTab === 'graph' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Knowledge Graph (Persons, Decisions, Actions & Risks)
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">Interactive Visual Graph</span>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 shadow-sm">
            <DecisionGraph data={meetingGraphData} currentMeetingId={currentMeeting.id} meetings={meetings} onSendDirectMessage={onSendDirectMessage} />
          </div>
        </div>
      )}

      {/* SUB-VIEW 5: WHITEBOARD SECTION — live meetings only */}
      {activeTab === 'whiteboard' && currentMeeting.source === 'live' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <PenLine className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Whiteboard
            </h3>
            {whiteboardUrl && (
              <a
                href={whiteboardUrl}
                download={`Whiteboard_${currentMeeting.roomCode || currentMeeting.id}.pdf`}
                className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Download className="w-3.5 h-3.5" /> Download PDF
              </a>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 shadow-sm">
            {whiteboardLoading ? (
              <div className="flex items-center justify-center h-96 text-slate-400 dark:text-slate-500 text-sm">
                Loading whiteboard...
              </div>
            ) : whiteboardUrl ? (
              <iframe
                src={whiteboardUrl}
                title="Meeting Whiteboard"
                className="w-full h-[75vh] rounded-2xl border border-slate-200 dark:border-slate-800"
              />
            ) : (
              <div className="flex items-center justify-center h-96 text-slate-400 dark:text-slate-500 text-sm">
                No whiteboard content was captured in this meeting.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};