import React, { useState, useMemo } from 'react';
import {
  BrainCircuit,
  Sparkles,
  CheckSquare,
  Calendar,
  ArrowRight,
  Filter,
  Clock,
  Layers,
  Search,
  ShieldCheck,
  Zap,
  CheckCircle2,
  History,
  Users
} from 'lucide-react';
import { Meeting, Decision } from '../types';

interface MeetingIntelligenceOverviewProps {
  meetings: Meeting[];
  onSelectMeeting: (meeting: Meeting) => void;
  onSelectMeetingId: (meetingId: string) => void;
}

export const MeetingIntelligenceOverview: React.FC<MeetingIntelligenceOverviewProps> = ({
  meetings,
  onSelectMeeting,
  onSelectMeetingId,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [hubSearchQuery, setHubSearchQuery] = useState<string>('');

  const completedMeetings = useMemo(() => {
    return meetings.filter((m) => m.status === 'Completed');
  }, [meetings]);

  const metrics = useMemo(() => {
    const totalDecisions = completedMeetings.reduce((acc, m) => acc + (m.decisions?.length || 0), 0);
    const totalActionItems = completedMeetings.reduce((acc, m) => acc + (m.actionItems?.length || 0), 0);
    const allConfidence = completedMeetings.flatMap(m => (m.decisions || []).map(d => d.confidenceScore));
    const avgConfidence = allConfidence.length > 0 
      ? Math.round(allConfidence.reduce((a, b) => a + b, 0) / allConfidence.length) 
      : 95;
    
    return {
      completedCount: completedMeetings.length,
      totalDecisions,
      totalActionItems,
      avgConfidence
    };
  }, [completedMeetings]);

  const filteredCompletedMeetings = useMemo(() => {
    return completedMeetings.filter((mtg) => {
      const matchesCategory = categoryFilter === 'ALL' || mtg.project === categoryFilter || mtg.decisions?.some(d => d.category === categoryFilter);
      const matchesSearch = !hubSearchQuery.trim() || 
        mtg.title.toLowerCase().includes(hubSearchQuery.toLowerCase()) ||
        mtg.project.toLowerCase().includes(hubSearchQuery.toLowerCase()) ||
        mtg.summary?.toLowerCase().includes(hubSearchQuery.toLowerCase()) ||
        mtg.decisions?.some(d => d.title.toLowerCase().includes(hubSearchQuery.toLowerCase())) ||
        mtg.actionItems?.some(a => a.task.toLowerCase().includes(hubSearchQuery.toLowerCase()) || a.assignee.toLowerCase().includes(hubSearchQuery.toLowerCase()));
      
      return matchesCategory && matchesSearch;
    });
  }, [completedMeetings, categoryFilter, hubSearchQuery]);

  const getConfidenceScore = (meeting: Meeting) => {
    if (!meeting.decisions || meeting.decisions.length === 0) return 95;
    const total = meeting.decisions.reduce((acc, d) => acc + d.confidenceScore, 0);
    return Math.round(total / meeting.decisions.length);
  };

  // Task 7.1 — Decision Timeline: every decision across every completed
  // meeting, newest meeting first, each still linked back to its source
  // meeting (reason/evidence come from the decision itself; participants
  // from the parent meeting, since decisions don't carry their own list).
  const timelineEntries = useMemo(() => {
    return completedMeetings
      .flatMap((mtg) =>
        (mtg.decisions || []).map((decision) => ({ decision, meeting: mtg }))
      )
      .sort((a, b) => (a.meeting.dateTime < b.meeting.dateTime ? 1 : -1));
  }, [completedMeetings]);

  return (
    <div className="space-y-8 animate-fade-in pb-16 max-w-[1920px] w-full mx-auto px-8 py-6">
      
      {/* Hero Banner: Streamlined Vibrant Gradient Container */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 rounded-2xl p-5 sm:p-6 text-white shadow-lg relative overflow-hidden border border-blue-400/30">
        <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute left-1/3 -top-10 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-white/20 p-0.5 shadow-md flex items-center justify-center shrink-0 border border-white/30 backdrop-blur-md">
              <BrainCircuit className="w-5.5 h-5.5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight font-sans text-white">
                  Meeting Intelligence Hub
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-bold border border-white/30 shadow-xs flex items-center space-x-1 backdrop-blur-xs">
                  <Sparkles className="w-3 h-3 text-blue-200" />
                  <span>Global Knowledge Index</span>
                </span>
              </div>
              <p className="text-xs text-blue-100/90 mt-0.5 font-medium">
                Cross-meeting decision analytics & collective knowledge graph visualization
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid (3 Clean Cards Row) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        
        {/* Card 1: Completed Meetings */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Completed Meetings</span>
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-900/40">
              <Layers className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
              {metrics.completedCount}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Indexed in Corporate Brain</p>
          </div>
        </div>

        {/* Card 2: Total Decisions */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-700 transition-all flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Decisions</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/40">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
              {metrics.totalDecisions}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">AI-extracted with rationales</p>
          </div>
        </div>

        {/* Card 3: Action Items */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700 transition-all flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Action Items</span>
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-100 dark:border-amber-900/40">
              <CheckSquare className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-amber-600 dark:text-amber-400 font-mono tracking-tight">
              {metrics.totalActionItems}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Assigned across team members</p>
          </div>
        </div>

      </div>

      {/* Decision Timeline Section (Task 7.1) */}
      {timelineEntries.length > 0 && (
        <div className="space-y-4">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white font-sans tracking-tight flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /> Decision Timeline
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Every decision across every meeting, most recent first — with the reasoning, evidence, and people behind it
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm max-h-[560px] overflow-y-auto">
            <ol className="relative border-l-2 border-slate-100 dark:border-slate-800 space-y-6 ml-2">
              {timelineEntries.map(({ decision, meeting: mtg }: { decision: Decision; meeting: Meeting }) => (
                <li key={decision.id} className="ml-5">
                  <span className="absolute -translate-x-1/2 w-3 h-3 rounded-full bg-indigo-500 border-2 border-white dark:border-slate-900 mt-1.5" />
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold text-slate-400 font-mono">{mtg.dateTime}</span>
                    <button
                      onClick={() => { onSelectMeetingId(mtg.id); onSelectMeeting(mtg); }}
                      className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      {mtg.title}
                    </button>
                    {decision.impactLevel && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        decision.impactLevel === 'High'
                          ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                          : decision.impactLevel === 'Medium'
                          ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}>
                        {decision.impactLevel} impact
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">{decision.title}</h3>

                  {decision.rationale && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      <span className="font-semibold text-slate-400">Reason: </span>{decision.rationale}
                    </p>
                  )}
                  {decision.evidence && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                      <span className="font-semibold text-slate-400">Evidence: </span>{decision.evidence}
                    </p>
                  )}

                  {mtg.participants && mtg.participants.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400">
                      <Users className="w-3 h-3" />
                      <span>{mtg.participants.join(', ')}</span>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {/* Completed Meetings Intelligence Cards Section */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white font-sans tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /> Completed Meetings Intelligence Cards
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Select any card to view audio transcripts, decision rationale, action item tables & knowledge graph
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer shadow-sm"
            >
              <option value="ALL">All Categories</option>
              <option value="Core Infrastructure">Core Infrastructure</option>
              <option value="Security & Compliance">Security & Compliance</option>
              <option value="Core Engine v2">Core Engine v2</option>
            </select>
          </div>
        </div>

        {/* 3-Column Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 w-full">
          {filteredCompletedMeetings.map((mtg) => {
            const conf = getConfidenceScore(mtg);
            return (
              <div
                key={mtg.id}
                onClick={() => {
                  onSelectMeetingId(mtg.id);
                  onSelectMeeting(mtg);
                }}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:border-indigo-500 dark:hover:border-indigo-500 hover:shadow-lg transition-all cursor-pointer flex flex-col justify-between space-y-4 group relative overflow-hidden"
              >
                <div className="space-y-3.5">
                  {/* Badge Pills */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-3 py-1 rounded-full bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 text-xs font-bold border border-sky-200 dark:border-sky-800">
                      {mtg.project}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-800 flex items-center space-x-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      <span>Ready</span>
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2 leading-snug">
                    {mtg.title}
                  </h3>

                  {/* Date & Duration */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {mtg.dateTime}
                    </span>
                    {mtg.duration && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {mtg.duration}
                      </span>
                    )}
                  </div>

                  {/* Executive Summary */}
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                    {mtg.summary || 'AI-extracted decision intelligence summary available.'}
                  </p>
                </div>

                {/* Card Footer Metrics */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <div className="grid grid-cols-3 gap-1 text-center py-1 bg-slate-50/80 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div className="px-1">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase">Decisions</div>
                      <div className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 font-mono mt-0.5">
                        {mtg.decisions?.length || 0}
                      </div>
                    </div>
                    <div className="px-1 border-x border-slate-200 dark:border-slate-700">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase">Tasks</div>
                      <div className="text-xs font-extrabold text-amber-600 dark:text-amber-400 font-mono mt-0.5">
                        {mtg.actionItems?.length || 0}
                      </div>
                    </div>
                    <div className="px-1">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase">Conf</div>
                      <div className="text-xs font-extrabold text-purple-600 dark:text-purple-400 font-mono mt-0.5">
                        {conf}%
                      </div>
                    </div>
                  </div>

                  <button className="w-full py-2.5 px-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 group-hover:bg-indigo-600 text-indigo-700 dark:text-indigo-300 group-hover:text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs">
                    <span>View Intelligence & Graph</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

