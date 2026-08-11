import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  FileText, 
  Calendar, 
  Clock, 
  Users, 
  CheckCircle2, 
  Download, 
  Search,
  CheckSquare,
  BrainCircuit,
  User,
  ShieldCheck,
  ArrowLeft
} from 'lucide-react';
import { Meeting, ActionItem, UserProfile } from '../types';
import { INITIAL_USER_PROFILE } from '../mock/mockData';
import { DecisionGraph } from './DecisionGraph';
import { StatusBadge } from './StatusBadge';
import { ActionItemsTable } from './ActionItemsTable';

interface MeetingDetailViewProps {
  meeting?: Meeting;
  selectedMeetingId?: string;
  meetings?: Meeting[];
  currentUser?: UserProfile;
  onBackToDashboard?: () => void;
  onClose?: () => void;
  onSendDirectMessage?: (recipientName: string, text: string) => void;
}

export const MeetingDetailView: React.FC<MeetingDetailViewProps> = ({ 
  meeting,
  selectedMeetingId,
  meetings,
  currentUser,
  onBackToDashboard,
  onSendDirectMessage
}) => {
  // Resolve current active meeting from props
  const currentMeeting = (meetings && selectedMeetingId 
    ? meetings.find(m => m.id === selectedMeetingId) 
    : null) || meeting || (meetings && meetings.length > 0 ? meetings[0] : null);

  const [activeTab, setActiveTab] = useState<'decisions' | 'actionItems' | 'transcript' | 'graph'>('decisions');
  const [transcriptSearch, setTranscriptSearch] = useState('');
  
  // Interactive Action Item state per meeting
  const [actionItemsState, setActionItemsState] = useState<ActionItem[]>(
    currentMeeting?.actionItems || []
  );

  // Sync action items whenever selected meeting changes
  useEffect(() => {
    if (currentMeeting) {
      setActionItemsState(currentMeeting.actionItems || []);
    }
  }, [currentMeeting?.id]);

  if (!currentMeeting) {
    return (
      <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl shadow-sm space-y-2">
        <p className="text-sm font-semibold text-slate-700">No meeting selected</p>
        <p className="text-xs text-slate-500">Select a completed meeting from the sidebar or dashboard.</p>
      </div>
    );
  }

  // Toggle action item status locally for current meeting
  const handleToggleStatus = (id: string) => {
    setActionItemsState(prev =>
      prev.map(item => {
        if (item.id === id) {
          const nextStatus: ActionItem['status'] = 
            item.status === 'To Do' ? 'In Progress' :
            item.status === 'In Progress' ? 'Completed' : 'To Do';
          return { ...item, status: nextStatus };
        }
        return item;
      })
    );
  };

  const filteredTranscript = (currentMeeting.transcript || []).filter(item =>
    item.text.toLowerCase().includes(transcriptSearch.toLowerCase()) ||
    item.speaker.toLowerCase().includes(transcriptSearch.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Top Breadcrumb & Meeting Info Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {onBackToDashboard && (
              <button
                onClick={onBackToDashboard}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                title="Back to Dashboard"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <span className="px-3 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold border border-indigo-100 dark:border-indigo-900">
              {currentMeeting.project}
            </span>
            <StatusBadge status={currentMeeting.status} />
          </div>

          <button
            onClick={() => alert(`Exporting Decision Intelligence Report for "${currentMeeting.title}"...`)}
            className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" /> Export Report
          </button>
        </div>

        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 font-sans tracking-tight">
            {currentMeeting.title}
          </h1>
          <div className="flex flex-wrap items-center gap-5 text-xs text-slate-500 mt-2">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-slate-400" />
              {currentMeeting.dateTime}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-slate-400" />
              {currentMeeting.duration || '45m'}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-slate-400" />
              {currentMeeting.participants.join(', ')}
            </span>
          </div>
        </div>

        {/* Executive Summary Callout */}
        <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-100 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider">Executive Summary</h4>
            <p className="text-xs md:text-sm text-slate-700 leading-relaxed">
              {currentMeeting.summary || 'Strategic architectural and operational decisions extracted automatically by AI graph pipeline.'}
            </p>
          </div>
        </div>
      </div>

      {/* Main Tabbed Navigation Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm flex flex-wrap items-center gap-2">
        <button
          onClick={() => setActiveTab('decisions')}
          className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'decisions'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Decisions Made</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold font-mono ${
            activeTab === 'decisions' ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {currentMeeting.decisions?.length || 0}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('actionItems')}
          className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'actionItems'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          <span>Action Items</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold font-mono ${
            activeTab === 'actionItems' ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {actionItemsState.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('transcript')}
          className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'transcript'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Transcript</span>
        </button>

        <button
          onClick={() => setActiveTab('graph')}
          className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'graph'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <BrainCircuit className="w-4 h-4" />
          <span>Knowledge Graph</span>
        </button>
      </div>

      {/* SUB-VIEW 1: DECISIONS SECTION */}
      {activeTab === 'decisions' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" /> What Decisions Were Made
            </h3>
            <span className="text-xs text-slate-500">AI-extracted with confidence scoring</span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {currentMeeting.decisions && currentMeeting.decisions.length > 0 ? (
              currentMeeting.decisions.map((decision) => (
                <div 
                  key={decision.id} 
                  className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:border-indigo-300 transition-all space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      {decision.category && (
                        <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-xs font-semibold border border-indigo-100">
                          {decision.category}
                        </span>
                      )}
                      <h4 className="text-base font-bold text-slate-900 mt-1">{decision.title}</h4>
                    </div>

                    {/* Confidence Score Badge */}
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold shrink-0">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>{decision.confidenceScore}% AI Confidence</span>
                    </span>
                  </div>

                  {/* Rationale */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Reason / Rationale
                    </div>
                    <p className="text-xs sm:text-sm text-slate-700">{decision.rationale}</p>
                  </div>

                  {/* Supporting Evidence */}
                  {decision.evidence && (
                    <div className="p-3.5 rounded-xl bg-amber-50/50 border border-amber-200/70 space-y-1">
                      <div className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-amber-600" /> Supporting Transcript Evidence
                      </div>
                      <blockquote className="text-xs sm:text-sm italic text-amber-950 font-serif">
                        {decision.evidence}
                      </blockquote>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl shadow-sm space-y-2">
                <Sparkles className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-sm font-semibold text-slate-700">No decisions recorded</p>
                <p className="text-xs text-slate-500">No decisions were extracted for this meeting.</p>
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
            currentUser={currentUser || INITIAL_USER_PROFILE}
            meetingHost={currentMeeting.participants[0]}
            onUpdateActionItems={setActionItemsState}
          />
        </div>
      )}

      {/* SUB-VIEW 3: TRANSCRIPT SECTION */}
      {activeTab === 'transcript' && (
        <div className="space-y-4 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-4">
            <div className="relative w-full max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search speaker or keyword in transcript..."
                value={transcriptSearch}
                onChange={(e) => setTranscriptSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-indigo-600"
              />
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Showing {filteredTranscript.length} segments
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3 max-h-[500px] overflow-y-auto">
            {filteredTranscript.length > 0 ? (
              filteredTranscript.map((t) => (
                <div 
                  key={t.id} 
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-indigo-700 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" /> {t.speaker}
                    </span>
                    <span className="text-slate-500 font-mono">[{t.time}]</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-sans">{t.text}</p>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-slate-500 text-sm">
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
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-indigo-600" /> Knowledge Graph (Persons, Decisions, Actions & Risks)
            </h3>
            <span className="text-xs text-slate-500">Powered by react-force-graph-2d</span>
          </div>

          <DecisionGraph data={currentMeeting.graphData} meetings={meetings} currentMeetingId={currentMeeting.id} onSendDirectMessage={onSendDirectMessage} />
        </div>
      )}
    </div>
  );
};
