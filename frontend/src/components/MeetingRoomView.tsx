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
  const participants = useParticipants();
  const cameraTracks = useTracks([Track.Source.Camera]);
  const screenTracks = useTracks([Track.Source.ScreenShare]);
  const { localParticipant, isCameraEnabled, isMicrophoneEnabled, isScreenShareEnabled } = useLocalParticipant();
  const [mediaError, setMediaError] = useState('');
  const [showCoco, setShowCoco] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [isScreenEnlarged, setIsScreenEnlarged] = useState(false);
  const [isProcessingPipeline, setIsProcessingPipeline] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(0);
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
    setIsProcessingPipeline(true);
    setPipelineStep(1);

    const steps = [
      'Extracting audio (16kHz mono WAV)...',
      'Running PyAnnote 3.1 speaker diarization timeline...',
      'Deepgram & Whisper timestamped transcription...',
      'Gemini Vision reading speaker nameplates...',
      'Gemini 2.5 Flash extracting decisions, actions & flags...',
      'Indexing results into Corporate Brain & saving whiteboard PDF...'
    ];

    let current = 1;
    const interval = setInterval(() => {
      current += 1;
      if (current <= steps.length) {
        setPipelineStep(current);
      } else {
        clearInterval(interval);
        setTimeout(() => {
          setIsProcessingPipeline(false);
          onLeave();
        }, 600);
      }
    }, 600);
  };

  const pipelineStages = [
    { title: 'Audio Extraction', desc: 'ffmpeg: video -> 16kHz mono WAV' },
    { title: 'Speaker Diarization', desc: 'PyAnnote 3.1 speaker timeline alignment' },
    { title: 'Deepgram & Whisper ASR', desc: 'Timestamped transcript generation' },
    { title: 'Gemini Vision Nameplates', desc: 'Extracting video frame nameplates' },
    { title: 'Gemini Flash AI Analysis', desc: 'Extracting decisions, rationale & action items' },
    { title: 'Knowledge Graph Ingestion', desc: 'Saving meeting intelligence & whiteboard PDF' }
  ];

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
          {showTranscript && <LiveTranscriptPanel transcript={liveSession.transcript} error={liveSession.captionsError || liveSession.connectionError} />}
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
          onClick={() => { setShowTranscript((v) => !v); liveSession.toggleCaptions(); }}
          className={`flex min-w-20 flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
            liveSession.captionsEnabled ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Captions className="h-5 w-5" /><span>Transcript</span>
        </button>
        <ToggleButton label="Share" enabled={isScreenShareEnabled} onClick={() => void toggle('screen')} icon={<MonitorUp className="h-5 w-5" />} inactiveIcon={<MonitorUp className="h-5 w-5" />} />
        <MeetingRecorder roomName={roomName} onError={setMediaError} />
        <button onClick={handleLeaveMeeting} className="flex min-w-20 flex-col items-center gap-1 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"><LogOut className="h-5 w-5" /><span>Leave</span></button>
      </div>

      {/* MEETINGS/pipeline.py Auto Intelligence Extraction Modal */}
      {isProcessingPipeline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-fade-in font-sans">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-6">
            <div className="flex items-center space-x-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="p-2.5 bg-blue-50 dark:bg-blue-950/80 rounded-2xl text-blue-600 dark:text-blue-400">
                <Sparkles className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white font-sans">
                  Meeting Intelligence Pipeline Extraction
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  Simulating MEETINGS/pipeline.py workflow
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {pipelineStages.map((stage, idx) => {
                const stageNum = idx + 1;
                const isDone = pipelineStep > stageNum;
                const isCurrent = pipelineStep === stageNum;
                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between ${
                      isDone
                        ? 'bg-emerald-50/60 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
                        : isCurrent
                        ? 'bg-blue-50/80 dark:bg-blue-950/60 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800 text-slate-400 opacity-60'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-mono ${
                        isDone
                          ? 'bg-emerald-600 text-white'
                          : isCurrent
                          ? 'bg-blue-600 text-white animate-bounce'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                      }`}>
                        {stageNum}
                      </div>
                      <div>
                        <div className="text-xs font-bold font-sans">{stage.title}</div>
                        <div className="text-[10px] opacity-80 font-mono">{stage.desc}</div>
                      </div>
                    </div>

                    {isDone && <span className="text-xs font-bold font-mono text-emerald-600">DONE</span>}
                    {isCurrent && <span className="text-xs font-bold font-mono text-blue-600 animate-pulse">RUNNING...</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const MeetingRoomView: React.FC = () => {
  const { currentUser } = useApp();
  const [roomName, setRoomName] = useState('');
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
