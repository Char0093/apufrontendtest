import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Clock, 
  CheckCircle2, 
  Search, 
  Filter, 
  Calendar, 
  ArrowRight,
  Upload
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { 
    meetings, 
    currentUser, 
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

  const upcomingMeetings = useMemo(() => {
    return currentUserMeetings.filter(m => m.status !== 'Completed');
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
        (m.participants && m.participants.some(p => (typeof p === 'string' ? p : (p as any).name).toLowerCase().includes(searchQuery.toLowerCase())));
      return matchesProject && matchesSearch;
    });
  }, [upcomingMeetings, projectFilter, searchQuery]);

  const filteredCompleted = useMemo(() => {
    return completedMeetings.filter(m => {
      const matchesProject = projectFilter === 'ALL' || m.project === projectFilter;
      const matchesSearch = !searchQuery.trim() || 
        m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.project.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.participants && m.participants.some(p => (typeof p === 'string' ? p : (p as any).name).toLowerCase().includes(searchQuery.toLowerCase())));
      return matchesProject && matchesSearch;
    });
  }, [completedMeetings, projectFilter, searchQuery]);

  return (
    <div className="max-w-[1920px] w-full mx-auto px-8 py-6 space-y-6 font-sans animate-fade-in pb-16">
      
      {/* Clean Simplified Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white font-sans tracking-tight flex items-center gap-2">
            <span>Welcome back, {currentUser.name.split(' ')[0]}</span>
            <span className="px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 text-xs font-bold border border-blue-200 dark:border-blue-800">
              {currentUser.role}
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
            Personalized dashboard showing scheduled meetings and indexed decision records for your account.
          </p>
        </div>

        {/* Quick Summary Badges */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-2xl flex items-center space-x-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              {upcomingMeetings.length} Upcoming
            </span>
          </div>
          <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-2xl flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              {completedMeetings.length} Completed
            </span>
          </div>
        </div>
      </div>

      {/* Streamlined Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50 p-2 rounded-2xl border border-slate-200/80 dark:border-slate-800">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search title, participant, or project..."
            className="w-full pl-10 pr-4 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="px-3.5 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
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
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white font-sans flex items-center space-x-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <span>Upcoming Scheduled Meetings</span>
          </h3>
          <span className="text-xs text-slate-400 font-semibold">
            {filteredUpcoming.length} items
          </span>
        </div>

        {filteredUpcoming.length === 0 ? (
          <div className="p-6 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-1">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              No upcoming meetings scheduled for {currentUser.name}.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredUpcoming.map((mtg) => (
              <div
                key={mtg.id}
                className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-2xs hover:border-blue-300 dark:hover:border-blue-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="px-2.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[11px] font-bold border border-blue-100 dark:border-blue-900">
                      {mtg.project}
                    </span>
                    <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {mtg.dateTime}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-slate-900 dark:text-white font-sans truncate">
                    {mtg.title}
                  </h4>

                  <div className="flex items-center space-x-2 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-400">Participants:</span>
                    <span>
                      {mtg.participants && mtg.participants.map(p => typeof p === 'string' ? p : (p as any).name).join(', ')}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-3">
                  {(['Preprocessing', 'ASR', 'LLM', 'Graph', 'Retrying'] as string[]).includes(mtg.status) ? (
                    <div className="flex items-center space-x-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 animate-pulse">
                      <span className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
                      <span>Processing Audio...</span>
                    </div>
                  ) : (
                    <label className="cursor-pointer px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-all shadow-xs">
                      <input
                        type="file"
                        accept="audio/*,video/mp4,.mp4"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            processAudioForMeeting(mtg.id, e.target.files[0]);
                          } else {
                            processAudioForMeeting(mtg.id, { name: `${mtg.project.toLowerCase().replace(/\s+/g, '_')}_recording.mp3`, size: 19200000 });
                          }
                        }}
                      />
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Recording</span>
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Completed Meetings */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white font-sans flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Completed & Indexed Meetings</span>
          </h3>

          <button
            onClick={() => setActiveTab('meetings')}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1 cursor-pointer"
          >
            <span>View All Cards</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {filteredCompleted.length === 0 ? (
          <div className="p-6 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-1">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              No completed meetings recorded for {currentUser.name}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCompleted.map((mtg) => (
              <div
                key={mtg.id}
                onClick={() => setActiveTab('meetings')}
                className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-2xs hover:shadow-sm hover:border-blue-500 transition-all cursor-pointer space-y-3 flex flex-col justify-between group"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-bold">
                      {mtg.project}
                    </span>
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      Completed
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors line-clamp-1">
                    {mtg.title}
                  </h4>

                  <div className="text-xs text-slate-400 font-medium">
                    {mtg.dateTime}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 font-semibold">
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
