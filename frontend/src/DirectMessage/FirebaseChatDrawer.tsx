import React, { useState, useEffect, useRef } from 'react';
import {
  X, Send, ArrowLeft, MessageSquare, CheckCheck, Search, Loader2
} from 'lucide-react';
import {
  sendFirebaseMessage,
  subscribeToThread,
  subscribeToInbox,
  markThreadRead,
  formatTimestamp,
} from './messageService';
import type { FirebaseMessage, ThreadPreview } from './messageService';

interface ChatUser {
  email: string;
  name: string;
  avatarUrl: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  myUser: ChatUser;
  initialTarget?: ChatUser | null;
}

type View = 'inbox' | 'thread';

export const FirebaseChatDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  myUser,
  initialTarget = null,
}) => {
  const [view, setView] = useState<View>(initialTarget ? 'thread' : 'inbox');
  const [target, setTarget] = useState<ChatUser | null>(initialTarget ?? null);
  const [messages, setMessages] = useState<FirebaseMessage[]>([]);
  const [inbox, setInbox] = useState<ThreadPreview[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [inboxSearch, setInboxSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Reset view when initialTarget changes (from Direct Message button)
  useEffect(() => {
    if (initialTarget) {
      setTarget(initialTarget);
      setView('thread');
    }
  }, [initialTarget?.email]);

  // Scroll to bottom of messages
  useEffect(() => {
    if (view === 'thread') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, view]);

  // Subscribe inbox
  useEffect(() => {
    if (!isOpen || !myUser.email) return;
    const unsub = subscribeToInbox(myUser.email, setInbox);
    return () => unsub();
  }, [isOpen, myUser.email]);

  // Subscribe thread messages
  useEffect(() => {
    if (!isOpen || view !== 'thread' || !target) return;
    setMessages([]);
    const unsub = subscribeToThread(myUser.email, target.email, setMessages);
    markThreadRead(myUser.email, target.email);
    return () => unsub();
  }, [isOpen, view, target?.email, myUser.email]);

  const handleOpenThread = (thread: ThreadPreview) => {
    setTarget({
      email: thread.otherEmail,
      name: thread.otherName,
      avatarUrl: thread.otherAvatar,
    });
    setView('thread');
    markThreadRead(myUser.email, thread.otherEmail);
  };

  const handleBack = () => {
    setView('inbox');
    setMessages([]);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !target || sending) return;
    const text = inputText.trim();
    setInputText('');
    setSending(true);
    try {
      await sendFirebaseMessage(
        myUser.email, myUser.name, myUser.avatarUrl,
        target.email, target.name, target.avatarUrl,
        text
      );
    } finally {
      setSending(false);
    }
  };

  const totalUnread = inbox.reduce((sum, t) => sum + t.unreadCount, 0);
  const filteredInbox = inbox.filter(t => {
    const q = inboxSearch.toLowerCase().trim();
    if (!q) return true;
    return (
      t.otherName.toLowerCase().includes(q) ||
      t.lastMessage.toLowerCase().includes(q)
    );
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-sans">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
      />

      {/* Drawer Panel */}
      <div className="fixed inset-y-0 right-0 flex">
        <div className="w-screen max-w-md bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col">

          {/* ── HEADER ── */}
          <div className="bg-slate-900 dark:bg-slate-950 text-white px-4 py-3 flex items-center justify-between shrink-0 shadow-md">
            {view === 'thread' && target ? (
              <div className="flex items-center space-x-3 min-w-0">
                <button
                  onClick={handleBack}
                  className="p-1 hover:bg-slate-800 rounded-lg transition-colors shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="relative shrink-0">
                  <img
                    src={target.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(target.name)}&background=3b82f6&color=fff`}
                    alt={target.name}
                    className="w-9 h-9 rounded-full object-cover ring-2 ring-blue-500/40"
                  />
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold truncate">{target.name}</h3>
                  <p className="text-[10px] text-slate-400 truncate">{target.email}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-2 min-w-0">
                <MessageSquare className="w-4 h-4 text-blue-400 shrink-0" />
                <h3 className="text-sm font-bold">Messages</h3>
                {totalUnread > 0 && (
                  <span className="w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-slate-900 shadow-sm" />
                )}
              </div>
            )}

            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-800 rounded-xl transition-colors shrink-0 ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── INBOX VIEW ── */}
          {view === 'inbox' && (
            <>
              {/* Search inbox */}
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={inboxSearch}
                    onChange={(e) => setInboxSearch(e.target.value)}
                    placeholder="Search conversations..."
                    className="w-full pl-9 pr-4 py-2 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {filteredInbox.length === 0 ? (
                  <div className="p-10 text-center space-y-3">
                    <div className="w-14 h-14 bg-blue-50 dark:bg-blue-950/40 rounded-2xl flex items-center justify-center mx-auto">
                      <MessageSquare className="w-7 h-7 text-blue-400" />
                    </div>
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No conversations yet</p>
                    <p className="text-xs text-slate-400">
                      Click "Direct Message" on any team member's card to start chatting!
                    </p>
                  </div>
                ) : (
                  filteredInbox.map((thread) => (
                    <button
                      key={thread.id}
                      onClick={() => handleOpenThread(thread)}
                      className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
                    >
                      <div className="relative shrink-0">
                        <img
                          src={thread.otherAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(thread.otherName)}&background=3b82f6&color=fff`}
                          alt={thread.otherName}
                          className="w-11 h-11 rounded-full object-cover"
                        />
                        {thread.unreadCount > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-sm" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-semibold truncate ${thread.unreadCount > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                            {thread.otherName}
                          </span>
                          <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                            {formatTimestamp(thread.lastMessageTime)}
                          </span>
                        </div>
                        <p className={`text-[11px] truncate mt-0.5 ${thread.unreadCount > 0 ? 'text-slate-800 dark:text-slate-200 font-medium' : 'text-slate-400'}`}>
                          {thread.lastMessage}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {/* ── THREAD VIEW ── */}
          {view === 'thread' && target && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50 dark:bg-slate-950/30">
                {messages.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/40 rounded-2xl flex items-center justify-center mx-auto">
                      <MessageSquare className="w-6 h-6 text-blue-400" />
                    </div>
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                      Say hi to {target.name.split(' ')[0]}!
                    </p>
                    <p className="text-xs text-slate-400">Messages sync in real-time across all sessions.</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.from === myUser.email;
                    return (
                      <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        {!isMe && (
                          <span className="text-[10px] text-slate-400 mb-1 px-1">{msg.fromName}</span>
                        )}
                        <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-xs shadow-sm ${
                          isMe
                            ? 'bg-blue-600 text-white rounded-br-none shadow-blue-600/20'
                            : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-none border border-slate-200 dark:border-slate-700'
                        }`}>
                          <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                        </div>
                        <div className={`flex items-center space-x-1 mt-1 px-1 text-[10px] text-slate-400`}>
                          <span>{formatTimestamp(msg.timestamp)}</span>
                          {isMe && <CheckCheck className="w-3 h-3 text-blue-400" />}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <form
                onSubmit={handleSend}
                className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center space-x-2 shrink-0"
              >
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={`Message ${target.name.split(' ')[0]}...`}
                  className="flex-1 px-4 py-2.5 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || sending}
                  className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-2xl shadow-md shadow-blue-600/30 transition-all shrink-0"
                >
                  {sending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Send className="w-4 h-4" />
                  }
                </button>
              </form>
            </>
          )}

        </div>
      </div>
    </div>
  );
};
