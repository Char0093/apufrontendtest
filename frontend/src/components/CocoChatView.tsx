import React, { useRef, useEffect, useState } from 'react';
import { useApp, CocoChatMessage } from '../context/AppContext';
import {
  Sparkles,
  Send,
  Bot,
  User,
  FileVideo,
  Clock,
  Link,
  Trash2,
  Loader2,
} from 'lucide-react';

// ── Ask Coco backend — uses Vite proxy to avoid cross-origin issues ─────────
// Vite proxies: /coco/* → http://localhost:8200/*
//               /api/*  → http://localhost:8000/*

async function fetchCocoAnswer(query: string): Promise<{ answer: string; citations: CocoChatMessage['citations'] }> {
  // 1. Try Ask Coco standalone server (via Vite proxy /coco → port 8200)
  try {
    const res = await fetch('/coco/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (res.ok) return await res.json();
  } catch {
    // proxy unreachable, fall through to main backend
  }

  // 2. Try main FastAPI backend (via Vite proxy /api → port 8000)
  const res8000 = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res8000.ok) throw new Error(`Ask Coco API error: ${res8000.status}`);
  return await res8000.json();
}

// ── Fallback demo answers ──────────────────────────────────────────────────

function getFallbackAnswer(q: string): { answer: string; citations: CocoChatMessage['citations'] } {
  const ql = q.toLowerCase();
  if (ql.includes('certificate') || ql.includes('samuel')) {
    return {
      answer:
        "In the meeting 'Build with AI with Md. Samiul Apon.mp4', Samuel clarified that posting on LinkedIn is compulsory to receive the certificate. Participants will receive a certificate for each session and a master certificate upon completing all sessions.",
      citations: [
        { filename: 'Build with AI with Md. Samiul Apon.mp4', speaker: 'Samuel', timestamp: '00:00:08', excerpt: "It's wise to post because we made it compulsory." },
        { filename: 'Build with AI with Md. Samiul Apon.mp4', speaker: 'Samuel', timestamp: '00:03:18', excerpt: "Oh, no. I mean, it's each session we're gonna get certificate." },
      ],
    };
  } else if (ql.includes('provider x') || ql.includes('vendor')) {
    return {
      answer:
        'Provider X was evaluated for critical Q3 rollout needs. AI analysis flagged a potential contradiction against the historical decision to freeze all new vendor onboarding until Q4.',
      citations: [
        { filename: 'Build with AI with Md. Samiul Apon.mp4', speaker: 'Alex', timestamp: '00:03:18', excerpt: 'Grant an exception to the vendor freeze for CloudSolutions Pro due to its criticality for Q3 rollout.' },
      ],
    };
  }
  return {
    answer: `Both the Ask Coco backend (port 8200) and the main backend (port 8000) could not be reached right now.\n\nPlease ensure the servers are running, then try again.\n\n(Demo fallback for: "${q}")`,
    citations: [],
  };
}

// ── Helper ────────────────────────────────────────────────────────────────

