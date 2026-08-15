import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  Search, 
  Filter, 
  Calendar, 
  FileAudio, 
  ArrowRight,
  UserCheck
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { 
    meetings, 
    currentUser, 
    personalDashboard,
    setActiveTab,
    processAudioForMeeting
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('ALL');

  // Strict user-based filtering: ONLY show meetings where currentUser is in participants!
  const currentUserMeetings = useMemo(() => {
    return meetings.filter(m => {
      if (!m.participants) return false;
      return m.participants.some(p => {
        const pName = typeof p === 'string' ? p : (p as any).name || '';
        return pName.toLowerCase().includes(currentUser.name.toLowerCase()) ||
               currentUser.name.toLowerCase().includes(pName.toLowerCase());
      });
    });
  }, [meetings, currentUser]);

  // Filtered lists for upcoming and completed
  const upcomingMeetings = useMemo(() => {
    return currentUserMeetings.filter(m => m.status === 'Scheduled' || m.status === 'Pending' || m.status === 'Preprocessing');
  }, [currentUserMeetings]);

  const completedMeetings = useMemo(() => {
    return currentUserMeetings.filter(m => m.status === 'Completed');
  }, [currentUserMeetings]);

  const filteredUpcoming = useMemo(() => {
    return upcomingMeetings.filter(m => {
      const matchesProject = projectFilter === 'ALL' || m.project === projectFilter;
      const matchesSearch = !searchQuery.trim() || 
        m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.project.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.participants && m.participants.some(p => p.toLowerCase().includes(searchQuery.toLowerCase())));
      return matchesProject && matchesSearch;
    });
  }, [upcomingMeetings, projectFilter, searchQuery]);

  const filteredCompleted = useMemo(() => {
    return completedMeetings.filter(m => {
      const matchesProject = projectFilter === 'ALL' || m.project === projectFilter;
      const matchesSearch = !searchQuery.trim() || 
        m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.project.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.participants && m.participants.some(p => p.toLowerCase().includes(searchQuery.toLowerCase())));
      return matchesProject && matchesSearch;
    });
  }, [completedMeetings, projectFilter, searchQuery]);

  return (
    <div className="max-w-[1920px] w-full mx-auto px-8 py-6 space-y-6 font-sans animate-fade-in pb-16">
      
      {/* Sub-Header Row - Clean without secondary logo or duplicate buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white font-sans tracking-tight">
              Dashboard Overview
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-800">
              Personalized Sync
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
            Real-time meeting intelligence, ASR speech extraction & decision tracking for <span className="font-bold text-slate-700 dark:text-slate-300">{currentUser.name}</span>
          </p>
        </div>
      </div>

      {/* User Accountability Summary Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center space-x-2 text-xs font-bold text-indigo-600 dark:text-indigo-400">
            <UserCheck className="w-4 h-4" />
            <span>Active Account: {currentUser.name} ({currentUser.role})</span>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white font-sans">
            Welcome back, {currentUser.name.split(' ')[0]}.
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Viewing {currentUserMeetings.length} meetings assigned to your corporate profile.
          </p>
        </div>

        {/* Personal graph metrics */}
        <div className="flex items-center gap-6 pt-4 md:pt-0 border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-800 md:pl-8 shrink-0">
          <div className="text-center">
            <div className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 font-mono">
              {currentUserMeetings.length}
            </div>
            <div className="text-xs font-semibold text-slate-400 mt-0.5">Your Meetings</div>
          </div>

          <div className="text-center">
            <div className="text-3xl font-extrabold text-amber-500 font-mono">
              {upcomingMeetings.length}
            </div>
            <div className="text-xs font-semibold text-slate-400 mt-0.5">Upcoming</div>
          </div>

          <div className="text-center">
            <div className="text-3xl font-extrabold text-emerald-500 font-mono">
              {completedMeetings.length}
            </div>
            <div className="text-xs font-semibold text-slate-400 mt-0.5">Completed</div>
          </div>

          <div className="text-center">
            <div className="text-3xl font-extrabold text-rose-500 font-mono">
              {personalDashboard?.flags.length ?? 0}
            </div>
            <div className="text-xs font-semibold text-slate-400 mt-0.5">Your Flags</div>
          </div>

          <div className="text-center">
            <div className="text-3xl font-extrabold text-violet-500 font-mono">
              {personalDashboard?.action_items.length ?? 0}
            </div>
            <div className="text-xs font-semibold text-slate-400 mt-0.5">Your Tasks</div>
          </div>
        </div>
      </div>

      {/* 2 Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        
        {/* Card 1: Upcoming Meetings */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-100 dark:border-amber-900/40">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
              {upcomingMeetings.length}
            </div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Upcoming Scheduled Meetings
            </div>
          </div>
        </div>

        {/* Card 2: Completed Meetings */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/40">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
              {completedMeetings.length}
            </div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Completed & Indexed Meetings
            </div>
          </div>
        </div>

      </div>

      {/* Search & Filter Bar Row */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search your title, participant, or project..."
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="ALL">All Projects ({currentUserMeetings.length})</option>
            <option value="Design Systems">Design Systems</option>
            <option value="Core Infrastructure">Core Infrastructure</option>
            <option value="Security & Compliance">Security & Compliance</option>
            <option value="Core Engine v2">Core Engine v2</option>
            <option value="Enterprise Core Platform">Enterprise Core Platform</option>
            <option value="Coco AI Intelligence">Coco AI Intelligence</option>
          </select>
        </div>
      </div>

      {/* Section 1: Upcoming Meetings */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white font-sans flex items-center space-x-2">
                <span>Upcoming Meetings</span>
              </h3>
              <p className="text-[11px] text-slate-400">Scheduled or awaiting audio recording</p>
            </div>
          </div>

          <span className="px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-xs font-bold border border-amber-200 dark:border-amber-800">
            {filteredUpcoming.length} Meetings
          </span>
        </div>

        {filteredUpcoming.length === 0 ? (
          <div className="p-8 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-2">
            <Clock className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No upcoming meetings scheduled for {currentUser.name}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Click "+ Schedule Meeting" in the top header to invite team members.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 w-full">
            {filteredUpcoming.map((mtg) => (
              <div
                key={mtg.id}
                className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs hover:shadow-md transition-all space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-100 dark:border-indigo-900">
                    {mtg.project}
                  </span>

                  <span className="px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-xs font-bold border border-amber-200 dark:border-amber-800 flex items-center space-x-1">
                    <Clock className="w-3 h-3 text-amber-500" />
                    <span>{mtg.status || 'Pending'}</span>
                  </span>
                </div>

                <div className="space-y-1.5">
                  <h4 className="text-base font-bold text-slate-900 dark:text-white font-sans line-clamp-1">
                    {mtg.title}
                  </h4>
                  {mtg.audioFileName && (
                    <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-mono">
                      <FileAudio className="w-3.5 h-3.5 text-indigo-500" />
                      <span>{mtg.audioFileName} ({mtg.fileSize || '22.4 MB'})</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400 font-medium">
                  <span className="flex items-center space-x-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{mtg.dateTime}</span>
                  </span>
                  {mtg.duration && (
                    <span className="flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{mtg.duration}</span>
                    </span>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 font-mono">
                      PARTICIPANTS
                    </div>

                    {mtg.status === 'Preprocessing' ? (
                      <div className="flex items-center space-x-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 animate-pulse">
                        <span className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                        <span>Processing ASR & Extracting Decisions...</span>
                      </div>
                    ) : (
                      <label className="cursor-pointer px-3 py-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-all shadow-2xs">
                        <input
                          type="file"
                          accept="audio/*"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              processAudioForMeeting(mtg.id, e.target.files[0]);
                            } else {
                              processAudioForMeeting(mtg.id, { name: `${mtg.project.toLowerCase().replace(/\s+/g, '_')}_recording.mp3`, size: 19200000 });
                            }
                          }}
                        />
                        <span>Upload Audio Recording</span>
                      </label>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {mtg.participants && mtg.participants.map((p, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium"
                      >
                        {typeof p === 'string' ? p : (p as any).name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Completed Meetings */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white font-sans flex items-center space-x-2">
                <span>Completed Meetings</span>
              </h3>
              <p className="text-[11px] text-slate-400">Indexed in Corporate Brain with full ASR transcript & decision graph</p>
            </div>
          </div>

          <button
            onClick={() => setActiveTab('meetings')}
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center space-x-1 cursor-pointer"
          >
            <span>View All Intelligence Cards</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {filteredCompleted.length === 0 ? (
          <div className="p-8 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-2">
            <CheckCircle2 className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No completed meetings recorded for {currentUser.name}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Upload audio recordings to complete scheduled meetings.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 w-full">
            {filteredCompleted.map((mtg) => (
              <div
                key={mtg.id}
                onClick={() => setActiveTab('meetings')}
                className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs hover:shadow-md hover:border-indigo-500 transition-all cursor-pointer space-y-3.5 flex flex-col justify-between group"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 text-xs font-bold border border-sky-200 dark:border-sky-800">
                      {mtg.project}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold border border-emerald-200 dark:border-emerald-800">
                      Ready
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors line-clamp-2">
                    {mtg.title}
                  </h4>

                  <div className="text-xs text-slate-400 font-medium">
                    {mtg.dateTime}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                  <span>{mtg.decisions?.length || 0} Decisions • {mtg.actionItems?.length || 0} Tasks</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};
