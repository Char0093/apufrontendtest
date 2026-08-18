import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  MessageSquare, 
  Send, 
  Paperclip, 
  Search, 
  CheckCheck, 
  PhoneCall, 
  Video, 
  FileText, 
  Sparkles,
  Info
} from 'lucide-react';

export const DirectMessagingView: React.FC = () => {
  const { 
    employees, 
    currentUser, 
    directMessages, 
    sendDirectMessage, 
    selectedChatUserId, 
    setSelectedChatUserId,
    meetings
  } = useApp();

  const [messageInput, setMessageInput] = useState('');
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);

  const selectedEmployee = employees.find(e => e.id === selectedChatUserId) || employees[0];

  // Messages between current user and selected employee
  const chatThread = directMessages.filter(
    m => (m.senderId === currentUser.id && m.receiverId === selectedEmployee.id) ||
         (m.senderId === selectedEmployee.id && m.receiverId === currentUser.id)
  );

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;
    sendDirectMessage(selectedEmployee.id, messageInput);
    setMessageInput('');
  };

  const handleAttachMeetingNote = (meetingTitle: string) => {
    const attachText = `[Meeting Attachment]: Shared executive summary for "${meetingTitle}". Please review key decision points.`;
    sendDirectMessage(selectedEmployee.id, attachText);
    setShowAttachmentMenu(false);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto h-[calc(100vh-6rem)] animate-fade-in flex flex-col">
      
      {/* View Header */}
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800 mb-4 shrink-0">
        <h1 className="text-xl font-bold font-sans text-slate-900 dark:text-white flex items-center space-x-2">
          <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <span>Direct Messaging & Team Chat</span>
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Real-time end-to-end encrypted team chat with meeting summary attachments.
        </p>
      </div>

      {/* Main Messaging Layout: Contacts List (1 Col) & Active Chat Thread (2.5 Cols) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex-1 flex flex-col md:flex-row min-h-0">
        
        {/* Left Contacts Sidebar */}
        <div className="w-full md:w-80 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 bg-slate-50/50 dark:bg-slate-850/40">
          
          {/* Contacts Search */}
          <div className="p-3 border-b border-slate-200 dark:border-slate-800">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search conversations..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* Contacts List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
            {employees.map((emp) => {
              const isSelected = emp.id === selectedEmployee.id;
              return (
                <div
                  key={emp.id}
                  onClick={() => setSelectedChatUserId(emp.id)}
                  className={`p-3 cursor-pointer transition-colors flex items-center space-x-3 ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-950/60 border-l-4 border-blue-600'
                      : 'hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="relative shrink-0">
                    <img src={emp.avatarUrl} alt={emp.name} className="w-10 h-10 rounded-full object-cover" />
                    {emp.isOnline && (
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold truncate ${isSelected ? 'text-blue-900 dark:text-blue-200 font-bold' : 'text-slate-800 dark:text-slate-200'}`}>
                        {emp.name}
                      </span>
                      <span className="text-[10px] text-slate-400">Online</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {emp.role} • {emp.department}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Active Chat Panel */}
        <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 min-w-0">
          
          {/* Active Chat Header */}
          <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-850">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <img src={selectedEmployee.avatarUrl} alt={selectedEmployee.name} className="w-9 h-9 rounded-full object-cover" />
                {selectedEmployee.isOnline && (
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
                )}
              </div>

              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white font-sans">
                  {selectedEmployee.name}
                </h3>
                <span className="text-[10px] text-slate-400">
                  {selectedEmployee.role} ({selectedEmployee.department})
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2 text-slate-400">
              <button className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors">
                <PhoneCall className="w-4 h-4" />
              </button>
              <button className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors">
                <Video className="w-4 h-4" />
              </button>
              <button className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors">
                <Info className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Chat Messages Feed */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/30 dark:bg-slate-950/20">
            {chatThread.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No direct messages yet. Send a message to start the conversation.
              </div>
            ) : (
              chatThread.map((msg) => {
                const isMe = msg.senderId === currentUser.id;
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-md p-3 rounded-2xl text-xs space-y-1 ${
                        isMe
                          ? 'bg-blue-600 text-white rounded-br-none shadow-md shadow-blue-600/20'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none border border-slate-200/60 dark:border-slate-700/60'
                      }`}
                    >
                      <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    </div>

                    <div className="flex items-center space-x-1 text-[10px] text-slate-400 mt-1 px-1">
                      <span>{msg.timestamp}</span>
                      {isMe && <CheckCheck className="w-3 h-3 text-blue-500" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Attachment Menu Popover */}
          {showAttachmentMenu && (
            <div className="p-3 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 animate-fade-in">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Attach Meeting Summary to Chat
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {meetings.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleAttachMeetingNote(m.title)}
                    className="p-2 text-left bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs transition-colors flex items-center space-x-2"
                  >
                    <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="truncate font-semibold text-slate-800 dark:text-slate-200">{m.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message Input Box */}
          <form onSubmit={handleSend} className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              title="Attach Meeting Summary"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder={`Message ${selectedEmployee.name}...`}
              className="flex-1 px-4 py-2 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
            />

            <button
              type="submit"
              disabled={!messageInput.trim()}
              className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl shadow-md shadow-blue-600/30 transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

        </div>

      </div>

    </div>
  );
};
