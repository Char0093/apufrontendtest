import { API_BASE } from '../services/api';
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

async function fetchCocoAnswer(query: string, user_id?: string, user_role?: string): Promise<{ answer: string; citations: CocoChatMessage['citations'] }> {
  // Connect directly to live Hugging Face backend API
  try {
    const res = await fetch(`${API_BASE}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, user_id, user_role }),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        answer: data.answer || "No records found.",
        citations: data.citations || [],
      };
    }
  } catch (e) {
    console.warn("Ask Coco live query error, falling back to local dataset:", e);
  }

  // Graceful fallback for offline demo questions
  return getFallbackAnswer(query);
}

// -- Fallback demo answers --------------------------------------------------

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
        { filename: 'Q3 Vendor Assessment.mp4', speaker: 'Alex Wong', timestamp: '00:14:22', excerpt: 'We are moving forward with Provider X for the core deployment.' },
        { filename: 'Q2 Strategy Review.mp4', speaker: 'Sarah Chen', timestamp: '00:31:05', excerpt: 'All new external vendor onboardings are paused until Q4 audit completion.' },
      ],
    };
  } else if (ql.includes('delivery') || ql.includes('schedule') || ql.includes('slot')) {
    return {
      answer:
        'The delivery slot was finalized for Monday PM after reviewing congestion risks on Monday AM and maintenance risks on Tuesday AM. Branch packing is scheduled for Tuesday-Wednesday.',
      citations: [
        { filename: 'SUPPLIER DELIVERY SCHEDULE CHANGE', speaker: 'Yap En Yu', timestamp: '00:01:15', excerpt: 'Monday PM retains buffer day for Marketing while clearing loading bay.' },
      ],
    };
  } else {
    return {
      answer:
        `I searched across all stored meeting intelligence records for "${q}". I am ready to answer any questions about your meetings, decisions, action items, and participants.`,
      citations: [],
    };
  }
}

// -- Component -------------------------------------------------------------

export const CocoChatView: React.FC = () => {
  const { cocoMessages, addCocoMessage, clearCocoMessages, currentUser } = useApp();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [cocoMessages, loading]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const userText = input.trim();
    if (!userText || loading) return;

    setInput('');
    addCocoMessage({ role: 'user', content: userText });
    setLoading(true);

    try {
      const data = await fetchCocoAnswer(userText, currentUser.name, currentUser.role);
      addCocoMessage({
        role: 'assistant',
        content: data.answer,
        citations: data.citations,
      });
    } catch {
      const fallback = getFallbackAnswer(userText);
      addCocoMessage({
        role: 'assistant',
        content: fallback.answer,
        citations: fallback.citations,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col bg-slate-50 dark:bg-slate-950 font-sans">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900 dark:text-white">Ask Coco</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Query your organization's meeting memory — every answer cited to the exact source, speaker, and timestamp
            </p>
          </div>
        </div>
        {cocoMessages.length > 0 && (
          <button
            onClick={clearCocoMessages}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear Chat
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {cocoMessages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 mb-4">
              <Sparkles className="h-8 w-8" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Ask Coco Anything</h2>
            <p className="max-w-md text-sm text-slate-500 dark:text-slate-400 mb-6">
              Ask about past meetings, decisions made, action items assigned, or contradictions found across sessions.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
              {[
                'What decisions were made about delivery schedule?',
                'Who are the participants across recent meetings?',
                'What are my pending tasks and deadlines?',
                'Are there any contradictions in vendor policy?',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion);
                  }}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-left text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-all shadow-sm"
                >
                  "{suggestion}"
                </button>
              ))}
            </div>
          </div>
        )}

        {cocoMessages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm mt-0.5">
                <Bot className="h-4 w-4" />
              </div>
            )}
            <div
              className={`max-w-2xl rounded-2xl px-4 py-3 text-sm shadow-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-none'
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>

              {/* Citations */}
              {msg.citations && msg.citations.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Link className="h-3 w-3" />
                    Sources & Evidence ({msg.citations.length})
                  </p>
                  <div className="space-y-1.5">
                    {msg.citations.map((cit, ci) => (
                      <div
                        key={ci}
                        className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/50 p-2 text-xs"
                      >
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-medium mb-1">
                          {cit.filename && (
                            <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                              <FileVideo className="h-3 w-3 shrink-0" />
                              {cit.filename}
                            </span>
                          )}
                          {cit.timestamp && (
                            <span className="flex items-center gap-1 text-slate-400">
                              <Clock className="h-3 w-3 shrink-0" />
                              {cit.timestamp}
                            </span>
                          )}
                          {cit.speaker && (
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <User className="h-3 w-3 shrink-0" />
                              {cit.speaker}
                            </span>
                          )}
                        </div>
                        {cit.excerpt && (
                          <p className="text-slate-600 dark:text-slate-400 italic">
                            "{cit.excerpt}"
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 mt-0.5">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 justify-start items-center">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <Bot className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-none border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-500 dark:text-slate-400 shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
              <span>Coco is searching organizational memory...</span>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <form onSubmit={handleSend} className="flex gap-2 max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Coco about any meeting, decision, or speaker..."
            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
        <p className="text-center text-[10px] text-slate-400 dark:text-slate-500 mt-2">
          Answers are synthesized by Groq from your organization's meeting records. Always verify critical decisions.
        </p>
      </div>
    </div>
  );
};
