import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Brain, 
  Search, 
  Bell, 
  CheckCheck, 
  LogOut, 
  User as UserIcon, 
  ShieldAlert, 
  Calendar, 
  MessageSquare, 
  CheckCircle2, 
  ChevronDown, 
  Users,
  RefreshCw,
  Check,
  X,
  Plus
} from 'lucide-react';
import { TabType, Notification as AppNotification } from '../types';

export const Header: React.FC = () => {
  const { 
    currentUser, 
    updateCurrentUser,
    switchDemoUser,
    logout, 
    notifications, 
    unreadCount, 
    markAsRead, 
    markAllAsRead,
    setActiveTab,
    setIsCreateMeetingOpen,
    openDmWithUser,
    meetings,
    employees
  } = useApp();

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all');
  
  // Search bar state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close popovers on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setIsProfileOpen(false);
        setIsSwitcherOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredNotifications = notifications.filter(n => {
    if (notifFilter === 'unread') return !n.read;
    return true;
  });

  const handleNotificationClick = (notif: AppNotification) => {
    markAsRead(notif.id);
    if (notif.category === 'message' || notif.type === 'DIRECT_MESSAGE') {
      if (notif.senderName) {
        openDmWithUser(notif.senderName);
      }
    } else if (notif.targetTab) {
      setActiveTab(notif.targetTab as TabType);
    }
    setIsNotifOpen(false);
  };

  // Search matches
  const matchedMeetings = meetings.filter(m => 
    m.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    m.summary?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const matchedEmployees = employees.filter(e => 
    e.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    e.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.department.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getNotifIcon = (category: string) => {
    switch (category) {
      case 'contradiction':
        return <ShieldAlert className="w-4 h-4 text-rose-500" />;
      case 'meeting':
        return <Calendar className="w-4 h-4 text-blue-500" />;
      case 'message':
        return <MessageSquare className="w-4 h-4 text-sky-500" />;
      case 'action_item':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      default:
        return <Bell className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 transition-colors">
      <div className="max-w-[1920px] mx-auto px-8 h-16 flex items-center justify-between gap-4">
        
        {/* Left Brand Title */}
        <div className="flex items-center space-x-3 shrink-0">
          <div 
            onClick={() => setActiveTab('dashboard')}
            className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center cursor-pointer shadow-md shadow-blue-600/30 hover:scale-105 transition-transform"
          >
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="font-extrabold text-slate-900 dark:text-white tracking-tight text-base font-sans flex items-center gap-1.5">
              Corporate Brain
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              AI Decision Intelligence & Anomaly Engine
            </p>
          </div>
        </div>

        {/* Global Search Bar */}
        <div className="relative flex-1 max-w-xl mx-4" ref={searchRef}>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onFocus={() => setIsSearchFocused(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchFocused(true);
              }}
              placeholder="Search meetings, decisions, graph nodes, or action items..."
              className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 transition-all shadow-2xs"
            />
          </div>

          {/* Search Dropdown Results */}
          {isSearchFocused && searchQuery.trim() !== '' && (
            <div className="absolute top-12 left-0 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50 p-2 space-y-2 animate-fade-in max-h-96 overflow-y-auto">
              {matchedMeetings.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                    Matching Meetings ({matchedMeetings.length})
                  </div>
                  {matchedMeetings.map(m => (
                    <div
                      key={m.id}
                      onClick={() => {
                        setActiveTab('meetings');
                        setIsSearchFocused(false);
                      }}
                      className="px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-xl cursor-pointer transition-colors"
                    >
                      <div className="text-xs font-bold text-slate-900 dark:text-white">{m.title}</div>
                      <div className="text-[11px] text-slate-400">{m.project} • {m.dateTime}</div>
                    </div>
                  ))}
                </div>
              )}

              {matchedEmployees.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                    Matching Team Contacts ({matchedEmployees.length})
                  </div>
                  {matchedEmployees.map(e => (
                    <div
                      key={e.id}
                      onClick={() => {
                        switchDemoUser(e.id);
                        setIsSearchFocused(false);
                      }}
                      className="px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-xl cursor-pointer transition-colors flex items-center space-x-2"
                    >
                      <img src={e.avatarUrl} alt={e.name} className="w-6 h-6 rounded-full object-cover" />
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">{e.name}</div>
                        <div className="text-[10px] text-slate-400">{e.role} • {e.department}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {matchedMeetings.length === 0 && matchedEmployees.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-400">
                  No matching meetings or contacts found for "{searchQuery}".
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Controls Group */}
        <div className="flex items-center space-x-3 shrink-0">

          {/* Circular Calendar Schedule Meeting Button */}
          <button
            onClick={() => setIsCreateMeetingOpen(true)}
            title="Schedule Meeting"
            aria-label="Schedule Meeting"
            className="p-2.5 rounded-full bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 border border-blue-200/80 dark:border-blue-800/60 transition-all hover:scale-105 cursor-pointer flex items-center justify-center shadow-2xs"
          >
            <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </button>

          {/* Notifications Bell Icon */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              className="p-2.5 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative cursor-pointer"
              title="In-App Notifications"
            >
              <Bell className="w-5 h-5 text-slate-700 dark:text-slate-200" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 px-1.5 py-0.5 bg-rose-500 text-white text-[10px] font-extrabold rounded-full border-2 border-white dark:border-slate-900 shadow-xs">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Popover Menu */}
            {isNotifOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden z-50 animate-fade-in">
                <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Bell className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-bold font-sans">In-App Notifications</span>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-extrabold rounded-full">
                        {unreadCount} new
                      </span>
                    )}
                  </div>

                  <button
                    onClick={markAllAsRead}
                    className="text-[11px] text-blue-300 hover:text-white flex items-center space-x-1 font-semibold"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Mark all read</span>
                  </button>
                </div>

                {/* Filter Tabs */}
                <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200/60 dark:border-slate-800 flex items-center space-x-2 text-xs">
                  <button
                    onClick={() => setNotifFilter('all')}
                    className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-colors ${
                      notifFilter === 'all'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    All ({notifications.length})
                  </button>
                  <button
                    onClick={() => setNotifFilter('unread')}
                    className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-colors ${
                      notifFilter === 'unread'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    Unread ({unreadCount})
                  </button>
                </div>

                {/* Notifications List */}
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredNotifications.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      No notifications found.
                    </div>
                  ) : (
                    filteredNotifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className={`p-3.5 flex items-start space-x-3 cursor-pointer transition-colors ${
                          !notif.read
                            ? 'bg-blue-50/40 dark:bg-blue-950/30 hover:bg-blue-50 dark:hover:bg-blue-950/50'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-850'
                        }`}
                      >
                        <div className="mt-0.5 p-2 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0">
                          {getNotifIcon(notif.category)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className={`text-xs ${!notif.read ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-700 dark:text-slate-300'}`}>
                              {notif.title}
                            </span>
                            <span className="text-[10px] text-slate-400 shrink-0 ml-1">
                              {notif.timestamp}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                            {notif.message}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile Avatar & Demo Account Switcher Dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => {
                setIsProfileOpen(!isProfileOpen);
                setIsSwitcherOpen(false);
              }}
              className="flex items-center space-x-2 p-1.5 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <div className="relative shrink-0">
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.name}
                  className="w-9 h-9 rounded-full object-cover shrink-0 ring-2 ring-blue-500/30"
                />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
              </div>
              <div className="hidden lg:block text-left">
                <div className="text-xs font-extrabold text-slate-900 dark:text-white leading-tight">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-slate-400 font-medium">
                  {currentUser.role || currentUser.title}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Profile & Demo Switcher Dropdown Menu */}
            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden z-50 animate-fade-in">
                
                {/* Active User Header */}
                <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {currentUser.name}
                  </div>
                  <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">
                    {currentUser.department} Department
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                    {currentUser.email}
                  </div>
                </div>

                <div className="p-1 space-y-0.5 text-xs">
                  {/* Settings Menu Item */}
                  <button
                    onClick={() => {
                      setActiveTab('settings');
                      setIsProfileOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl flex items-center space-x-2.5 transition-colors font-medium cursor-pointer"
                  >
                    <UserIcon className="w-4 h-4 text-blue-500" />
                    <span>Profile & Account Settings</span>
                  </button>
                </div>

                {/* Logout Action */}
                <div className="p-1 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => {
                      setIsProfileOpen(false);
                      logout();
                    }}
                    className="w-full text-left px-3 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl flex items-center space-x-2.5 font-bold transition-colors"
                  >
                    <LogOut className="w-4 h-4 text-rose-500" />
                    <span>Log Out</span>
                  </button>
                </div>

              </div>
            )}
          </div>

        </div>
      </div>
    </header>
  );
};
