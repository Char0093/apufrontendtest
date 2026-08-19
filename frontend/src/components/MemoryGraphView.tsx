import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { KnowledgeGraphView } from './KnowledgeGraphView';
import { GraphData } from '../types';
import * as api from '../services/api';

/** Task 6.6 — the whole-organization "Memory Graph" page, distinct from the
 * per-meeting graph tab inside MeetingDetailView. Reuses KnowledgeGraphView
 * (same force-graph rendering, same CONTRADICTS styling) but feeds it the
 * global /graph endpoint instead of one meeting's /graph-data. */
export const MemoryGraphView: React.FC = () => {
  const { meetings, sendDirectMessage } = useApp();
  const [globalGraphData, setGlobalGraphData] = useState<GraphData | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getGlobalGraphData();
        if (!cancelled) {
          setGlobalGraphData(data ? api.toGraphData(data) : { nodes: [], links: [] });
        }
      } catch (e) {
        if (!cancelled) setError('Could not reach the backend for the knowledge graph.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [meetings.length]);

  return (
    <div className="max-w-[1920px] w-full mx-auto px-8 py-6 animate-fade-in font-sans">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Memory Graph</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          The whole organizational knowledge graph — every meeting, person, decision, and
          action item, with contradictions across meetings highlighted in red.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-96 text-slate-400 text-sm">
          Loading knowledge graph...
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center justify-center h-96 text-red-500 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && globalGraphData && globalGraphData.nodes.length === 0 && (
        <div className="flex items-center justify-center h-96 text-slate-400 text-sm">
          No processed meetings yet — upload and process a meeting to populate the graph.
        </div>
      )}

      {!loading && !error && globalGraphData && globalGraphData.nodes.length > 0 && (
        <KnowledgeGraphView
          data={globalGraphData}
          meetings={meetings}
          currentMeetingId="ALL"
          onSendDirectMessage={(recipientName, text) => sendDirectMessage(recipientName, text)}
        />
      )}
    </div>
  );
};