function nowTs(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Safely extract final answer after closing </think> or </thinking> tag */
function stripThink(text: string): string {
  if (!text) return '';
  let clean = text;
  if (/<\/think>/i.test(clean)) {
    clean = clean.split(/<\/think>/i).pop() || clean;
  } else if (/<\/thinking>/i.test(clean)) {
    clean = clean.split(/<\/thinking>/i).pop() || clean;
  }
  return clean.replace(/<\/?(?:think|thinking)>/gi, '').trim();
}

/** Parses simple markdown (**bold text**) into styled React elements */
function renderFormattedText(text: string, isUser: boolean) {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, lineIdx) => {
    const parts = line.split(/(\*\*.*?\*\*)/g);
    const formattedLine = parts.map((part, partIdx) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        const content = part.slice(2, -2);
        return (
          <strong
            key={partIdx}
            className={`font-bold ${isUser ? 'text-white' : 'text-slate-900 dark:text-white'}`}
          >
            {content}
          </strong>
        );
      }
      return part;
    });

    return (
      <React.Fragment key={lineIdx}>
        {formattedLine}
        {lineIdx < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

// ── Component ─────────────────────────────────────────────────────────────

export const CocoChatView: React.FC = () => {
  const { cocoChatHistory, setCocoChatHistory, clearCocoChatHistory } = useApp();

  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [cocoChatHistory, isTyping]);

  const handleSend = async (query: string) => {
    const q = query.trim();
    if (!q || isTyping) return;

    setInput('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    setIsTyping(true);

    const userMsg: CocoChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      text: q,
      citations: [],
      ts: nowTs(),
    };
    setCocoChatHistory(prev => [...prev, userMsg]);

    try {
      const data = await fetchCocoAnswer(q);
      const cleanText = stripThink(data.answer ?? '').replace(/^NO_INFO:\s*/i, '');
      const hasNoInfo = /no information|don't have any info|could not be found|couldn't find/i.test(cleanText);
      const aiMsg: CocoChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'ai',
        text: cleanText,
        citations: hasNoInfo ? [] : (data.citations ?? []),
        ts: nowTs(),
      };
      setCocoChatHistory(prev => [...prev, aiMsg]);
    } catch {
      console.warn('[Corporate Brain] Ask Coco backend unreachable, using fallback.');
      const fallback = getFallbackAnswer(q);
      const aiMsg: CocoChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'ai',
        text: fallback.answer,
        citations: fallback.citations,
        ts: nowTs(),
      };
      setCocoChatHistory(prev => [...prev, aiMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  };

  const isEmpty = cocoChatHistory.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-[1920px] mx-auto w-full font-sans bg-slate-50 dark:bg-slate-950 animate-fade-in">

      {/* Top Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-8 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-600" />
            Ask Coco
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Query your organization's meeting memory — every answer cited to the exact source, speaker, and timestamp
          </p>
        </div>
        <button
          onClick={clearCocoChatHistory}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Clear Chat
        </button>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto flex flex-col gap-5 min-h-0"
        style={{ padding: '28px 18%', scrollbarWidth: 'thin' }}
      >

        {/* Empty State */}
        {isEmpty && !isTyping && (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-950 border border-blue-100 dark:border-blue-900 flex items-center justify-center mb-5 shadow-lg shadow-blue-500/10">
              <Sparkles className="w-8 h-8 text-blue-500" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white mb-2">Ask Coco Anything</h2>
            <p className="text-sm text-slate-500 max-w-sm leading-relaxed">
              Ask natural language questions across all your processed meetings, transcripts, decisions, and action items.
            </p>
          </div>
        )}

        {/* Message List */}
        {cocoChatHistory.map(msg => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-[88%] ${isUser ? 'self-end flex-row-reverse' : 'self-start'}`}
              style={{ animation: 'fadeIn 200ms ease-out' }}
            >
              {/* Avatar */}
              <div
                className="flex-shrink-0 flex items-center justify-center text-white font-bold"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: isUser ? '#2563EB' : 'linear-gradient(135deg, #0D9488, #2563EB)',
                }}
              >
                {isUser ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
              </div>

              {/* Bubble */}
              <div
                className={`text-sm leading-relaxed shadow-sm ${
                  isUser
                    ? 'text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                }`}
                style={{
                  borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  padding: '14px 18px',
                  background: isUser ? '#2563EB' : undefined,
                  border: isUser ? 'none' : undefined,
                }}
              >
                <div className="whitespace-pre-wrap">{renderFormattedText(msg.text, isUser)}</div>

                {/* Citations */}
                {!isUser && msg.citations.length > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                      <Link className="w-3 h-3 text-blue-500" />
                      Sources &amp; Citations ({msg.citations.length})
                    </div>
                    <div className="space-y-2">
                      {msg.citations.map((c, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 rounded-xl p-3 transition-all hover:bg-blue-50/40 dark:hover:bg-blue-950/20"
                        >
                          <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400 font-semibold text-xs mb-1.5">
                            <FileVideo className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{c.filename || 'Meeting File'}</span>
                          </div>
                          <div className="flex items-center gap-3 text-slate-500 text-[11px] mb-1">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {c.speaker || 'Speaker'}
                            </span>
                            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 rounded-md font-semibold text-[10px]">
                              <Clock className="w-2.5 h-2.5" />
                              {c.timestamp || '00:00:00'}
                            </span>
                          </div>
                          {c.excerpt && (
                            <div className="text-slate-500 dark:text-slate-400 italic text-[11.5px] border-l-2 border-slate-300 dark:border-slate-600 pl-2 mt-1.5">
                              "{c.excerpt}"
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timestamp */}
                <div className={`text-[10px] mt-2 ${isUser ? 'text-blue-200 text-right' : 'text-slate-400'}`}>
                  {msg.ts}
                </div>
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex gap-3 self-start">
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #0D9488, #2563EB)' }}
            >
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 shadow-sm" style={{ borderBottomLeftRadius: 4 }}>
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                <span>Coco is searching organizational memory...</span>
                <span className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-blue-500 opacity-40 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div
        className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0"
        style={{ padding: '16px 18%' }}
      >
        <div
          className={`flex gap-2.5 items-end transition-all rounded-xl px-3.5 py-2.5 border ${
            input
              ? 'border-blue-600 dark:border-blue-500 bg-white dark:bg-slate-800 shadow-md shadow-blue-500/10'
              : 'border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/60'
          }`}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask Coco about any meeting, decision, or speaker..."
            rows={1}
            className="flex-1 bg-transparent border-0 outline-none resize-none text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 leading-relaxed font-sans"
            style={{ maxHeight: 120, scrollbarWidth: 'none' }}
          />
          <button
            onClick={() => handleSend(input)}
            disabled={!input.trim() || isTyping}
            className="flex items-center justify-center flex-shrink-0 transition-all rounded-xl w-9 h-9 border-0 cursor-pointer disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 dark:bg-blue-600 dark:hover:bg-blue-500 text-white disabled:bg-slate-200 dark:disabled:bg-slate-800/80 disabled:text-slate-400 dark:disabled:text-slate-600 shadow-md shadow-blue-600/20"
          >
            {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-center text-[11.5px] text-slate-400 dark:text-slate-500 mt-2">
          Answers are synthesized by Groq from your organization's meeting records. Always verify critical decisions.
        </p>
      </div>
    </div>
  );
};
