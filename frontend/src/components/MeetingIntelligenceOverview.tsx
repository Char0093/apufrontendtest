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

  const timelineEntries = useMemo(() => {
    return completedMeetings
      .flatMap((mtg) =>
        (mtg.decisions || []).map((decision) => ({ decision, meeting: mtg }))
      )
      .sort((a, b) => (a.meeting.dateTime < b.meeting.dateTime ? 1 : -1));
  }, [completedMeetings]);

  return (
    <div className="space-y-6 animate-fade-in pb-16 max-w-[1920px] w-full mx-auto px-8 py-6 font-sans">
      
      {/* Streamlined Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight font-sans flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <span>Meeting Intelligence Hub</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Cross-meeting decision analytics, AI-extracted rationale, and organizational memory index.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 text-xs font-bold border border-blue-200 dark:border-blue-800">
            {metrics.completedCount} Indexed Meetings
          </span>
        </div>
      </div>

      {/* Key Metrics Grid (3 Clean Cards Row) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        {/* Card 1: Completed Meetings */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-900/40">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
              {metrics.completedCount}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Indexed Meetings</p>
          </div>
        </div>

        {/* Card 2: Total Decisions */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/40">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
              {metrics.totalDecisions}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Extracted Decisions</p>
          </div>
        </div>

        {/* Card 3: Action Items */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-100 dark:border-amber-900/40">
            <CheckSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 font-mono tracking-tight">
              {metrics.totalActionItems}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Assigned Tasks</p>
          </div>
        </div>

      </div>

      {/* Decision Timeline Section */}
      {timelineEntries.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white font-sans tracking-tight flex items-center gap-2">
              <History className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Decision Timeline</span>
            </h2>
            <span className="text-xs text-slate-400 font-medium">Most recent first</span>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xs max-h-[420px] overflow-y-auto">
            <ol className="relative border-l-2 border-slate-100 dark:border-slate-800 space-y-5 ml-2">
              {timelineEntries.map(({ decision, meeting: mtg }: { decision: Decision; meeting: Meeting }) => (
                <li key={decision.id} className="ml-5">
                  <span className="absolute -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white dark:border-slate-900 mt-1.5" />
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold text-slate-400 font-mono">{mtg.dateTime}</span>
                    <button
                      onClick={() => { onSelectMeetingId(mtg.id); onSelectMeeting(mtg); }}
                      className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
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

                  {mtg.participants && mtg.participants.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-slate-400">
                      <Users className="w-3 h-3" />
                      <span>{(mtg.participants as any[]).map(p => typeof p === 'string' ? p : p.name).join(', ')}</span>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {/* Completed Meetings Intelligence Cards Section */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white font-sans tracking-tight flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Completed Meetings Intelligence Cards</span>
          </h2>

          <div className="flex items-center gap-2 shrink-0">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer shadow-2xs"
            >
              <option value="ALL">All Categories</option>
              <option value="Core Infrastructure">Core Infrastructure</option>
              <option value="Security & Compliance">Security & Compliance</option>
              <option value="Core Engine v2">Core Engine v2</option>
            </select>
          </div>
        </div>

        {/* 3-Column Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
          {filteredCompletedMeetings.map((mtg) => {
            const conf = getConfidenceScore(mtg);
            return (
              <div
                key={mtg.id}
                onClick={() => {
                  onSelectMeetingId(mtg.id);
                  onSelectMeeting(mtg);
                }}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xs hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between space-y-3.5 group relative"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[11px] font-bold border border-blue-100 dark:border-blue-900">
                      {mtg.project}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold border border-emerald-200 dark:border-emerald-800 flex items-center space-x-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      <span>Indexed</span>
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1 leading-snug">
                    {mtg.title}
                  </h3>

                  <div className="flex items-center gap-3 text-xs text-slate-400 font-medium">
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

                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80">
                    {mtg.summary || 'AI-extracted decision intelligence summary available.'}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 font-semibold">
                  <span>{mtg.decisions?.length || 0} Decisions • {mtg.actionItems?.length || 0} Tasks ({conf}% Conf)</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
