import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { askCoco } from '../services/api';
import { 
  Sparkles, 
  Send, 
  Copy, 
  Check, 
  ShieldAlert, 
  Database, 
  RefreshCw, 
  Terminal, 
  Cpu, 
  FileText,
  User
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'coco';
  text: string;
  timestamp: string;
  type?: 'text' | 'table' | 'contradiction_summary';
  tableData?: { headers: string[]; rows: string[][] };
  cypherQuery?: string;
}

export const CocoChatView: React.FC = () => {
  const { contradictions, meetings } = useApp();

  const [inputPrompt, setInputPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'coco-init-1',
      sender: 'coco',
      text: 'Hello Alex. I am Coco, your Corporate Brain assistant. Ask me about indexed meetings, decisions, action items, participants, or contradictions.',
      timestamp: '10:00 AM'
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Preset Prompt Pills
  const presetPrompts = [
    "Summarize yesterday's sync",
    "Check contradiction history",
    "Find action items for Sarah",
    "Draft Q3 executive briefing"
  ];

  const handleSendPrompt = (promptText: string) => {
    if (!promptText.trim()) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: promptText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInputPrompt('');
    setIsTyping(true);

    (async () => {
      const nowTs = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      try {
        const result = await askCoco(promptText);

        const citationRows = result.citations.map(c => [c.filename, c.timestamp, c.speaker, c.excerpt]);
        const reply: ChatMessage = citationRows.length > 0
          ? {
              id: `coco-${Date.now()}`,
              sender: 'coco',
              text: result.answer,
              timestamp: nowTs(),
              type: 'table',
              tableData: {
                headers: ['Meeting', 'Timestamp', 'Speaker', 'Excerpt'],
                rows: citationRows
              },
              cypherQuery: result.cypher
            }
          : {
              id: `coco-${Date.now()}`,
              sender: 'coco',
              text: result.answer,
              timestamp: nowTs(),
              cypherQuery: result.cypher
            };

        setMessages(prev => [...prev, reply]);
      } catch (e) {
        console.warn('[Corporate Brain] Ask Coco backend unreachable:', e);
        setMessages(prev => [...prev, {
          id: `coco-${Date.now()}`,
          sender: 'coco',
          text: `**${contradictions.length} contradictions** and ${meetings.length} meetings are indexed locally, but I can't reach the Ask Coco backend right now — is it running?`,
          timestamp: nowTs()
        }]);
      } finally {
        setIsTyping(false);
      }
    })();
  };

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="max-w-[1920px] w-full mx-auto px-8 py-6 h-[calc(100vh-6rem)] animate-fade-in flex flex-col font-sans">
      
      {/* Header */}
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800 mb-4 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-sans text-slate-900 dark:text-white flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-violet-500" />
            <span>Coco AI Assistant (Interactive Chat Agent)</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Deterministic, transparent queries over the enterprise meeting graph.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <span className="px-2.5 py-1 bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 rounded-lg font-semibold flex items-center space-x-1">
            <Cpu className="w-3.5 h-3.5" />
            <span>Neo4j Template Queries</span>
          </span>
        </div>
      </div>

      {/* Chat Container */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex-1 flex flex-col overflow-hidden min-h-0">
        
        {/* Preset Prompt Bar */}
        <div className="p-3 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex items-center space-x-2 overflow-x-auto shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">Preset Prompts:</span>
          {presetPrompts.map((preset) => (
            <button
              key={preset}
              onClick={() => handleSendPrompt(preset)}
              className="px-3 py-1 bg-white dark:bg-slate-800 hover:bg-violet-50 dark:hover:bg-violet-950/60 text-slate-700 dark:text-slate-300 hover:text-violet-600 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 shrink-0 transition-colors shadow-xs"
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Message Feed */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4">
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex items-start space-x-3 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  isUser 
                    ? 'bg-indigo-600 text-white' 
                    : 'bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/20'
                }`}>
                  {isUser ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                </div>

                <div className={`max-w-2xl p-4 rounded-2xl text-xs space-y-3 relative group ${
                  isUser
                    ? 'bg-indigo-600 text-white rounded-tr-none'
                    : 'bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 rounded-tl-none border border-slate-200 dark:border-slate-700/80'
                }`}>
                  
                  {/* Message Text */}
                  <div className="leading-relaxed whitespace-pre-wrap font-sans">
                    {msg.text}
                  </div>

                  {/* Structured Table Render */}
                  {msg.type === 'table' && msg.tableData && (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 mt-2">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            {msg.tableData.headers.map((h) => (
                              <th key={h} className="p-2">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {msg.tableData.rows.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className="p-2 text-slate-700 dark:text-slate-300">{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Contradiction Summary Render */}
                  {msg.type === 'contradiction_summary' && (
                    <div className="space-y-2 mt-2">
                      {contradictions.map(c => (
                        <div key={c.id} className="p-3 bg-rose-50/60 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl">
                          <div className="font-bold text-rose-600 dark:text-rose-400">{c.title}</div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400">{c.recommendation}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Generated Cypher Graph Query Preview */}
                  {msg.cypherQuery && (
                    <div className="p-3 bg-slate-900 text-slate-200 rounded-xl font-mono text-[10px] space-y-1 border border-slate-800">
                      <div className="flex items-center space-x-1 text-violet-400 font-bold">
                        <Terminal className="w-3 h-3" />
                        <span>Generated Neo4j Cypher Query</span>
                      </div>
                      <p className="text-slate-400">{msg.cypherQuery}</p>
                    </div>
                  )}

                  {/* Timestamp & Copy Button */}
                  <div className="flex items-center justify-between text-[10px] opacity-75 pt-1">
                    <span>{msg.timestamp}</span>

                    {!isUser && (
                      <button
                        onClick={() => copyToClipboard(msg.id, msg.text)}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-slate-600"
                        title="Copy structured response"
                      >
                        {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center">
                <Sparkles className="w-4 h-4 animate-spin" />
              </div>
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl text-xs text-slate-500 flex items-center space-x-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-violet-500" />
                <span>Synthesizing enterprise knowledge graph...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <form onSubmit={(e) => { e.preventDefault(); handleSendPrompt(inputPrompt); }} className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center space-x-2">
          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            placeholder="Ask Coco AI about meeting decisions, policy contradictions, or action items..."
            className="flex-1 px-4 py-2.5 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-violet-500 focus:outline-none transition-colors"
          />

          <button
            type="submit"
            disabled={!inputPrompt.trim()}
            className="px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-xs font-semibold rounded-xl shadow-md shadow-violet-600/30 transition-all flex items-center space-x-1.5 disabled:opacity-50"
          >
            <span>Ask Coco</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>

      </div>

    </div>
  );
};
