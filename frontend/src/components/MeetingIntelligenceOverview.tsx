import React, { useState, useMemo } from 'react';
import {
  BrainCircuit,
  Loader2,
  Sparkles,
  Calendar,
  Clock,
  Users,
  ChevronLeft,
  ChevronRight,
  Upload,
  Video,
  FileText,
  Plus,
  X,
  Bot,
  Trash2,
  Hash
} from 'lucide-react';
import { Meeting } from '../types';
import { CocoProcessingModal } from './CocoProcessingModal';
import { UploadModal } from './UploadModal';
import { useApp } from '../context/AppContext';

interface Props {
  meetings: Meeting[];
  onSelectMeeting: (meeting: Meeting) => void;
  onSelectMeetingId: (meetingId: string) => void;
}

const PAGE_SIZE = 6;

/* Classify the meeting origin */
function meetingType(m: Meeting): 'scheduled' | 'live' | 'upload' {
  // 1. Explicit uploaded video flags
  if (m.audioFileName || (m as any).type === 'upload') {
    return 'upload';
  }

  // 2. Scheduled / upcoming meetings
  const lowerTitle = (m.title || '').toLowerCase();
  if (
    m.status === 'Scheduled' ||
    m.id?.startsWith('mtg-sched') ||
    lowerTitle.startsWith('upcoming:') ||
    lowerTitle.startsWith('scheduled:')
  ) {
    return 'scheduled';
  }

  // 3. Live meetings (starts with 'Live:' or has active roomCode)
  if (
    m.roomCode ||
    lowerTitle.startsWith('live:') ||
    lowerTitle.startsWith('live room') ||
    lowerTitle.startsWith('room:')
  ) {
    return 'live';
  }

  // 4. All uploaded and processed intelligence defaults to 'upload'
  return 'upload';
}

