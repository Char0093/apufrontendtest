import { API_BASE } from '../services/api';
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
  interimLine: { speaker: string; text: string; timestamp: string } | null;
  suggestions: LiveSuggestion[];
  dismissSuggestion: (id: string) => void;
};

const apiBaseUrl = API_BASE;
const wsBaseUrl = apiBaseUrl.replace(/^http/, 'ws');

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const preferredMimeType = () => [
  'audio/webm;codecs=opus',
  'audio/webm',
].find((type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) ?? '';

let localIdCounter = 0;
const nextLocalId = () => `local-${Date.now()}-${localIdCounter++}`;

export function useLiveMeetingSession(roomName: string, token: string): LiveMeetingSessionState {
  const room = useRoomContext();
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();
  const microphones = useTracks([Track.Source.Microphone], { onlySubscribed: false });

  const [connectionError, setConnectionError] = useState('');
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [captionsError, setCaptionsError] = useState('');
  const [transcript, setTranscript] = useState<CaptionLine[]>([]);
  const [interimLine, setInterimLine] = useState<{ speaker: string; text: string; timestamp: string } | null>(null);
  const [suggestions, setSuggestions] = useState<LiveSuggestion[]>([]);

  const isMicrophoneEnabledRef = useRef(isMicrophoneEnabled);
  isMicrophoneEnabledRef.current = isMicrophoneEnabled;

  const localParticipantRef = useRef(localParticipant);
  localParticipantRef.current = localParticipant;

  const interimLineRef = useRef(interimLine);
  interimLineRef.current = interimLine;

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const restartTimerRef = useRef<any>(null);
  const interimFlushTimerRef = useRef<any>(null);

  const publish = useCallback((topic: 'live-transcript' | 'live-suggestion', payload: unknown) => {
    try {
      void room.localParticipant.publishData(encoder.encode(JSON.stringify(payload)), {
        reliable: true,
        topic,
      });
    } catch {
      // Room may not be connected yet.
    }
  }, [room]);

  // Helper to commit the current interim line into the transcript list
  const commitInterimLine = useCallback((customText?: string) => {
    const active = interimLineRef.current;
    const textToCommit = (customText || active?.text || '').trim();
    if (!textToCommit) return;

    const speakerName = active?.speaker || localParticipantRef.current.name || localParticipantRef.current.identity || 'Speaker';
    const timestamp = active?.timestamp || new Date().toTimeString().split(' ')[0];

    const line: CaptionLine = {
      id: nextLocalId(),
      speaker: speakerName,
      text: textToCommit,
      timestamp
    };

    setTranscript((prev) => {
      // Prevent exact duplicates
      if (prev.some((p) => p.text.toLowerCase() === textToCommit.toLowerCase())) return prev;
      return [...prev, line];
    });

    publish('live-transcript', line);
    setInterimLine(null);
  }, [publish]);

  // Main Live meeting websocket connection
  useEffect(() => {
    if (!roomName || !token) return;

    const ws = new WebSocket(`${wsBaseUrl}/live-meeting/${roomName}/session`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionError('');
      ws.send(JSON.stringify({ type: 'auth', token }));
      try {
        ws.send(JSON.stringify({ type: 'captions_on' }));
      } catch {
        // ignore
      }
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string);
        if (payload.type === 'caption') {
          // 1. Immediately dismiss real-time interim preview
          setInterimLine(null);
          if (interimFlushTimerRef.current) {
            clearTimeout(interimFlushTimerRef.current);
            interimFlushTimerRef.current = null;
          }

          const line: CaptionLine = {
            id: nextLocalId(),
            speaker: payload.speaker,
            text: payload.text,
            timestamp: payload.timestamp
          };
          
          // 2. Add processed whole sentence & replace recent partial speech from this speaker
          setTranscript((prev) => {
            const cleanIncoming = payload.text.trim().toLowerCase();
            const filtered = prev.filter((item) => {
              if (item.speaker !== payload.speaker) return true;
              const cleanOld = item.text.trim().toLowerCase();
              // If the old line was a partial sub-phrase of this new processed sentence, remove it!
              if (cleanIncoming.includes(cleanOld) && cleanOld.length < cleanIncoming.length) {
                return false;
              }
              return true;
            });
            return [...filtered, line];
          });
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
        }
      } catch (err) {
        console.error('Error handling ws message:', err);
      }
    };

    ws.onerror = () => setConnectionError('');
    ws.onclose = (event) => {
      if (event.code >= 4000) setConnectionError(event.reason || 'The live meeting connection was closed.');
    };

    return () => ws.close();
  }, [roomName, token, publish]);

  // History hydration for late joiner
  useEffect(() => {
    if (!token) return;
    fetch(`${apiBaseUrl}/live-meeting/${roomName}/transcript-so-far`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : { segments: [] }))
      .then((data: { segments: Array<{ speaker: string; text: string; timestamp: string }> }) => {
        if (data.segments && data.segments.length > 0) {
          setTranscript((prev) => [
            ...data.segments.map((s) => ({ id: nextLocalId(), speaker: s.speaker, text: s.text, timestamp: s.timestamp })),
            ...prev,
          ]);
        }
      })
      .catch(() => undefined);
  }, [roomName, token]);

  // Receiving other participants' captions/suggestions via LiveKit data-channel
  useEffect(() => {
    const handleMessage = (data: Uint8Array, _participant?: unknown, _kind?: unknown, topic?: string) => {
      if (topic !== 'live-transcript' && topic !== 'live-suggestion') return;
      try {
        const payload = JSON.parse(decoder.decode(data));
        if (topic === 'live-transcript') {
          setTranscript((prev) => (prev.some((line) => line.id === payload.id) ? prev : [...prev, payload]));
        } else {
          setSuggestions((prev) => (prev.some((s) => s.id === payload.id) ? prev : [...prev, payload]));
        }
      } catch {
        // ignore
      }
    };
    room.on(RoomEvent.DataReceived, handleMessage);
    return () => { room.off(RoomEvent.DataReceived, handleMessage); };
  }, [room]);

  const stopCapture = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (interimFlushTimerRef.current) {
      clearTimeout(interimFlushTimerRef.current);
      interimFlushTimerRef.current = null;
    }

    // Immediately commit any pending spoken words before shutting off mic
    commitInterimLine();

    try {
      recorderRef.current?.stop();
    } catch {
      // ignore
    }
    recorderRef.current = null;

    try {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    } catch {
      // ignore
    }
  }, [commitInterimLine]);

  const toggleCaptions = useCallback(() => {
    setCaptionsEnabled((enabled) => !enabled);
  }, []);

  const localMicTrack = localParticipant.getTrackPublication(Track.Source.Microphone)?.track 
    || microphones.find((t) => t.participant.isLocal)?.publication.track;
  const micTrackSid = localMicTrack?.sid;

  // Real-time live speech capture
  useEffect(() => {
    if (!isMicrophoneEnabled) {
      stopCapture();
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    let isMounted = true;

    const startRecognition = () => {
      if (!SpeechRecognition || !isMounted) return;
      if (!isMicrophoneEnabledRef.current) return;

      try {
        if (recognitionRef.current) {
          recognitionRef.current.onend = null;
          recognitionRef.current.onerror = null;
          try { recognitionRef.current.abort(); } catch { /* ignore */ }
          recognitionRef.current = null;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let liveSpeech = '';
          let isFinalSentence = false;

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const result = event.results[i];
            if (result && result[0]) {
              liveSpeech += result[0].transcript + ' ';
              if (result.isFinal) isFinalSentence = true;
            }
          }

          const speakerName = localParticipantRef.current.name || localParticipantRef.current.identity || 'Speaker';
          const now = new Date();
          const timestamp = now.toTimeString().split(' ')[0];
          const currentWords = liveSpeech.trim();

          if (currentWords) {
            // Show real-time words in live preview
            setInterimLine({
              speaker: speakerName,
              text: currentWords,
              timestamp
            });

            // If user finishes sentence or pauses for 1.2s, commit sentence to transcript
            if (interimFlushTimerRef.current) clearTimeout(interimFlushTimerRef.current);
            const debounceMs = isFinalSentence ? 800 : 1300;
            interimFlushTimerRef.current = setTimeout(() => {
              commitInterimLine(currentWords);
            }, debounceMs);
          }
        };

        recognition.onerror = (err: any) => {
          if (err.error !== 'no-speech' && err.error !== 'aborted') {
            console.warn('SpeechRecognition info:', err.error);
          }
        };

        recognition.onend = () => {
          if (isMounted && isMicrophoneEnabledRef.current) {
            restartTimerRef.current = setTimeout(() => {
              if (isMounted && isMicrophoneEnabledRef.current) {
                startRecognition();
              }
            }, 100);
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (e) {
        console.warn('Recognition start retry:', e);
      }
    };

    startRecognition();

    // Stream audio to backend Deepgram via WebSocket
    const track = localMicTrack?.mediaStreamTrack;
    const ws = wsRef.current;
    if (track && ws) {
      try {
        const mimeType = preferredMimeType();
        const recorder = new MediaRecorder(new MediaStream([track]), mimeType ? { mimeType } : undefined);
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            void event.data.arrayBuffer().then((buf) => ws.send(buf));
          }
        };
        recorder.start(250);
        recorderRef.current = recorder;
      } catch (err) {
        console.warn('MediaRecorder error:', err);
      }
    }

    return () => {
      isMounted = false;
      stopCapture();
    };
  }, [isMicrophoneEnabled, micTrackSid, localMicTrack, publish, stopCapture, commitInterimLine]);

  const dismissSuggestion = useCallback((id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { connectionError, captionsEnabled, captionsError, toggleCaptions, transcript, interimLine, suggestions, dismissSuggestion };
}
