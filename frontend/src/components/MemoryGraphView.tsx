import React from 'react';
import { useApp } from '../context/AppContext';
import { KnowledgeGraphView } from './KnowledgeGraphView';

/** Whole-organization "Memory Graph" page.
 * Renders the full 2D interactive force-directed organizational memory graph
 * across all meetings, decisions, action items, participants, and contradiction edges. */
export const MemoryGraphView: React.FC = () => {
  const { meetings, sendDirectMessage } = useApp();

  return (
    <div className="max-w-[1920px] w-full mx-auto px-8 py-6 animate-fade-in font-sans">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Memory Graph</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          The whole organizational knowledge graph — every meeting, person, decision, and
          action item, with cross-meeting contradictions highlighted in red.
        </p>
      </div>

      <div className="w-full">
        <KnowledgeGraphView
          meetings={meetings}
          currentMeetingId="ALL"
          onSendDirectMessage={(recipientName, text) => sendDirectMessage(recipientName, text)}
        />
      </div>
    </div>
  );
};
