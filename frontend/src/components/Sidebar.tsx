import React from 'react';
import { useApp } from '../context/AppContext';
import {
  LayoutDashboard,
  Video,
  Share2,
  Sparkles,
  Settings,
  Users,
  MessageSquare
} from 'lucide-react';
import { TabType } from '../types';

interface NavItem {
  id: TabType;
  label: string;
  icon: React.ReactNode;
  badge?: number | string;
  badgeColor?: string;
  sparkleRight?: boolean;
  greenDotRight?: boolean;
}

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab } = useApp();

  const navItems: NavItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-5 h-5" />,
      badge: '4',
      badgeColor: 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold'
    },
    {
      id: 'meetings',
      label: 'Meeting Intelligence',
      icon: <Video className="w-5 h-5" />,
      sparkleRight: true
    },
    {
      id: 'memoryGraph',
      label: 'Memory Graph',
      icon: <Share2 className="w-5 h-5" />
    },
    {
      id: 'directory',
      label: 'Directory',
      icon: <Users className="w-5 h-5" />
    },
    {
      id: 'messages',
      label: 'Messages',
      icon: <MessageSquare className="w-5 h-5" />
    },
    {
      id: 'coco',
      label: 'Coco (AI Assistant)',
      icon: <Sparkles className="w-5 h-5 text-slate-400" />,
      greenDotRight: true
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="w-5 h-5" />
    }
  ];

  return (
    <aside className="w-72 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 flex flex-col justify-between h-[calc(100vh-4rem)] sticky top-16 transition-colors font-sans">
      <div className="p-4 space-y-4">

        {/* Navigation Group */}
        <div>
          <div className="px-3 mb-2 text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 font-mono">
            NAVIGATION
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-sm font-semibold transition-all group cursor-pointer ${
                    isActive
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 shadow-2xs border-l-4 border-indigo-600 font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <span className={isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 group-hover:text-indigo-500 transition-colors'}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span className={`px-2 py-0.5 text-xs rounded-full ${item.badgeColor}`}>
                      {item.badge}
                    </span>
                  )}

                  {item.sparkleRight && (
                    <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
                  )}

                  {item.greenDotRight && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

      </div>

      {/* Footer System Status Box Card */}
      <div className="p-4">
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/60 dark:border-slate-800 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                AI Engine Online
              </span>
            </div>
            <span className="text-xs font-mono text-slate-400">v2.4</span>
          </div>
          <p className="text-xs text-slate-400 font-medium">
            ASR, LLM & Graph sync ready
          </p>
        </div>
      </div>
    </aside>
  );
};

