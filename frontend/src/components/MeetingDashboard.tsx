import React, { useState, useMemo } from 'react';
import { Meeting, UserProfile } from '../types';
import { INITIAL_MEETINGS_DATA } from '../mock/mockData';
import { MeetingCard } from './MeetingCard';
import { UploadModal } from './UploadModal';
import { MeetingDetailView } from './MeetingDetailView';
import { PostMeetingUploadModal } from './PostMeetingUploadModal';
import { useNotifications } from '../context/NotificationContext';
import { 
  Search, 
  Filter, 
  Plus, 
  Clock, 
  CheckCircle2, 
  Sparkles, 
  Brain,
  CheckCircle,
  Bell
} from 'lucide-react';

interface MeetingDashboardProps {
  meetings?: Meeting[];
  setMeetings?: React.Dispatch<React.SetStateAction<Meeting[]>>;
  onViewDetails?: (meeting: Meeting) => void;
  onUploadMeeting?: (newMeeting: Meeting) => void;
  currentUser?: UserProfile | string;
}

export const MeetingDashboard: React.FC<MeetingDashboardProps> = ({
  meetings: controlledMeetings,
  setMeetings: controlledSetMeetings,
  onViewDetails: controlledOnViewDetails,
  onUploadMeeting,
  currentUser
}) => {
  // Controlled vs Uncontrolled state management
  const [internalMeetings, setInternalMeetings] = useState<Meeting[]>(INITIAL_MEETINGS_DATA);

  const meetings = controlledMeetings || internalMeetings;
  const setMeetings = controlledSetMeetings || setInternalMeetings;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState<string>('ALL');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [activeDetailMeeting, setActiveDetailMeeting] = useState<Meeting | null>(null);
  const [postUploadMeeting, setPostUploadMeeting] = useState<Meeting | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastText, setToastText] = useState('');

  // Extract unique project list for filtering dropdown
  const availableProjects = useMemo(() => {
    const projects = new Set(meetings.map(m => m.project));
    return Array.from(projects);
  }, [meetings]);

  const { triggerAiPipelineComplete } = useNotifications();
  const currentUserName = typeof currentUser === 'string' ? currentUser : currentUser?.name || 'Alice Chen';

  // Handler to mark meeting as done -> updates status in state & triggers AI_READY notification if user is participant
  const handleMarkAsDone = (meetingId: string) => {
    const targetMtg = meetings.find(m => m.id === meetingId);
    setMeetings((prevMeetings) =>
      prevMeetings.map((mtg) => {
        if (mtg.id === meetingId) {
          return {
            ...mtg,
            status: 'Completed',
            completedAt: new Date().toLocaleDateString('en-US', {
              month: 'short',
              day: '2-digit',
              year: 'numeric'
            })
          };
        }
        return mtg;
      })
    );

    triggerAiPipelineComplete(meetingId, targetMtg?.title, targetMtg?.participants, currentUserName);
  };

  // Handler for uploading new meeting
  const handleUploadMeeting = (newMeeting: Meeting) => {
    if (onUploadMeeting) {
      onUploadMeeting(newMeeting);
    } else {
      setMeetings((prev) => [newMeeting, ...prev]);
    }

    setToastText(`Meeting "${newMeeting.title}" created successfully! Notifications sent to participants.`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  };

  // Handler for post-meeting audio recording upload success
  const handlePostUploadSuccess = (meetingId: string, audioFile: File) => {
    setMeetings((prev) =>
      prev.map((mtg) => {
        if (mtg.id === meetingId) {
          return {
            ...mtg,
            status: 'Pending',
            audioFileName: audioFile.name,
            fileSize: `${(audioFile.size / (1024 * 1024)).toFixed(1)} MB`
          };
        }
        return mtg;
      })
    );

    setToastText("Audio uploaded successfully! AI pipeline is now processing in the background.");
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  };

  // Filter logic for upcoming and completed meetings
  const filteredMeetings = useMemo(() => {
    return meetings.filter((mtg) => {
      const matchesSearch = 
        mtg.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        mtg.project.toLowerCase().includes(searchQuery.toLowerCase()) ||
        mtg.participants.some(p => p.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesProject = 
        selectedProject === 'ALL' || mtg.project === selectedProject;

      return matchesSearch && matchesProject;
    });
  }, [meetings, searchQuery, selectedProject]);

  const upcomingMeetings = useMemo(() => {
    return filteredMeetings.filter((m) => m.status !== 'Completed');
  }, [filteredMeetings]);

  const completedMeetings = useMemo(() => {
    return filteredMeetings.filter((m) => m.status === 'Completed');
  }, [filteredMeetings]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans p-4 sm:p-6 lg:p-8 space-y-8 relative">
      {/* Toast Notification */}
      {showToast && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-emerald-500/40 animate-in fade-in slide-in-from-top-4 duration-300 text-xs font-semibold">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{toastText}</span>
        </div>
      )}

      {/* Top Header Banner */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 p-0.5 shadow-md flex items-center justify-center text-white shrink-0">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-sans">
                Corporate Brain
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold border border-blue-200 dark:border-blue-800">
                AI Meeting Intelligence
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Automated Speech Recognition, LLM Summarization & Decision Graph Analysis
            </p>
          </div>
        </div>

        {/* Global Action */}
        <button
          onClick={() => setIsUploadModalOpen(true)}
          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Meeting</span>
        </button>
      </header>

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto space-y-6">

        {/* Welcome Banner Card with Large Numbers */}
        <div className="bg-gradient-to-r from-sky-50 via-blue-50/40 to-slate-50 dark:from-slate-900 dark:via-blue-950/30 dark:to-slate-900 border border-sky-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white font-sans tracking-tight">
              Good evening, Alex.
            </h2>
            <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400">
              Here is your accountability summary for today — stay on top of your commitments.
            </p>
          </div>

          <div className="flex items-center gap-8 border-t md:border-t-0 md:border-l border-sky-200/80 dark:border-slate-800 pt-4 md:pt-0 md:pl-8">
            <div className="text-center md:text-right">
              <div className="text-3xl md:text-4xl font-extrabold text-blue-600 dark:text-blue-400 font-mono tracking-tight">
                {filteredMeetings.length}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">Total Meetings</div>
            </div>
            <div className="text-center md:text-right">
              <div className="text-3xl md:text-4xl font-extrabold text-amber-600 dark:text-amber-400 font-mono tracking-tight">
                {upcomingMeetings.length}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">Upcoming</div>
            </div>
            <div className="text-center md:text-right">
              <div className="text-3xl md:text-4xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
                {completedMeetings.length}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">AI Ready</div>
            </div>
          </div>
        </div>

        {/* Row of Large Stat Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Stat 1: Upcoming Meetings */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center gap-4 hover:border-amber-300 dark:hover:border-amber-700 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
                {upcomingMeetings.length}
              </div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">Upcoming Meetings</div>
            </div>
          </div>

          {/* Stat 2: Completed Meetings */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center gap-4 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
                {completedMeetings.length}
              </div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">Completed Meetings</div>
            </div>
          </div>
        </div>
        
        {/* Search & Filter Toolbar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
          {/* Keyword Search */}
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search title, participant, or project..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm placeholder-slate-400 focus:outline-hidden focus:border-blue-600 transition-all"
            />
          </div>

          {/* Filters & Stats */}
          <div className="flex items-center justify-between w-full md:w-auto gap-4">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium focus:outline-hidden focus:border-blue-600 transition-all cursor-pointer"
              >
                <option value="ALL">All Projects ({meetings.length})</option>
                {availableProjects.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* SECTION 1: Upcoming Meetings Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-amber-800">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white font-sans">Upcoming Meetings</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Scheduled, in pipeline, or awaiting audio recording</p>
              </div>
            </div>
            <span className="px-3.5 py-1.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800 text-sm font-extrabold shadow-xs">
              {upcomingMeetings.length} Meetings
            </span>
          </div>

          {upcomingMeetings.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {upcomingMeetings.map((mtg) => (
                <MeetingCard
                  key={mtg.id}
                  meeting={mtg}
                  onMarkAsDone={handleMarkAsDone}
                  onViewDetails={controlledOnViewDetails || ((m) => setActiveDetailMeeting(m))}
                  onOpenPostMeetingUpload={(m) => setPostUploadMeeting(m)}
                />
              ))}
            </div>
          ) : (
            <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2 shadow-xs">
              <Clock className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No upcoming meetings match criteria</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Click "New Meeting" to schedule or process audio files.</p>
            </div>
          )}
        </section>

        {/* SECTION 2: Completed Meetings Section */}
        <section className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white font-sans">Completed Meetings</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">AI analysis ready • Decision graphs & transcript available</p>
              </div>
            </div>
            <span className="px-3.5 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 text-sm font-extrabold shadow-xs">
              {completedMeetings.length} Meetings
            </span>
          </div>

          {completedMeetings.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {completedMeetings.map((mtg) => (
                <MeetingCard
                  key={mtg.id}
                  meeting={mtg}
                  onViewDetails={controlledOnViewDetails || ((m) => setActiveDetailMeeting(m))}
                  onOpenPostMeetingUpload={(m) => setPostUploadMeeting(m)}
                />
              ))}
            </div>
          ) : (
            <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2 shadow-xs">
              <Sparkles className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No completed meetings yet</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Upload a recording for an upcoming meeting to view intelligence outputs.</p>
            </div>
          )}
        </section>

      </main>

      {/* Upload New Meeting / Schedule Modal */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={handleUploadMeeting}
        availableProjects={availableProjects}
      />

      {/* Post-Meeting Audio Recording Upload Modal */}
      {postUploadMeeting && (
        <PostMeetingUploadModal
          isOpen={!!postUploadMeeting}
          meeting={postUploadMeeting}
          onClose={() => setPostUploadMeeting(null)}
          onUploadSuccess={handlePostUploadSuccess}
        />
      )}

      {/* Meeting Detail View Modal */}
      {activeDetailMeeting && (
        <MeetingDetailView
          meeting={activeDetailMeeting}
          onClose={() => setActiveDetailMeeting(null)}
        />
      )}
    </div>
  );
};
