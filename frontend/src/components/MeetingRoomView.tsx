import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
  useTracks,
  VideoTrack,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import {
  Camera,
  CameraOff,
  AlertCircle,
  Captions,
  LogOut,
  Mic,
  MicOff,
  MonitorUp,
  Send,
  Sparkles,
  Users,
  Video,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useLiveMeetingSession } from '../hooks/useLiveMeetingSession';
import { askCoco, BackendCitation, analyzeTranscript } from '../services/api';
import { CollaborativeWhiteboard } from './CollaborativeWhiteboard';
import { LiveSuggestionBanner } from './LiveSuggestionBanner';
import { LiveTranscriptPanel } from './LiveTranscriptPanel';
import { MeetingRecorder } from './MeetingRecorder';

type JoinDetails = { token: string; serverUrl: string; roomName: string; displayName: string };

// With no explicit deployment URL, use the same machine that served Vite.
// This makes a LAN URL such as http://192.168.1.20:5173 call that host's API
// instead of incorrectly calling localhost on the guest's computer.
// Vite can be opened on IPv6 loopback while FastAPI is bound to IPv4 during
// local development, so route that one local-only case to the IPv4 loopback.
const frontendHost = window.location.hostname;
const apiHost = frontendHost === '::1' || frontendHost === '[::1]'
  ? '127.0.0.1'
  : frontendHost;
const apiBaseUrl = import.meta.env.VITE_API_URL
  ?? `${window.location.protocol}//${apiHost}:8000`;

async function getJoinDetails(roomName: string, displayName: string): Promise<JoinDetails> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/livekit/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_name: roomName, display_name: displayName }),
    });
  } catch {
    throw new Error(`Cannot reach the meeting server at ${apiBaseUrl}. Start FastAPI on port 8000, then try again.`);
  }

  let payload: { token?: string; server_url?: string; detail?: string } = {};
  try {
    payload = await response.json() as typeof payload;
  } catch {
    if (!response.ok) throw new Error(`Meeting server returned ${response.status}. Check that FastAPI is running correctly.`);
  }
  if (!response.ok || !payload.token || !payload.server_url) {
    throw new Error(payload.detail ?? 'Unable to create a secure room token.');
  }
  return { token: payload.token, serverUrl: payload.server_url, roomName, displayName };
}

const ToggleButton: React.FC<{
  label: string;
  enabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  inactiveIcon: React.ReactNode;
}> = ({ label, enabled, onClick, icon, inactiveIcon }) => (
  <button onClick={onClick} className={`flex min-w-20 flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${enabled ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'}`}>
    {enabled ? icon : inactiveIcon}<span>{label}</span>
  </button>
);

type CocoMessage = { role: 'user' | 'coco'; text: string; citations?: BackendCitation[] };