const TypeBadge: React.FC<{ type: ReturnType<typeof meetingType> }> = ({ type }) => {
  const cfg = {
    scheduled: { label: 'Scheduled', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', Icon: Calendar },
    live: { label: 'Live Room', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300', Icon: Video },
    upload: { label: 'Uploaded', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', Icon: Upload },
  }[type];
  const Icon = cfg.Icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${cfg.cls}`}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
};

export const MeetingIntelligenceOverview: React.FC<Props> = ({ meetings, onSelectMeeting }) => {
  const { deleteMeeting, stopAllProcessing, processAudioForMeeting } = useApp();
  const [page, setPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'scheduled' | 'live' | 'upload'>('ALL');
  const [search, setSearch] = useState('');

  // Modals state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [activeProcessingMeeting, setActiveProcessingMeeting] = useState<Meeting | null>(null);

  // Truly active in-progress processing meetings (strictly exclude 'Failed', 'Scheduled', 'Completed')
  const processing = useMemo(() => {
    return meetings.filter(
      (m) =>
        m.status !== 'Completed' &&
        m.status !== 'Scheduled' &&
        m.status !== 'Failed' &&
        ['Preprocessing', 'ASR', 'LLM', 'Graph', 'Retrying', 'Pending'].includes(m.status)
    );
  }, [meetings]);

  const completed = useMemo(
    () => meetings.filter((m) => m.status === 'Completed'),
    [meetings]
  );

  const filtered = useMemo(() => {
    return completed.filter((m) => {
      const mt = meetingType(m);
      if (typeFilter !== 'ALL' && mt !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          m.title.toLowerCase().includes(q) ||
          (m.participants || []).some((p) =>
            (typeof p === 'string' ? p : (p as any).name || '').toLowerCase().includes(q)
          )
        );
      }
      return true;
    });
  }, [completed, typeFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const handleFilter = (f: typeof typeFilter) => {
    setTypeFilter(f);
    setPage(0);
  };

  const handleDirectUpload = (newMeeting: Meeting) => {
    setIsUploadModalOpen(false);
    setActiveProcessingMeeting(newMeeting);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-8 font-sans animate-fade-in pb-24">

      {/* ── Header Area ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-2 border-b border-slate-200/80 dark:border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <span className="w-11 h-11 rounded-2xl bg-blue-600 flex items-center justify-center shrink-0 shadow-md shadow-blue-600/30 text-white">
              <BrainCircuit className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                Meeting Intelligence
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                All analysed meetings — scheduled, live, and uploaded
              </p>
            </div>
          </div>
        </div>

        {/* Big Blue "Upload Yourself" Button */}
        <div>
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-extrabold rounded-2xl flex items-center gap-2.5 transition-all shadow-lg shadow-blue-600/25 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Yourself</span>
          </button>
        </div>
      </div>

      {/* ── Active In-Progress Processing Cards (Live & Uploaded) ── */}
      {processing.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
              Live AI Processing in Progress ({processing.length})
            </span>
            <span className="text-[11px] text-slate-400 font-semibold">Tap card for detailed 8-step pipeline</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {processing.map((m) => {
              const pct = Math.min(99, Math.max(10, m.progressPercentage || (m.status === 'ASR' ? 45 : m.status === 'LLM' ? 75 : m.status === 'Graph' ? 90 : 25)));
              return (
                <div
                  key={m.id}
                  onClick={() => setActiveProcessingMeeting(m)}
                  className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800/80 rounded-3xl p-5 shadow-md shadow-blue-500/5 hover:border-blue-400 transition-all cursor-pointer space-y-3 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {m.title}
                        </p>
                        <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 truncate">
                          {m.currentStepMessage || (m.status === 'Preprocessing' ? 'Extracting audio & diarization...' : m.status === 'ASR' ? 'Transcribing with Deepgram...' : m.status === 'LLM' ? 'Gemini AI intelligence extraction...' : m.status === 'Graph' ? 'Indexing memory graph...' : 'Processing...')}
                        </p>
                      </div>
                    </div>

                    <span className="text-lg font-black text-blue-600 dark:text-blue-400 font-mono">
                      {pct}%
                    </span>
                  </div>

                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${pct}%` }}
                      className="h-full bg-gradient-to-r from-blue-600 via-teal-400 to-emerald-400 transition-all duration-500"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Search & Filter Tabs ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <input
          type="text"
          placeholder="Search meeting title or attendee…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="w-full sm:w-80 px-4 py-2.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors shadow-2xs font-semibold"
        />

        <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700">
          {(['ALL', 'scheduled', 'live', 'upload'] as const).map((f) => (
            <button
              key={f}
              onClick={() => handleFilter(f)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer capitalize ${
                typeFilter === f
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {f === 'ALL' ? 'All' : f}
            </button>
          ))}
        </div>
      </div>

      {/* ── Meeting Cards Grid (Left-Right 2-Column, Maximum 6 per page) ── */}
      {pageItems.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-16 text-center bg-white dark:bg-slate-900 space-y-2">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No completed meetings found</p>
          <p className="text-xs text-slate-400">Click "Upload Yourself" or join a Live Meeting to record intelligence.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pageItems.map((m) => {
            const mt = meetingType(m);
            const displayTitle = m.title || (m.roomCode ? `Room: ${m.roomCode}` : 'Live Meeting');
            const attendees = (m.participants || [])
              .map((p) => (typeof p === 'string' ? p : (p as any).name))
              .filter(Boolean);

            return (
              <div
                key={m.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectMeeting(m)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectMeeting(m);
                  }
                }}
                className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 text-left shadow-sm hover:shadow-md hover:border-blue-400 dark:hover:border-blue-600 transition-all group flex flex-col justify-between gap-4 cursor-pointer"
              >
                <div className="space-y-3 w-full">
                  {/* Type + Status + Delete */}
                  <div className="flex items-center justify-between">
                    <TypeBadge type={mt} />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Permanently delete "${displayTitle}" and remove all its storage data?`)) {
                            deleteMeeting(m.id);
                          }
                        }}
                        className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/80 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200/80 dark:border-slate-700 hover:border-rose-200 dark:hover:border-rose-800 transition-all cursor-pointer shadow-2xs"
                        title="Delete meeting"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                    {displayTitle}
                  </h3>

                  {/* Meta details */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {m.dateTime}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {m.duration || '—'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      {attendees.length} attendee{attendees.length !== 1 ? 's' : ''}
                    </span>
                    {m.roomCode && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-full font-mono font-bold text-[10px]">
                        <Hash className="w-2.5 h-2.5 text-blue-500" />
                        {m.roomCode}
                      </span>
                    )}
                  </div>
                </div>

                {/* Intelligence Pills Footer */}
                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800/80 w-full">
                  {(m.decisions?.length || 0) > 0 && (
                    <span className="flex items-center gap-1 px-2.5 py-0.5 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900 rounded-full text-[10px] font-bold">
                      <Sparkles className="w-2.5 h-2.5" />
                      {m.decisions.length} decision{m.decisions.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {(m.actionItems?.length || 0) > 0 && (
                    <span className="flex items-center gap-1 px-2.5 py-0.5 bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border border-violet-100 dark:border-violet-900 rounded-full text-[10px] font-bold">
                      {m.actionItems.length} action{m.actionItems.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {(m.transcript?.length || 0) > 0 && (
                    <span className="flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-full text-[10px] font-bold">
                      <FileText className="w-2.5 h-2.5" />
                      Transcript ({m.transcript.length})
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination (Max 6 per page) ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="p-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              className={`w-9 h-9 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                i === page
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-blue-400'
              }`}
            >
              {i + 1}
            </button>
          ))}

          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="p-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Upload Modal ── */}
      {isUploadModalOpen && (
        <UploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onUpload={handleDirectUpload}
          availableProjects={['Core Engine v2', 'Enterprise Core Platform', 'Coco AI Intelligence', 'Design Systems']}
        />
      )}

      {/* ── Closable 8-Step Coco Processing Modal ── */}
      {activeProcessingMeeting && (
        <CocoProcessingModal
          isOpen={Boolean(activeProcessingMeeting)}
          meeting={meetings.find(m => m.id === activeProcessingMeeting.id) || activeProcessingMeeting}
          onClose={() => setActiveProcessingMeeting(null)}
          onViewMeeting={onSelectMeeting}
        />
      )}

    </div>
  );
};
