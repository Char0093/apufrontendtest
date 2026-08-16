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
} from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useLiveMeetingSession } from '../hooks/useLiveMeetingSession';
import { askCoco, BackendCitation } from '../services/api';
import { CollaborativeWhiteboard } from './CollaborativeWhiteboard';
import { LiveSuggestionBanner } from './LiveSuggestionBanner';
import { LiveTranscriptPanel } from './LiveTranscriptPanel';
import { MeetingRecorder } from './MeetingRecorder';

type JoinDetails = { token: string; serverUrl: string; roomName: string; displayName: string };

// With no explicit deployment URL, use the same machine that served Vite.
// This makes a LAN URL such as http://192.168.1.20:5173 call that host's API
// instead of incorrectly calling localhost on the guest's computer.
const apiBaseUrl = import.meta.env.VITE_API_URL
  ?? `${window.location.protocol}//${window.location.hostname}:8000`;

async function getJoinDetails(roomName: string, displayName: string): Promise<JoinDetails> {
  const response = await fetch(`${apiBaseUrl}/livekit/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_name: roomName, display_name: displayName }),
  });
  const payload = await response.json() as { token?: string; server_url?: string; detail?: string };
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
                  ? 'bg-indigo-600 text-white'
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
          className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-indigo-600"
        />
        <button
          onClick={() => void send()}
          disabled={isAsking || !input.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" /> Ask
        </button>
      </div>
    </section>
  );
};

const RoomContent: React.FC<{ roomName: string; displayName: string; token: string; onLeave: () => void }> = ({ roomName, displayName, token, onLeave }) => {
  const participants = useParticipants();
  const cameraTracks = useTracks([Track.Source.Camera]);
  const screenTracks = useTracks([Track.Source.ScreenShare]);
  const { localParticipant, isCameraEnabled, isMicrophoneEnabled, isScreenShareEnabled } = useLocalParticipant();
  const [mediaError, setMediaError] = useState('');
  const [showCoco, setShowCoco] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
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

  return (
    <div data-meeting-recording-area className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" /><span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Live</span></div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">{roomName}</h1>
          <p className="text-sm text-slate-500">Joined as {displayName}</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"><Users className="h-4 w-4 text-indigo-600" />{participants.length} participant{participants.length === 1 ? '' : 's'}</span>
      </div>

      {mediaError && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{mediaError}</div>}

      <LiveSuggestionBanner suggestions={liveSession.suggestions} onDismiss={liveSession.dismissSuggestion} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_270px]">
        <div className="space-y-4">
          {screenTracks.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-slate-950 shadow-sm">
              <div className="flex items-center gap-2 bg-indigo-600 px-3 py-2 text-xs font-bold text-white"><MonitorUp className="h-4 w-4" />Screen share</div>
              <VideoTrack trackRef={screenTracks[0]} className="max-h-[52vh] w-full object-contain" />
            </section>
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
          <CollaborativeWhiteboard />
          {showCoco && <CocoPanel />}
          {showTranscript && <LiveTranscriptPanel transcript={liveSession.transcript} error={liveSession.captionsError || liveSession.connectionError} />}
        </div>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800"><Users className="h-4 w-4 text-indigo-600" />Participants</h2>
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
          onClick={() => { setShowTranscript((v) => !v); liveSession.toggleCaptions(); }}
          className={`flex min-w-20 flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
            liveSession.captionsEnabled ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Captions className="h-5 w-5" /><span>Transcript</span>
        </button>
        <ToggleButton label="Share" enabled={isScreenShareEnabled} onClick={() => void toggle('screen')} icon={<MonitorUp className="h-5 w-5" />} inactiveIcon={<MonitorUp className="h-5 w-5" />} />
        <MeetingRecorder roomName={roomName} onError={setMediaError} />
        <button onClick={onLeave} className="flex min-w-20 flex-col items-center gap-1 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700"><LogOut className="h-5 w-5" /><span>Leave</span></button>
      </div>
    </div>
  );
};

export const MeetingRoomView: React.FC = () => {
  const { currentUser } = useApp();
  const [roomName, setRoomName] = useState('team-sync');
  const [displayName, setDisplayName] = useState(currentUser.name);
  const [joinDetails, setJoinDetails] = useState<JoinDetails | null>(null);
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const joinRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsJoining(true); setError('');
    try { setJoinDetails(await getJoinDetails(roomName.trim(), displayName.trim())); }
    catch (joinError) { setError(joinError instanceof Error ? joinError.message : 'Unable to join meeting.'); }
    finally { setIsJoining(false); }
  };

  if (joinDetails) {
    return <LiveKitRoom token={joinDetails.token} serverUrl={joinDetails.serverUrl} connect audio video onError={(roomError) => setError(roomError.message)}><RoomAudioRenderer /><RoomContent roomName={joinDetails.roomName} displayName={joinDetails.displayName} token={joinDetails.token} onLeave={() => { setJoinDetails(null); setError(''); }} /></LiveKitRoom>;
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-2xl items-center p-4 sm:p-6">
      <form onSubmit={joinRoom} className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white"><Video className="h-6 w-6" /></div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Join a live meeting</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">Create a room by entering a new room ID, or enter the ID shared by your team. Your name is shown to every participant.</p>
        {error && <div className="mt-5 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        <label className="mt-6 block text-xs font-bold uppercase tracking-wider text-slate-500">Room ID<input value={roomName} onChange={(event) => setRoomName(event.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))} required maxLength={80} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-600" placeholder="e.g. q3-planning" /></label>
        <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-slate-500">Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={80} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-600" /></label>
        <button disabled={isJoining || !roomName || !displayName} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">{isJoining ? 'Creating secure access…' : 'Join meeting'}</button>
      </form>
    </div>
  );
};
