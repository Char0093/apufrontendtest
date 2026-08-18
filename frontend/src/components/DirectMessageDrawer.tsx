import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
  X, 
  Send, 
  MessageSquare, 
  User, 
  CheckCheck,
  Building2,
  Sparkles
} from 'lucide-react';

export const DirectMessageDrawer: React.FC = () => {
  const { 
    isDmDrawerOpen, 
    closeDmDrawer, 
    activeDmParticipant, 
    currentUser, 
    directMessages, 
    sendDirectMessage 
  } = useApp();

  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isDmDrawerOpen) {
      scrollToBottom();
    }
  }, [isDmDrawerOpen, directMessages]);

  if (!isDmDrawerOpen || !activeDmParticipant) return null;

  // Filter messages between currentUser and activeDmParticipant
  const chatThread = directMessages.filter(
    m => (m.senderId === currentUser.id && m.receiverId === activeDmParticipant.id) ||
         (m.senderId === activeDmParticipant.id && m.receiverId === currentUser.id)
  );

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    sendDirectMessage(activeDmParticipant.id, inputMessage.trim());
    setInputMessage('');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-sans animate-fade-in">
      {/* Dark Overlay Background */}
      <div 
        onClick={closeDmDrawer}
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col justify-between transform transition-transform duration-300 ease-in-out">
          
          {/* Drawer Header */}
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between shadow-md shrink-0">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="relative shrink-0">
                <img 
                  src={activeDmParticipant.avatarUrl} 
                  alt={activeDmParticipant.name} 
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-blue-500/40"
                />
                {activeDmParticipant.isOnline && (
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-bold truncate text-white">
                    {activeDmParticipant.name}
                  </h3>
                  <span className="px-1.5 py-0.2 bg-blue-500/30 text-blue-300 text-[10px] font-bold rounded-md shrink-0">
                    Direct Message
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 truncate">
                  {activeDmParticipant.role} • {activeDmParticipant.department}
                </p>
              </div>
            </div>

            <button
              onClick={closeDmDrawer}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors shrink-0 ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Context Banner */}
          <div className="px-4 py-2 bg-blue-50/80 dark:bg-blue-950/40 border-b border-blue-100 dark:border-blue-900/40 flex items-center justify-between text-xs text-blue-900 dark:text-blue-200">
            <div className="flex items-center space-x-1.5 text-[11px] font-medium truncate">
              <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>Participant Chat • End-to-end encrypted</span>
            </div>
            <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400 font-bold shrink-0">
              Online
            </span>
          </div>

          {/* Message History Feed */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/50 dark:bg-slate-950/30">
            {chatThread.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 space-y-2">
                <MessageSquare className="w-8 h-8 text-blue-400 mx-auto" />
                <p className="font-semibold text-slate-600 dark:text-slate-300">Start a conversation with {activeDmParticipant.name}</p>
                <p className="text-[11px] text-slate-400">Direct messages dispatch instant in-app alerts to team members.</p>
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
                      className={`max-w-[85%] p-3 rounded-2xl text-xs space-y-1 ${
                        isMe
                          ? 'bg-blue-600 text-white rounded-br-none shadow-md shadow-blue-600/20'
                          : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-none border border-slate-200/80 dark:border-slate-700/80 shadow-xs'
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
            <div ref={messagesEndRef} />
          </div>

          {/* Input Form Footer */}
          <form 
            onSubmit={handleSend}
            className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center space-x-2 shrink-0"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={`Message ${activeDmParticipant.name.split(' ')[0]}...`}
              className="flex-1 px-4 py-2.5 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            />

            <button
              type="submit"
              disabled={!inputMessage.trim()}
              className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-md shadow-blue-600/30 transition-all disabled:opacity-40 shrink-0 cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

        </div>
      </div>
    </div>
  );
};