// Reuses the same POST /query backend CocoChatView.tsx calls — grounded in
// past meetings/decisions/action items, not a general chatbot — so
// participants can pull up prior context without leaving the call.
const CocoPanel: React.FC = () => {
  const [messages, setMessages] = useState<CocoMessage[]>([]);
  const [input, setInput] = useState('');
  const [isAsking, setIsAsking] = useState(false);

  const send = async () => {
    const query = input.trim();
    if (!query || isAsking) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: query }]);
    setIsAsking(true);
    try {
      const result = await askCoco(query);
      setMessages((prev) => [...prev, { role: 'coco', text: result.answer, citations: result.citations }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'coco', text: "I couldn't reach the Ask Coco backend just now." }]);
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-violet-700">
        <Sparkles className="h-4 w-4" /> Ask Coco
        <span className="font-normal text-violet-500">— grounded in past meetings</span>
      </div>

      <div className="max-h-64 overflow-y-auto space-y-2.5 pr-1">
        {messages.length === 0 && (
          <p className="text-xs text-slate-400">
            Ask about past decisions, action items, or contradictions without leaving the call — e.g. "what did we decide about the vendor?"
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div
              className={`inline-block max-w-[92%] rounded-xl px-3 py-2 text-xs whitespace-pre-wrap text-left ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-700'
              }`}
            >
              {m.text}
            </div>
            {m.citations && m.citations.length > 0 && (
              <div className="mt-1 space-y-0.5 text-left">
                {m.citations.slice(0, 3).map((c, ci) => (
                  <div key={ci} className="text-[10px] text-slate-400">
                    📎 {c.filename}
                    {c.speaker ? ` — ${c.speaker}` : ''}: "{c.excerpt.length > 70 ? `${c.excerpt.slice(0, 70)}…` : c.excerpt}"
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {isAsking && <div className="text-xs text-slate-400 animate-pulse">Coco is thinking…</div>}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
          placeholder="Ask a question…"
          className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-600"
        />
        <button
          onClick={() => void send()}
          disabled={isAsking || !input.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" /> Ask
        </button>
      </div>
    </section>
  );
};

const RoomContent: React.FC<{ roomName: string; displayName: string; token: string; onLeave: () => void }> = ({ roomName, displayName, token, onLeave }) => {
  const { currentUser, meetings, addLiveMeetingIntelligence } = useApp();
  const participants = useParticipants();
  const cameraTracks = useTracks([Track.Source.Camera]);
  const screenTracks = useTracks([Track.Source.ScreenShare]);
  const { localParticipant, isCameraEnabled, isMicrophoneEnabled, isScreenShareEnabled } = useLocalParticipant();
  const [mediaError, setMediaError] = useState('');
  const [showCoco, setShowCoco] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [isScreenEnlarged, setIsScreenEnlarged] = useState(false);
  const liveSession = useLiveMeetingSession(roomName, token);

  const toggle = async (kind: 'microphone' | 'camera' | 'screen') => {
    try {
      setMediaError('');
      if (kind === 'microphone') await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
      if (kind === 'camera') await localParticipant.setCameraEnabled(!isCameraEnabled);
      if (kind === 'screen') await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : 'Permission was not granted for this device.');
    }
  };

  const handleLeaveMeeting = () => {
    // 1. Auto export whiteboard PDF only if whiteboard was drawn on
    let exportedPdfName: string | undefined = undefined;
    try {
      const exportBtn = document.querySelector('[title="Export Whiteboard PDF Pages"]') as HTMLButtonElement;
      if (exportBtn) {
        exportBtn.click();
        exportedPdfName = `Whiteboard_${roomName.replace(/[^a-zA-Z0-9_-]/g, '-')}.pdf`;
      }
    } catch {
      // whiteboard empty or unavailable
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 2. Find matching scheduled meeting by roomCode (e.g. T9AHS -> "Testing 1")
    const scheduledMeeting = meetings.find(
      (m) =>
        (m.roomCode && m.roomCode.toLowerCase() === roomName.toLowerCase()) ||
        (m.id && m.id.toLowerCase() === roomName.toLowerCase())
    );

    const meetingId = scheduledMeeting ? scheduledMeeting.id : `mtg-live-${Date.now()}`;
    const meetingTitle = scheduledMeeting ? scheduledMeeting.title : `Live Room: ${roomName} — ${dateStr}`;
    const meetingProject = scheduledMeeting ? scheduledMeeting.project : 'Live Intelligence';
    const meetingDepartment = scheduledMeeting ? scheduledMeeting.department : 'Engineering & AI';

    // 3. Accurate participant list (ONLY real attendees, no unrelated dummy names)
    const joinedNames = participants.map((p) => p.name || p.identity).filter(Boolean);
    const transcriptSpeakers = liveSession.transcript.map((t) => t.speaker).filter(Boolean);
    const scheduledAttendees = scheduledMeeting ? scheduledMeeting.participants : [];
    const attendeeNames = Array.from(
      new Set([
        currentUser.name,
        ...joinedNames,
        ...transcriptSpeakers,
        ...scheduledAttendees
      ])
    ).filter(Boolean);

    // 4. Build transcript segments from actual live recorded dialogue, replacing partial fragments
    const cleanLines: typeof liveSession.transcript = [];
    liveSession.transcript.forEach((line) => {
      const lineText = line.text.trim().toLowerCase();
      // Drop any partial chunk if a longer complete processed sentence contains it
      const hasSuperiorLine = liveSession.transcript.some(
        (other) =>
          other !== line &&
          other.speaker === line.speaker &&
          other.text.toLowerCase().includes(lineText) &&
          other.text.length > line.text.length
      );
      if (!hasSuperiorLine) {
        cleanLines.push(line);
      }
    });

    const finalTranscript = cleanLines.map((line, idx) => ({
      id: `trans-${Date.now()}-${idx}`,
      speaker: line.speaker,
      time: line.timestamp,
      text: line.text,
      sentiment: 'neutral' as const
    }));

    const initialSummary = `Live meeting session between ${attendeeNames.join(' and ')}.`;

    // 5. Initial knowledge graph containing Person, Meeting & Project nodes
    const initialGraphNodes: any[] = [
      ...attendeeNames.map((name) => ({
        id: `person:${name}`,
        name,
        type: 'Person',
        role: name === currentUser.name ? 'Organizer' : 'Participant',
        meetingId
      })),
      { id: `meeting:${meetingId}`, name: meetingTitle, type: 'Meeting', meetingId },
      { id: `project:${meetingProject}`, name: meetingProject, type: 'Project', meetingId }
    ];

    const initialGraphLinks: any[] = [
      ...attendeeNames.map((name) => ({
        source: `person:${name}`,
        target: `meeting:${meetingId}`,
        label: 'PARTICIPATED_IN',
        meetingId
      })),
      {
        source: `meeting:${meetingId}`,
        target: `project:${meetingProject}`,
        label: 'RELATES_TO',
        meetingId
      }
    ];

    const initialMeetingRecord: any = {
      id: meetingId,
      title: meetingTitle,
      project: meetingProject,
      dateTime: scheduledMeeting ? scheduledMeeting.dateTime : `${dateStr} ${timeStr}`,
      timeRange: scheduledMeeting?.timeRange || `${timeStr} (Live)`,
      department: meetingDepartment,
      participants: attendeeNames,
      status: 'Completed',
      duration: scheduledMeeting?.duration || '15 mins',
      summary: initialSummary,
      decisions: [],
      actionItems: [],
      roomCode: roomName,
      whiteboardPdfName: exportedPdfName,
      transcript: finalTranscript,
      graphData: {
        nodes: initialGraphNodes,
        links: initialGraphLinks
      }
    };

    // 6. Instantly save meeting record and exit room immediately (Zero lag!)
    addLiveMeetingIntelligence(initialMeetingRecord);
    onLeave();

    // 7. Background AI Intelligence Synthesis via Gemini / Agnes AI (Seamlessly enriches meeting intelligence)
    if (finalTranscript.length > 0) {
      analyzeTranscript(
        finalTranscript.map((t) => ({ speaker: t.speaker, text: t.text, timestamp: t.time })),
        attendeeNames
      ).then((analysis) => {
        if (!analysis) return;

        let synthesizedDecisions: any[] = [];
        let synthesizedActions: any[] = [];

        if (analysis.decisions && analysis.decisions.length > 0) {
          synthesizedDecisions = analysis.decisions.map((d: any, i: number) => ({
            id: `dec-${Date.now()}-${i}`,
            title: d.title || d.text || 'Decision reached in discussion',
            rationale: d.reason || `Agreed during discussion by ${d.speaker || 'team'}.`,
            evidence: d.evidence || `${d.speaker || 'Speaker'}: "${d.title || d.text || ''}"`,
            confidenceScore: d.confidence === 'firm_commitment' ? 98 : 94,
            category: meetingProject,
            impactLevel: 'Medium'
          }));
        }

        if (analysis.action_items && analysis.action_items.length > 0) {
          synthesizedActions = analysis.action_items.map((a: any, i: number) => ({
            id: `act-${Date.now()}-${i}`,
            task: a.task,
            assignee: a.assignee || currentUser.name,
            dueDate: a.deadline || 'Upcoming',
            status: 'To Do',
            priority: (a.priority === 'high' ? 'High' : 'Medium') as any,
            meetingTitle
          }));
        }

        const enrichedGraphNodes = [
          ...initialGraphNodes,
          ...synthesizedDecisions.map((d: any) => ({
            id: `decision:${d.id}`,
            name: d.title,
            type: 'Decision',
            meetingId
          })),
          ...synthesizedActions.map((a: any) => ({
            id: `action:${a.id}`,
            name: a.task,
            type: 'ActionItem',
            meetingId
          }))
        ];

        const enrichedGraphLinks = [
          ...initialGraphLinks,
          ...synthesizedDecisions.map((d: any) => ({
            source: `decision:${d.id}`,
            target: `meeting:${meetingId}`,
            label: 'MADE_IN',
            meetingId
          })),
          ...synthesizedActions.map((a: any) => ({
            source: `action:${a.id}`,
            target: `meeting:${meetingId}`,
            label: 'MADE_IN',
            meetingId
          })),
          ...synthesizedActions.map((a: any) => ({
            source: `action:${a.id}`,
            target: `person:${a.assignee}`,
            label: 'ASSIGNED_TO',
            meetingId
          }))
        ];

        addLiveMeetingIntelligence({
          ...initialMeetingRecord,
          summary: analysis.summary || initialMeetingRecord.summary,
          decisions: synthesizedDecisions,
          actionItems: synthesizedActions,
          graphData: {
            nodes: enrichedGraphNodes,
            links: enrichedGraphLinks
          }
        });
      }).catch((err) => {
        console.warn('Background AI transcript analysis:', err);
      });
    }
  };

  return (
    <div data-meeting-recording-area className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
          </div>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 font-sans">Room Code: {roomName}</h1>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(roomName);
                alert(`Room Code "${roomName}" copied to clipboard! Share this exact code with teammates to join this session.`);
              }}
              className="px-2.5 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold rounded-lg border border-blue-200 transition-colors cursor-pointer"
            >
              Copy Room Code
            </button>
          </div>
        </div>
        <span className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"><Users className="h-4 w-4 text-indigo-600" />{participants.length} participant{participants.length === 1 ? '' : 's'}</span>
      </div>

      {mediaError && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{mediaError}</div>}

      <LiveSuggestionBanner suggestions={liveSession.suggestions} onDismiss={liveSession.dismissSuggestion} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_270px]">
        <div className="space-y-4">
          {screenTracks.length > 0 && (
            <section className="relative overflow-hidden rounded-2xl border border-blue-200 bg-slate-950 shadow-sm group">
              <div className="flex items-center justify-between bg-blue-600 px-3 py-2 text-xs font-bold text-white">
                <div className="flex items-center gap-2">
                  <MonitorUp className="h-4 w-4" />
                  <span>Screen Share ({screenTracks[0].participant.name || 'Participant'})</span>
                </div>
              </div>

              <div className="relative w-full flex items-center justify-center">
                <VideoTrack trackRef={screenTracks[0]} className="max-h-[52vh] w-full object-contain" />

                {/* Bottom Right Corner Enlarge / Fullscreen Button */}
                <button
                  type="button"
                  onClick={() => setIsScreenEnlarged(!isScreenEnlarged)}
                  title={isScreenEnlarged ? "Exit Fullscreen" : "Enlarge Screen Share"}
                  className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-xl bg-slate-900/90 hover:bg-blue-600 text-white px-3 py-2 text-xs font-bold shadow-lg backdrop-blur-md transition-all hover:scale-105 border border-white/20 cursor-pointer"
                >
                  <Maximize2 className="h-4 w-4 text-blue-400 group-hover:text-white" />
                  <span>Enlarge Screen</span>
                </button>
              </div>
            </section>
          )}

          {/* Fullscreen Overlay when Enlarged */}
          {isScreenEnlarged && screenTracks.length > 0 && (
            <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 p-4 sm:p-6 animate-fade-in backdrop-blur-md">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-white shrink-0">
                <div className="flex items-center gap-2 text-sm font-bold font-sans">
                  <MonitorUp className="h-5 w-5 text-blue-400" />
                  <span>Screen Share — Fullscreen View ({roomName})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsScreenEnlarged(false)}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
                >
                  <Minimize2 className="h-4 w-4" />
                  <span>Exit Fullscreen</span>
                </button>
              </div>
              <div className="flex-1 flex items-center justify-center overflow-hidden p-2 relative">
                <VideoTrack trackRef={screenTracks[0]} className="max-h-[88vh] max-w-full rounded-2xl object-contain shadow-2xl" />

                <button
                  type="button"
                  onClick={() => setIsScreenEnlarged(false)}
                  className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 text-xs font-bold shadow-xl transition-all hover:scale-105 border border-white/20 cursor-pointer"
                >
                  <Minimize2 className="h-4 w-4" />
                  <span>Minimize</span>
                </button>
              </div>
            </div>
          )}
          <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {cameraTracks.length > 0 ? cameraTracks.map((track) => (
                <div key={`${track.participant.identity}-${track.publication.trackSid}`} className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
                  <VideoTrack trackRef={track} className="h-full w-full object-cover" />
                  <span className="absolute bottom-2 left-2 rounded-md bg-slate-950/70 px-2 py-1 text-xs font-semibold text-white">{track.participant.name || track.participant.identity}</span>
                </div>
              )) : (
                <div className="col-span-full grid min-h-52 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">Turn on your camera to start the video grid.</div>
              )}
            </div>
          </section>
          <CollaborativeWhiteboard roomName={roomName} />
          {showCoco && <CocoPanel />}
          {showTranscript && <LiveTranscriptPanel transcript={liveSession.transcript} interimLine={liveSession.interimLine} error={liveSession.captionsError || liveSession.connectionError} />}
        </div>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800"><Users className="h-4 w-4 text-blue-600" />Participants</h2>
          <ul className="space-y-2">
            {participants.map((participant) => (
              <li key={participant.identity} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                <div className="min-w-0"><p className="truncate text-xs font-bold text-slate-700">{participant.name || participant.identity}</p><p className="text-[10px] text-slate-400">{participant.isSpeaking ? 'Speaking…' : 'In meeting'}</p></div>
                <div className="flex items-center gap-1.5">{participant.isSpeaking && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />}{participant.isMicrophoneEnabled ? <Mic className="h-3.5 w-3.5 text-slate-500" /> : <MicOff className="h-3.5 w-3.5 text-rose-500" />}{participant.isCameraEnabled ? <Camera className="h-3.5 w-3.5 text-slate-500" /> : <CameraOff className="h-3.5 w-3.5 text-rose-500" />}</div>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <div className="sticky bottom-3 z-20 flex flex-wrap justify-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur">
        <ToggleButton label="Mic" enabled={isMicrophoneEnabled} onClick={() => void toggle('microphone')} icon={<Mic className="h-5 w-5" />} inactiveIcon={<MicOff className="h-5 w-5" />} />
        <ToggleButton label="Camera" enabled={isCameraEnabled} onClick={() => void toggle('camera')} icon={<Camera className="h-5 w-5" />} inactiveIcon={<CameraOff className="h-5 w-5" />} />
        <button
          onClick={() => setShowCoco((v) => !v)}
          className={`flex min-w-20 flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
            showCoco ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Sparkles className="h-5 w-5" /><span>Coco</span>
        </button>
        <button
          onClick={() => setShowTranscript((prev) => !prev)}
          className={`flex min-w-20 flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
            showTranscript ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Captions className="h-5 w-5" /><span>Transcript</span>
        </button>
        <ToggleButton label="Share" enabled={isScreenShareEnabled} onClick={() => void toggle('screen')} icon={<MonitorUp className="h-5 w-5" />} inactiveIcon={<MonitorUp className="h-5 w-5" />} />
        <MeetingRecorder roomName={roomName} onError={setMediaError} />
        <button onClick={handleLeaveMeeting} className="flex min-w-20 flex-col items-center gap-1 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"><LogOut className="h-5 w-5" /><span>Leave</span></button>
      </div>


    </div>
  );
};

export const MeetingRoomView: React.FC = () => {
  const { currentUser, pendingJoinRoomCode, setPendingJoinRoomCode } = useApp();
  const [roomName, setRoomName] = useState(pendingJoinRoomCode || '');
  const [displayName, setDisplayName] = useState(currentUser.name);
  const [joinDetails, setJoinDetails] = useState<JoinDetails | null>(null);
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const joinRoom = async (event?: React.FormEvent, customRoom?: string) => {
    if (event) event.preventDefault();
    const targetRoom = (customRoom || roomName).trim();
    if (!targetRoom) return;

    setIsJoining(true);
    setError('');
    try {
      setJoinDetails(await getJoinDetails(targetRoom, displayName.trim()));
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : 'Unable to join meeting.');
    } finally {
      setIsJoining(false);
    }
  };

  // Auto-join when directed from Dashboard "Enter Room" button
  useEffect(() => {
    if (pendingJoinRoomCode) {
      const code = pendingJoinRoomCode;
      setRoomName(code);
      setPendingJoinRoomCode(null);
      void joinRoom(undefined, code);
    }
  }, [pendingJoinRoomCode]);

  if (joinDetails) {
    return <LiveKitRoom token={joinDetails.token} serverUrl={joinDetails.serverUrl} connect audio={false} video={false} onError={(roomError) => setError(roomError.message)}><RoomAudioRenderer /><RoomContent roomName={joinDetails.roomName} displayName={joinDetails.displayName} token={joinDetails.token} onLeave={() => { setJoinDetails(null); setError(''); }} /></LiveKitRoom>;
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-2xl items-center p-4 sm:p-6">
      <form onSubmit={joinRoom} className="w-full rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl dark:shadow-2xl dark:shadow-slate-950/50 sm:p-10 transition-all">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 dark:bg-blue-600 text-white shadow-md shadow-blue-600/30">
          <Video className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white font-sans">
          Join a Live Meeting Room
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Enter a <strong className="text-slate-700 dark:text-slate-200">Meeting Room ID</strong> to join or create a session.
        </p>

        {error && (
          <div className="mt-5 flex gap-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-3 text-sm text-rose-700 dark:text-rose-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        
        <div className="mt-6 space-y-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Meeting Room ID
          </label>
          <input
            value={roomName}
            onChange={(event) => setRoomName(event.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
            required
            maxLength={80}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-blue-600 dark:focus:border-blue-500 font-mono font-bold placeholder-slate-400 dark:placeholder-slate-500 transition-colors shadow-2xs"
            placeholder="e.g. 1111"
          />
        </div>

        <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Your Display Name
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            maxLength={80}
            className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-blue-600 dark:focus:border-blue-500 font-semibold transition-colors shadow-2xs"
          />
        </label>

        <button
          disabled={isJoining || !roomName || !displayName}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 dark:bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 dark:hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer shadow-md shadow-blue-600/20 dark:shadow-blue-900/40 transition-all font-sans"
        >
          {isJoining ? 'Joining…' : 'Join Meeting'}
        </button>
      </form>
    </div>
  );
};
