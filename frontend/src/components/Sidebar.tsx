import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  LayoutDashboard,
  Video,
  Share2,
  Sparkles,
  Settings,
  Users,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { TabType } from '../types';

interface NavItem {
  id: TabType;
  label: string;
  icon: React.ReactNode;
}

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab } = useApp();

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar_collapsed', String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const navItems: NavItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-5 h-5" />
    },
    {
      id: 'meetings',
      label: 'Meeting Intelligence',
      icon: <Video className="w-5 h-5" />
    },
    {
      id: 'memoryGraph',
      label: 'Memory Graph',
      icon: <Share2 className="w-5 h-5" />
    },
    {
      id: 'live-meeting',
      label: 'Live Meeting',
      icon: <Video className="w-5 h-5" />
    },
    {
      id: 'directory',
      label: 'Directory',
      icon: <Users className="w-5 h-5" />
    },
    {
      id: 'coco',
      label: 'Ask Coco',
      icon: <Sparkles className="w-5 h-5 text-slate-400" />
    }
  ];

  return (
    <aside
      className={`shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 flex flex-col justify-between h-[calc(100vh-4rem)] sticky top-16 transition-all duration-300 font-sans ${
        isCollapsed ? 'w-20' : 'w-72'
      }`}
    >
      <div className="p-3 space-y-4">

        {/* Navigation Group Header with subtle collapse toggle */}
        <div>
          {isCollapsed ? (
            <div className="flex items-center justify-center mb-3">
              <button
                type="button"
                onClick={toggleCollapse}
                title="Expand Navigation"
                aria-label="Expand Navigation"
                className="p-1.5 rounded-xl text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="px-3 mb-2 flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 font-mono">
                NAVIGATION
              </span>
              <button
                type="button"
                onClick={toggleCollapse}
                title="Collapse Navigation"
                aria-label="Collapse Navigation"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Navigation Items List */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full flex items-center rounded-2xl text-sm font-semibold transition-all group cursor-pointer ${
                    isCollapsed ? 'justify-center p-3' : 'justify-between px-3.5 py-3'
                  } ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 shadow-2xs border-l-4 border-blue-600 font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'}`}>
                    <span
                      className={
                        isActive
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-slate-400 group-hover:text-blue-500 transition-colors'
                      }
                    >
                      {item.icon}
                    </span>
                    {!isCollapsed && <span>{item.label}</span>}
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

      </div>

      {/* Footer Settings Icon Button */}
      <div className={`p-3 flex items-center ${isCollapsed ? 'justify-center' : 'justify-start p-4'}`}>
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          title="Settings"
          aria-label="Settings"
          className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-center ${
            activeTab === 'settings'
              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 shadow-2xs'
              : 'bg-slate-50 dark:bg-slate-800/60 text-slate-500 hover:text-slate-900 dark:hover:text-white border-slate-200/60 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </aside>
  );
};
