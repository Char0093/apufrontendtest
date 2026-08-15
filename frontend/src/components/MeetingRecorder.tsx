import type { TrackReference } from '@livekit/components-core';
import { useTracks } from '@livekit/components-react';
import { Circle, Square } from 'lucide-react';
import { Track } from 'livekit-client';
import React, { useEffect, useRef, useState } from 'react';

type RecordingRuntime = {
  recorder: MediaRecorder;
  animationFrame: number;
  captureStream: MediaStream;
  outputStream: MediaStream;
  sourceVideo: HTMLVideoElement;
  audioContext: AudioContext | null;
};

const preferredMimeType = () => [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
].find((type) => MediaRecorder.isTypeSupported(type)) ?? '';

const mediaTrack = (trackRef: TrackReference) => trackRef.publication.track?.mediaStreamTrack;

export const MeetingRecorder: React.FC<{ roomName: string; onError: (message: string) => void }> = ({ roomName, onError }) => {
  const microphones = useTracks([Track.Source.Microphone], { onlySubscribed: true });
  const runtimeRef = useRef<RecordingRuntime | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stopRecording = () => {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.recorder.state === 'inactive') return;
    runtime.recorder.stop();
    setIsRecording(false);
    clearTimer();
  };

  useEffect(() => () => {
    clearTimer();
    const runtime = runtimeRef.current;
    if (runtime?.recorder.state !== 'inactive') runtime?.recorder.stop();
  }, []);

  const startRecording = async () => {
    let captureStream: MediaStream | null = null;
    try {
      if (!('MediaRecorder' in window) || !navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('Meeting-area recording is not supported by this browser.');
      }
      const meetingArea = document.querySelector<HTMLElement>('[data-meeting-recording-area]');
      if (!meetingArea) throw new Error('Could not find the live meeting area to record.');

      // Selecting the current browser tab lets us crop using viewport
      // coordinates. The resulting file excludes the app header and sidebar.
      captureStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser', frameRate: { ideal: 24, max: 30 } },
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
      } as DisplayMediaStreamOptions);
      const captureTrack = captureStream.getVideoTracks()[0];
      if (!captureTrack) throw new Error('No screen video was selected.');

      const sourceVideo = document.createElement('video');
      sourceVideo.autoplay = true;
      sourceVideo.muted = true;
      sourceVideo.playsInline = true;
      sourceVideo.srcObject = captureStream;
      await sourceVideo.play();

      const canvas = document.createElement('canvas');
      const initialRect = meetingArea.getBoundingClientRect();
      const initialWidth = Math.max(1, Math.min(window.innerWidth, initialRect.right) - Math.max(0, initialRect.left));
      const initialHeight = Math.max(1, Math.min(window.innerHeight, initialRect.bottom) - Math.max(0, initialRect.top));
      const pixelScaleX = sourceVideo.videoWidth / window.innerWidth;
      const pixelScaleY = sourceVideo.videoHeight / window.innerHeight;
      canvas.width = Math.max(2, Math.round(initialWidth * pixelScaleX / 2) * 2);
      canvas.height = Math.max(2, Math.round(initialHeight * pixelScaleY / 2) * 2);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not create the meeting-area recorder.');

      const drawFrame = () => {
        const rect = meetingArea.getBoundingClientRect();
        const left = Math.max(0, Math.min(window.innerWidth, rect.left));
        const top = Math.max(0, Math.min(window.innerHeight, rect.top));
        const right = Math.max(left + 1, Math.min(window.innerWidth, rect.right));
        const bottom = Math.max(top + 1, Math.min(window.innerHeight, rect.bottom));
        const scaleX = sourceVideo.videoWidth / window.innerWidth;
        const scaleY = sourceVideo.videoHeight / window.innerHeight;
        context.drawImage(
          sourceVideo,
          left * scaleX,
          top * scaleY,
          (right - left) * scaleX,
          (bottom - top) * scaleY,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        if (runtimeRef.current) runtimeRef.current.animationFrame = requestAnimationFrame(drawFrame);
      };

      const outputStream = canvas.captureStream(24);
      let audioContext: AudioContext | null = null;
      const audioTracks = microphones.map(mediaTrack).filter((track): track is MediaStreamTrack => Boolean(track));
      if (audioTracks.length > 0) {
        audioContext = new AudioContext();
        await audioContext.resume();
        const destination = audioContext.createMediaStreamDestination();
        audioTracks.forEach((track) => audioContext!.createMediaStreamSource(new MediaStream([track])).connect(destination));
        destination.stream.getAudioTracks().forEach((track) => outputStream.addTrack(track));
      }

      const mimeType = preferredMimeType();
      const recorder = new MediaRecorder(outputStream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onerror = () => onError('The browser stopped the meeting recording unexpectedly.');
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          const safeRoom = roomName.replace(/[^a-zA-Z0-9_-]/g, '-');
          link.href = url;
          link.download = `${safeRoom}-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
          link.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
        }
        const runtime = runtimeRef.current;
        if (runtime) {
          cancelAnimationFrame(runtime.animationFrame);
          runtime.sourceVideo.pause();
          runtime.sourceVideo.srcObject = null;
          runtime.captureStream.getTracks().forEach((track) => track.stop());
          runtime.outputStream.getTracks().forEach((track) => track.stop());
          void runtime.audioContext?.close();
        }
        runtimeRef.current = null;
      };

      runtimeRef.current = {
        recorder,
        animationFrame: requestAnimationFrame(drawFrame),
        captureStream,
        outputStream,
        sourceVideo,
        audioContext,
      };
      captureTrack.addEventListener('ended', stopRecording, { once: true });
      recorder.start(1_000);
      setElapsedSeconds(0);
      setIsRecording(true);
      timerRef.current = setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1_000);
    } catch (error) {
      captureStream?.getTracks().forEach((track) => track.stop());
      onError(error instanceof Error ? error.message : 'Could not start meeting recording.');
    }
  };

  const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
  const seconds = (elapsedSeconds % 60).toString().padStart(2, '0');

  return isRecording ? (
    <button onClick={stopRecording} className="flex min-w-20 flex-col items-center gap-1 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700" title="Stop and download recording">
      <Square className="h-5 w-5 fill-current" /><span>Stop {minutes}:{seconds}</span>
    </button>
  ) : (
    <button onClick={() => void startRecording()} className="flex min-w-20 flex-col items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200" title="Select this browser tab to record only the meeting area">
      <Circle className="h-5 w-5 fill-rose-600 text-rose-600" /><span>Record</span>
    </button>
  );
};
