import { Captions, Mic } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import type { CaptionLine } from '../hooks/useLiveMeetingSession';

interface LiveTranscriptPanelProps {
  transcript: CaptionLine[];
  interimLine?: { speaker: string; text: string; timestamp: string } | null;
  error: string;
}

export const LiveTranscriptPanel: React.FC<LiveTranscriptPanelProps> = ({ transcript, interimLine, error }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest caption as you speak or as interim updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, interimLine]);

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white font-sans">
        <Captions className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <span>Live Transcript</span>
        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md ml-auto border border-emerald-200 dark:border-emerald-800 animate-pulse flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
          <span>Active</span>
        </span>
      </div>

      {error && <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50 p-3 text-xs text-amber-800 dark:text-amber-200">{error}</div>}

      <div className="max-h-64 overflow-y-auto space-y-2.5 pr-2">
        {transcript.length === 0 && !interimLine && !error && (
          <p className="text-xs text-slate-400 italic">Captions will appear continuously as participants speak...</p>
        )}

        {/* Finalized Transcript Lines (Rectangles) */}
        {transcript.map((line) => (
          <div key={line.id} className="text-xs text-slate-800 dark:text-slate-200 bg-slate-50/80 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 space-y-0.5 animate-fade-in">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-blue-600 dark:text-blue-400 font-sans">{line.speaker}</span>
              <span className="text-slate-400 font-mono text-[10px]">{line.timestamp}</span>
            </div>
            <p className="leading-relaxed">{line.text}</p>
          </div>
        ))}

        {/* Real-Time Speaking Interim Preview (Circles) - Disappears once processed into final sentence */}
        {interimLine && (
          <div className="text-xs text-slate-700 dark:text-slate-300 bg-blue-50/70 dark:bg-blue-950/40 p-2.5 rounded-xl border border-blue-200/80 dark:border-blue-800/80 border-dashed space-y-0.5 transition-all">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-blue-600 dark:text-blue-400 font-sans flex items-center gap-1">
                <Mic className="w-3 h-3 text-blue-500 animate-pulse" />
                <span>{interimLine.speaker}</span>
                <span className="text-[10px] font-normal text-blue-500 italic">(speaking...)</span>
              </span>
              <span className="text-slate-400 font-mono text-[10px]">{interimLine.timestamp}</span>
            </div>
            <p className="leading-relaxed italic">{interimLine.text}<span className="inline-block w-1.5 h-3 bg-blue-500 ml-1 animate-pulse" /></p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </section>
  );
};
