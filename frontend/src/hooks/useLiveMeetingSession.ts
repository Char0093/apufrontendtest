import { useLocalParticipant, useRoomContext, useTracks } from '@livekit/components-react';
import { RoomEvent, Track } from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type CaptionLine = { id: string; speaker: string; text: string; timestamp: string };
export type LiveSuggestion = {
  id: string;
  message: string;
  severity: string;
  judge: 'llm' | 'keyword_fallback';
  contradictsMeetingId?: string;
  contradictsDecisionText?: string;
};

export type LiveMeetingSessionState = {
  connectionError: string;
  captionsEnabled: boolean;
  captionsError: string;
  toggleCaptions: () => void;
  transcript: CaptionLine[];
  suggestions: LiveSuggestion[];
  dismissSuggestion: (id: string) => void;
};

const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined)
  ?? `${window.location.protocol}//${window.location.hostname}:8000`;
const wsBaseUrl = apiBaseUrl.replace(/^http/, 'ws');

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const preferredMimeType = () => [
  'audio/webm;codecs=opus',
  'audio/webm',
].find((type) => MediaRecorder.isTypeSupported(type)) ?? '';

let localIdCounter = 0;
const nextLocalId = () => `local-${Date.now()}-${localIdCounter++}`;

export function useLiveMeetingSession(roomName: string, token: string): LiveMeetingSessionState {
  const room = useRoomContext();
  const { isMicrophoneEnabled } = useLocalParticipant();
  const microphones = useTracks([Track.Source.Microphone], { onlySubscribed: true });

  const [connectionError, setConnectionError] = useState('');
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captionsError, setCaptionsError] = useState('');
  const [transcript, setTranscript] = useState<CaptionLine[]>([]);
  const [suggestions, setSuggestions] = useState<LiveSuggestion[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const publish = useCallback((topic: 'live-transcript' | 'live-suggestion', payload: unknown) => {
    void room.localParticipant.publishData(encoder.encode(JSON.stringify(payload)), { reliable: true, topic });
  }, [room]);

  // Session WS: opens once on room join, independent of the caption toggle.
  useEffect(() => {
    if (!token) return;
    // React StrictMode deliberately mounts every effect twice in dev
    // (mount -> cleanup -> mount again) to surface missing cleanup bugs.
    // The first WebSocket instance gets closed by that cleanup before it
    // ever opens, firing onerror/onclose for a connection that was never
    // really broken. Clearing any stale error here, at the start of each
    // new attempt, means a torn-down previous instance can never leave a
    // permanent error banner in front of a second instance that connects
    // fine — this isn't a StrictMode-only concern, the same reasoning
    // applies to any future reconnect attempt too.
    setConnectionError('');
    const ws = new WebSocket(`${wsBaseUrl}/live-meeting/${roomName}/session`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionError('');
      ws.send(JSON.stringify({ type: 'auth', token }));
    };

    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data as string);
      if (payload.type === 'caption') {
        const line: CaptionLine = { id: nextLocalId(), speaker: payload.speaker, text: payload.text, timestamp: payload.timestamp };
        setTranscript((prev) => [...prev, line]);
        publish('live-transcript', line);
      } else if (payload.type === 'contradiction_suggestion') {
        const suggestion: LiveSuggestion = {
          id: nextLocalId(),
          message: payload.message,
          severity: payload.severity,
          judge: payload.judge,
          contradictsMeetingId: payload.contradicts_meeting_id,
          contradictsDecisionText: payload.contradicts_decision_text,
        };
        setSuggestions((prev) => [...prev, suggestion]);
        publish('live-suggestion', suggestion);
      } else if (payload.type === 'captions_error') {
        setCaptionsError(payload.message);
        setCaptionsEnabled(false);
      }
    };

    ws.onerror = () => setConnectionError('Could not reach the live meeting service.');
    ws.onclose = (event) => {
      if (event.code >= 4000) setConnectionError(event.reason || 'The live meeting connection was closed.');
    };

    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, token]);

  // History hydration for a late joiner — the LiveKit data channel has no
  // replay of its own, so this is a one-time backend read on mount.
  useEffect(() => {
    if (!token) return;
    fetch(`${apiBaseUrl}/live-meeting/${roomName}/transcript-so-far`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : { segments: [] }))
      .then((data: { segments: Array<{ speaker: string; text: string; timestamp: string }> }) => {
        setTranscript((prev) => [
          ...data.segments.map((s) => ({ id: nextLocalId(), speaker: s.speaker, text: s.text, timestamp: s.timestamp })),
          ...prev,
        ]);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, token]);

  // Receiving other participants' captions/suggestions via the same
  // LiveKit data-channel pattern CollaborativeWhiteboard.tsx already uses.
  useEffect(() => {
    const handleMessage = (data: Uint8Array, _participant?: unknown, _kind?: unknown, topic?: string) => {
      if (topic !== 'live-transcript' && topic !== 'live-suggestion') return;
      const payload = JSON.parse(decoder.decode(data));
      if (topic === 'live-transcript') {
        setTranscript((prev) => (prev.some((line) => line.id === payload.id) ? prev : [...prev, payload]));
      } else {
        setSuggestions((prev) => (prev.some((s) => s.id === payload.id) ? prev : [...prev, payload]));
      }
    };
    room.on(RoomEvent.DataReceived, handleMessage);
    return () => { room.off(RoomEvent.DataReceived, handleMessage); };
  }, [room]);

  const stopCapture = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }, []);

  const toggleCaptions = useCallback(() => {
    setCaptionsEnabled((enabled) => {
      const next = !enabled;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return enabled;

      if (next) {
        setCaptionsError('');
        ws.send(JSON.stringify({ type: 'captions_on' }));
      } else {
        ws.send(JSON.stringify({ type: 'captions_off' }));
        stopCapture();
      }
      return next;
    });
  }, [stopCapture]);

  // useTracks() emits a brand-new array on essentially any room-wide track
  // event (any participant's mic/camera changing state), not just this
  // one. Depending on that array directly below would tear down and
  // recreate the MediaRecorder on every such event — and since only a
  // MediaRecorder's *first* chunk carries valid WebM container headers,
  // every restart effectively truncates capture back down to one word.
  // sid is a stable primitive that only changes when the actual track
  // being captured changes (e.g. a device switch), so it's what the effect
  // below depends on instead of the array.
  const localMicTrack = microphones[0]?.publication.track;
  const micTrackSid = localMicTrack?.sid;

  // Must respect LiveKit mute state: stop sending audio (and flip captions
  // off) the moment the mic is muted, not just stop what other
  // participants hear.
  useEffect(() => {
    if (!captionsEnabled) return;
    if (!isMicrophoneEnabled) {
      toggleCaptions();
      return;
    }

    const track = localMicTrack?.mediaStreamTrack;
    const ws = wsRef.current;
    if (!track || !ws) return;

    const mimeType = preferredMimeType();
    const recorder = new MediaRecorder(new MediaStream([track]), mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) void event.data.arrayBuffer().then((buf) => ws.send(buf));
    };
    recorder.start(250);
    recorderRef.current = recorder;

    return () => recorder.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captionsEnabled, isMicrophoneEnabled, micTrackSid]);

  const dismissSuggestion = useCallback((id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { connectionError, captionsEnabled, captionsError, toggleCaptions, transcript, suggestions, dismissSuggestion };
}
