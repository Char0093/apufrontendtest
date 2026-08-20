import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Hash,
  Users,
  ClipboardList,
  ArrowRight,
} from 'lucide-react';

const PriorityPill: React.FC<{ priority?: string }> = ({ priority }) => {
  const map: Record<string, string> = {
    High: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    Medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    Low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  };
  const p = priority || 'Medium';
  return <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${map[p] || map.Medium}`}>{p}</span>;
};

const TaskStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, string> = {
    'To Do': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    'In Progress': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    Completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    Pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  };
  return <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${map[status] || map['To Do']}`}>{status}</span>;
};

export const DashboardView: React.FC = () => {
  const {
    meetings,
    actionItems,
    currentUser,
    setActiveTab,
    enterMeetingRoom,
    cancelScheduledMeeting,
    rejectMeetingInvitation,
    acceptMeetingInvitation,
    setSelectedMeetingId,
  } = useApp();

  const upcomingRef = useRef<HTMLDivElement>(null);
  const tasksRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState<'upcoming' | 'tasks'>('upcoming');

  const currentUserMeetings = useMemo(() => {
    return meetings.filter((m) => {
      if (!m.participants) return false;
      return m.participants.some((p) => {
        const pName = typeof p === 'string' ? p : (p as any).name || '';
        return (
          pName.toLowerCase().includes(currentUser.name.toLowerCase()) ||
          currentUser.name.toLowerCase().includes(pName.toLowerCase())
        );
      });
    });
  }, [meetings, currentUser]);

  const scheduledMeetings = useMemo(
    () => currentUserMeetings.filter((m) => m.status === 'Scheduled'),
    [currentUserMeetings]
  );

  const completedMeetings = useMemo(
    () => currentUserMeetings.filter((m) => m.status === 'Completed'),
    [currentUserMeetings]
  );

  // Dynamic user tasks extracted from meetings and global action items
  const myTasks = useMemo(() => {
    const all: any[] = [];
    actionItems.forEach((item) => {
      if (item.assignee?.toLowerCase().includes(currentUser.name.toLowerCase())) {
        all.push(item);
      }
    });
    meetings.forEach((m) => {
      (m.actionItems || []).forEach((item) => {
        if (
          item.assignee?.toLowerCase().includes(currentUser.name.toLowerCase()) &&
          !all.find((t) => t.id === item.id)
        ) {
          all.push({ ...item, meetingTitle: m.title, meetingId: m.id });
        }
      });
    });
    return all.filter((t) => t.status !== 'Completed' && t.status !== 'Done');
  }, [actionItems, meetings, currentUser.name]);

  const handleTaskClick = (task: any) => {
    let targetId = task.meetingId;
    if (!targetId && task.meetingTitle) {
      const match = meetings.find((m) => m.title === task.meetingTitle);
      if (match) targetId = match.id;
    }
    if (!targetId && meetings.length > 0) {
      targetId = meetings[0].id;
    }
    if (targetId) {
      setSelectedMeetingId(targetId);
      setActiveTab('meetings');
    }
  };

  const scrollToUpcoming = () => {
    setActiveSection('upcoming');
    setTimeout(() => {
      upcomingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const switchToTasks = () => {
    setActiveSection('tasks');
    setTimeout(() => {
      tasksRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-8 font-sans animate-fade-in pb-20">

      {/* ── Big Blue Welcome Back Card ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-8 md:p-10 shadow-2xl shadow-blue-900/30 text-white">
        <div className="absolute -top-12 -right-12 w-64 h-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-blue-400/20 blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          <div>
            <span className="inline-block px-3 py-1 bg-white/15 border border-white/20 rounded-full text-xs font-bold uppercase tracking-wider text-blue-100 mb-2">
              Corporate Intelligence Portal
            </span>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
              Welcome back, {currentUser.name}
            </h1>
            <p className="text-blue-100 text-sm mt-1.5 font-medium">
              {currentUser.role} · {currentUser.department}
            </p>
          </div>

          {/* Interactive Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {/* Upcoming Count Card -> scrolls to upcoming */}
            <button
              onClick={scrollToUpcoming}
              className="flex items-center justify-between p-5 bg-white/10 hover:bg-white/20 rounded-2xl border border-white/15 hover:border-white/30 transition-all cursor-pointer text-left group"
            >
              <div className="space-y-1">
                <span className="text-xs font-semibold text-blue-100">Upcoming Meetings</span>
                <div className="text-3xl font-black">{scheduledMeetings.length}</div>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/15 group-hover:bg-white/25 flex items-center justify-center text-blue-100 transition-colors">
                <Calendar className="w-6 h-6" />
              </div>
            </button>

            {/* Tasks Count Card -> switches to tasks */}
            <button
              onClick={switchToTasks}
              className="flex items-center justify-between p-5 bg-white/10 hover:bg-white/20 rounded-2xl border border-white/15 hover:border-white/30 transition-all cursor-pointer text-left group"
            >
              <div className="space-y-1">
                <span className="text-xs font-semibold text-blue-100">Assigned Tasks</span>
                <div className="text-3xl font-black">{myTasks.length}</div>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/15 group-hover:bg-white/25 flex items-center justify-center text-blue-100 transition-colors">
                <ClipboardList className="w-6 h-6" />
              </div>
            </button>

            {/* Completed Count Card -> navigates to Meeting Intelligence page */}
            <button
              onClick={() => setActiveTab('meetings')}
              className="flex items-center justify-between p-5 bg-white/10 hover:bg-white/20 rounded-2xl border border-white/15 hover:border-white/30 transition-all cursor-pointer text-left group"
            >
              <div className="space-y-1">
                <span className="text-xs font-semibold text-blue-100">Completed Meetings</span>
                <div className="text-3xl font-black">{completedMeetings.length}</div>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/15 group-hover:bg-white/25 flex items-center justify-center text-blue-100 transition-colors">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* ── Section Tabs ── */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={scrollToUpcoming}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            activeSection === 'upcoming'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-blue-400'
          }`}
        >
          Upcoming Invitations ({scheduledMeetings.length})
        </button>

        <button
          onClick={switchToTasks}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            activeSection === 'tasks'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-blue-400'
          }`}
        >
          My Action Tasks ({myTasks.length})
        </button>
      </div>

      {/* ── Upcoming Meetings Section (Simple 2-Column Invitation Cards) ── */}
      {activeSection === 'upcoming' && (
        <div ref={upcomingRef} className="space-y-4 scroll-mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-500" />
              Scheduled Invitations
            </h2>
            <span className="text-xs text-slate-400 font-semibold">{scheduledMeetings.length} items</span>
          </div>

          {scheduledMeetings.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-12 text-center bg-white dark:bg-slate-900 space-y-1">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No upcoming meetings scheduled</p>
              <p className="text-xs text-slate-400">Scheduled invitations from colleagues will appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scheduledMeetings.map((mtg) => {
                const isHost =
                  (mtg.hostName || '').toLowerCase() === currentUser.name.toLowerCase() ||
                  (mtg.hostEmail || '').toLowerCase() === currentUser.email.toLowerCase();
                const roomCode = (mtg.roomCode || (mtg.id.replace(/[^a-zA-Z0-9]/g, '').slice(-5).toUpperCase()) || 'ROOM1').trim();
                const participantList = (mtg.participants || [])
                  .map((p) => (typeof p === 'string' ? p : (p as any).name))
                  .join(', ');

                return (
                  <div
                    key={mtg.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all flex flex-col justify-between gap-5"
                  >
                    {/* Top Info */}
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {isHost ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-[10px] font-bold border border-amber-200 dark:border-amber-800">
                            Host (You)
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold border border-blue-200 dark:border-blue-800">
                            Invited by {mtg.hostName || 'Organizer'}
                          </span>
                        )}
                        {roomCode && (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-mono font-bold border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                            <Hash className="w-2.5 h-2.5 text-blue-500" />
                            {roomCode}
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                        {mtg.title}
                      </h3>

                      <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <p className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{mtg.dateTime}</span>
                        </p>
                        <p className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">Attendees: {participantList}</span>
                        </p>
                      </div>
                    </div>

                    {/* Equal Size Toggle Buttons (No Icons) */}
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                      <button
                        onClick={() => {
                          if (!isHost) acceptMeetingInvitation(mtg.id);
                          enterMeetingRoom(roomCode, mtg.id);
                        }}
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-blue-600/20 cursor-pointer text-center"
                      >
                        {isHost ? 'Start Meeting' : 'Enter Room'}
                      </button>

                      {isHost ? (
                        <button
                          onClick={() => {
                            if (window.confirm(`Cancel scheduled meeting "${mtg.title}"?`)) {
                              cancelScheduledMeeting(mtg.id);
                            }
                          }}
                          className="w-full py-2.5 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl border border-rose-200 dark:border-rose-800 transition-colors cursor-pointer text-center"
                        >
                          Cancel Meeting
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            if (window.confirm(`Decline invitation to "${mtg.title}"?`)) {
                              rejectMeetingInvitation(mtg.id, currentUser.name);
                            }
                          }}
                          className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-600 dark:text-slate-400 hover:text-rose-600 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer text-center"
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── My Tasks Section ── */}
      {activeSection === 'tasks' && (
        <div ref={tasksRef} className="space-y-4 scroll-mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-blue-500" />
              Assigned Action Tasks
            </h2>
            <span className="text-xs text-slate-400 font-semibold">
              {myTasks.filter((t) => t.status !== 'Completed').length} pending
            </span>
          </div>

          {myTasks.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-12 text-center bg-white dark:bg-slate-900 space-y-1">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No action tasks assigned to you</p>
              <p className="text-xs text-slate-400">Tasks extracted from meeting recordings and live calls will be listed here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {myTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => handleTaskClick(task)}
                  className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex items-start gap-3.5 hover:border-blue-500 dark:hover:border-blue-600 hover:shadow-md transition-all cursor-pointer group"
                  title="Click to view meeting details"
                >
                  <div
                    className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${
                      task.status === 'Completed'
                        ? 'bg-emerald-500'
                        : task.status === 'In Progress'
                        ? 'bg-blue-500 animate-pulse'
                        : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <p
                      className={`text-sm font-bold leading-snug ${
                        task.status === 'Completed'
                          ? 'line-through text-slate-400 dark:text-slate-500'
                          : 'text-slate-800 dark:text-white'
                      }`}
                    >
                      {task.task}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <TaskStatusBadge status={task.status} />
                      <PriorityPill priority={task.priority} />
                      <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {task.dueDate}
                      </span>
                      {task.meetingTitle && (
                        <span className="text-[11px] text-slate-400 font-medium truncate max-w-[160px]">
                          · {task.meetingTitle}
                        </span>
                      )}
                    </div>
                    <div className="pt-1 flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-bold group-hover:underline">
                      <span>Open Meeting Details</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
};
