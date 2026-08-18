import React, { useState, useEffect } from 'react';
import { ActionItem, UserProfile } from '../types';
import { useNotifications } from '../context/NotificationContext';
import { useApp } from '../context/AppContext';
import { INITIAL_EMPLOYEES_DATA } from '../mock/mockData';
import { 
  CheckSquare, 
  Calendar, 
  User, 
  Lock, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  CheckCircle,
  UserCheck
} from 'lucide-react';

interface ActionItemsTableProps {
  actionItems: ActionItem[];
  meetingId: string;
  currentUser: UserProfile | string;
  meetingHost?: string;
  onUpdateActionItems?: (updated: ActionItem[]) => void;
}

export const ActionItemsTable: React.FC<ActionItemsTableProps> = ({
  actionItems: initialActionItems,
  meetingId,
  currentUser: initialCurrentUser,
  meetingHost,
  onUpdateActionItems
}) => {
  const { toggleActionItem, currentUser: globalUser } = useApp();
  const [items, setItems] = useState<ActionItem[]>(initialActionItems);
  
  // Track logged-in active user name (supports string or UserProfile)
  const initialName = typeof initialCurrentUser === 'string' ? initialCurrentUser : initialCurrentUser?.name || globalUser.name;
  const [activeUser, setActiveUser] = useState<string>(initialName);
  
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const { notifyActionItemCompleted } = useNotifications();

  useEffect(() => {
    setItems(initialActionItems);
  }, [initialActionItems]);

  useEffect(() => {
    if (globalUser?.name) {
      setActiveUser(globalUser.name);
    }
  }, [globalUser?.name]);

  // Helper to safely extract string name from assignee (supports string or object with name)
  const getAssigneeName = (assignee: any): string => {
    if (!assignee) return '';
    if (typeof assignee === 'string') return assignee;
    if (typeof assignee === 'object' && assignee.name) return assignee.name;
    return String(assignee);
  };

  const handleToggleStatus = async (item: ActionItem) => {
    const assigneeName = getAssigneeName(item.assignee);
    
    // Permission check: allow assignee or logged-in active user
    const isMyTask = assigneeName.toLowerCase() === activeUser.toLowerCase() || activeUser.toLowerCase() === globalUser.name.toLowerCase();

    setUpdatingId(item.id);

    // Call global AppContext toggle to update state & broadcast notification to all other meeting participants
    toggleActionItem(item.id);

    // Cycle status for local display
    const nextStatus: ActionItem['status'] = 
      (item.status === 'Completed' || (item.status as string) === 'Done') ? 'In Progress' : 'Completed';

    const updatedItems = items.map(t => (t.id === item.id ? { ...t, status: nextStatus } : t));
    setItems(updatedItems);
    if (onUpdateActionItems) {
      onUpdateActionItems(updatedItems);
    }

    if (nextStatus === 'Completed') {
      setToastMessage("Task status updated to Done! Notification broadcast to meeting participants.");
    } else {
      setToastMessage(`Task status updated to "${nextStatus}".`);
    }

    setUpdatingId(null);
    setTimeout(() => setToastMessage(null), 3500);
  };

  return (
    <div className="space-y-4 font-sans relative">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-blue-500/40 text-xs font-semibold animate-in fade-in slide-in-from-bottom-4 duration-200">
          {toastMessage.includes("Permission Denied") ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Bar with User Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" /> 
          Next Tasks & Assignees
        </h3>

        {/* User Permission Simulator Dropdown */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-medium hidden sm:inline">Viewing as User:</span>
          <div className="relative flex items-center">
            <UserCheck className="w-3.5 h-3.5 absolute left-2.5 text-blue-600 dark:text-blue-400 pointer-events-none" />
            <select
              value={activeUser}
              onChange={(e) => setActiveUser(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 font-bold text-xs focus:outline-hidden cursor-pointer shadow-2xs"
            >
              {INITIAL_EMPLOYEES_DATA.map((emp) => (
                <option key={emp.id} value={emp.name}>
                  {emp.name} ({emp.department})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {items && items.length > 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3.5 px-4">Task Description</th>
                  <th className="py-3.5 px-4">Assignee</th>
                  <th className="py-3.5 px-4">Due Date</th>
                  <th className="py-3.5 px-4">Priority</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((item) => {
                  const assigneeName = getAssigneeName(item.assignee);
                  
                  // Calculate permission: currentUser === task.assignee
                  const isMyTask = assigneeName.toLowerCase() === activeUser.toLowerCase();
                  const isUpdating = updatingId === item.id;
                  const isCompleted = item.status === 'Completed' || (item.status as string) === 'Done';

                  return (
                    <tr 
                      key={item.id} 
                      className={`transition-colors ${
                        isMyTask 
                          ? 'hover:bg-slate-50/80 dark:hover:bg-slate-800/60' 
                          : 'bg-slate-50/40 dark:bg-slate-900/40'
                      }`}
                    >
                      {/* Task Description */}
                      <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-white max-w-xs sm:max-w-md">
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 text-blue-600 dark:text-blue-400 font-bold text-xs">•</span>
                          <span className={isCompleted ? 'line-through text-slate-400 dark:text-slate-500' : ''}>
                            {item.task}
                          </span>
                        </div>
                      </td>

                      {/* Assignee Pill */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                          isMyTask 
                            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' 
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}>
                          <User className="w-3 h-3 text-slate-400" />
                          {assigneeName}
                          {isMyTask && (
                            <span className="text-[10px] bg-blue-200 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1.5 py-0.2 rounded-md font-bold">
                              You
                            </span>
                          )}
                        </span>
                      </td>

                      {/* Due Date */}
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        <span className="flex items-center gap-1 text-xs">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {item.dueDate}
                        </span>
                      </td>

                      {/* Priority Tag */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                          item.priority === 'High' ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800' :
                          item.priority === 'Medium' ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' :
                          'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                        }`}>
                          {item.priority || 'Normal'}
                        </span>
                      </td>

                      {/* Status Tag */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                          isCompleted ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' :
                          item.status === 'In Progress' ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800' :
                          'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                        }`}>
                          {isCompleted && <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />}
                          {item.status === 'In Progress' && <Clock className="w-3 h-3 text-blue-600 dark:text-blue-400" />}
                          {isCompleted ? 'Done' : item.status}
                        </span>
                      </td>

                      {/* Permission-Controlled Toggle Button */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {isMyTask ? (
                          <button
                            disabled={isUpdating}
                            onClick={() => handleToggleStatus(item)}
                            className={`px-3.5 py-1.5 rounded-xl font-semibold text-xs transition-all shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer disabled:opacity-50 flex items-center gap-1.5 ml-auto ${
                              isCompleted 
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                            title="Click to update task status"
                          >
                            {isUpdating ? (
                              <span>Saving...</span>
                            ) : isCompleted ? (
                              <span>Done ✓</span>
                            ) : (
                              <span>Mark as Done</span>
                            )}
                          </button>
                        ) : (
                          <div 
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 text-xs font-medium border border-slate-200 dark:border-slate-700 opacity-70 cursor-not-allowed select-none ml-auto"
                            title={`Only ${assigneeName} can update this status`}
                          >
                            <Lock className="w-3 h-3 text-slate-400" />
                            <span>🔒 Locked</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs space-y-2">
          <CheckSquare className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No action items recorded</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">No next tasks assigned for this meeting.</p>
        </div>
      )}
    </div>
  );
};
