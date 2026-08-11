import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { NotificationProvider } from './context/NotificationContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { LoginModal } from './components/LoginModal';
import { CreateMeetingModal } from './components/CreateMeetingModal';
import { DirectMessageDrawer } from './components/DirectMessageDrawer';
import { DashboardView } from './components/DashboardView';
import { MeetingIntelligenceView } from './components/MeetingIntelligenceView';
import { EmployeeDirectoryView } from './components/EmployeeDirectoryView';
import { DirectMessagingView } from './components/DirectMessagingView';
import { CocoChatView } from './components/CocoChatView';
import { SettingsView } from './components/SettingsView';

const MainAppContent: React.FC = () => {
  const { isLoggedIn, activeTab } = useApp();

  if (!isLoggedIn) {
    return <LoginModal />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-white transition-colors duration-200">
      
      {/* Top Navigation Header */}
      <Header />

      {/* Main Body with Sidebar & Content */}
      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">
        <Sidebar />

        <main className="flex-1 min-w-0 overflow-y-auto">
          {activeTab === 'dashboard' && <DashboardView />}
          {activeTab === 'meetings' && <MeetingIntelligenceView />}
          {activeTab === 'directory' && <EmployeeDirectoryView />}
          {activeTab === 'coco' && <CocoChatView />}
          {activeTab === 'settings' && <SettingsView />}
          {activeTab === 'messages' && <DirectMessagingView />}
        </main>
      </div>

      {/* Global Modals & Slide-over Drawers */}
      <CreateMeetingModal />
      <DirectMessageDrawer />
      <LoginModal />
    </div>
  );
};

export function App() {
  return (
    <AppProvider>
      <NotificationProvider>
        <MainAppContent />
      </NotificationProvider>
    </AppProvider>
  );
}

export default App;
