import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useRoomContext } from '@livekit/components-react';
import { ConnectionState, RoomEvent } from 'livekit-client';
import { Eraser, PenLine, RotateCcw } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

type WhiteboardMessage =
  | { type: 'request-scene' }
  | { type: 'scene'; elements: readonly ExcalidrawElement[] }
  | { type: 'scene-chunk'; transferId: string; index: number; total: number; data: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder();
// LiveKit data packets have a much smaller practical payload limit than a full
// Excalidraw scene. Keep each encoded chunk safely below that limit.
const CHUNK_BYTES = 8_000;

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

/** A meeting-scoped board. Its scene is retained by active participants. */
export const CollaborativeWhiteboard: React.FC = () => {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const elementsRef = useRef<readonly ExcalidrawElement[]>([]);
  const ignoreNextChange = useRef(false);
  const hasReceivedInitialScene = useRef(false);
  const broadcastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingChunks = useRef(new Map<string, { chunks: string[]; total: number }>());
  const publishSceneRef = useRef<(elements: readonly ExcalidrawElement[]) => void>(() => undefined);
  const room = useRoomContext();
  const [confirmClear, setConfirmClear] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncActivity, setSyncActivity] = useState<'ready' | 'sending' | 'received'>('ready');

  const handleMessage = useCallback((data: Uint8Array<ArrayBuffer>, _participant?: unknown, _kind?: unknown, topic?: string) => {
    if (topic !== 'whiteboard') return;
    try {
      const payload = JSON.parse(decoder.decode(data)) as WhiteboardMessage;
      if (payload.type === 'request-scene' && elementsRef.current.length > 0) {
        publishSceneRef.current(elementsRef.current);
      }
      if (payload.type === 'scene' && Array.isArray(payload.elements)) {
        ignoreNextChange.current = true;
        hasReceivedInitialScene.current = true;
        elementsRef.current = payload.elements;
        apiRef.current?.updateScene({ elements: payload.elements });
        setSyncActivity('received');
      }
      if (payload.type === 'scene-chunk') {
        const transfer = pendingChunks.current.get(payload.transferId) ?? {
          chunks: Array.from({ length: payload.total }, () => ''), total: payload.total,
        };
        if (transfer.total !== payload.total || payload.index < 0 || payload.index >= payload.total) return;
        transfer.chunks[payload.index] = payload.data;
        pendingChunks.current.set(payload.transferId, transfer);
        if (transfer.chunks.every(Boolean)) {
          pendingChunks.current.delete(payload.transferId);
          const elements = JSON.parse(decoder.decode(base64ToBytes(transfer.chunks.join('')))) as readonly ExcalidrawElement[];
          ignoreNextChange.current = true;
          hasReceivedInitialScene.current = true;
          elementsRef.current = elements;
          apiRef.current?.updateScene({ elements });
          setSyncActivity('received');
        }
      }
    } catch (error) {
      setSyncError(error instanceof Error ? 'A board update could not be read.' : 'A board update could not be read.');
    }
  }, []);

  useEffect(() => {
    room.on(RoomEvent.DataReceived, handleMessage);
    return () => { room.off(RoomEvent.DataReceived, handleMessage); };
  }, [handleMessage, room]);

  const send = useCallback((data: Uint8Array<ArrayBuffer>) => room.localParticipant.publishData(data, {
    reliable: true,
    topic: 'whiteboard',
  }), [room]);

  const publishScene = useCallback((elements: readonly ExcalidrawElement[]) => {
    if (broadcastTimer.current) clearTimeout(broadcastTimer.current);
    broadcastTimer.current = setTimeout(() => {
      void (async () => {
        try {
          // Excalidraw emits changes while LiveKit is still negotiating its
          // peer connection. Keep the latest scene and send it on Connected.
          if (room.state !== ConnectionState.Connected) return;
          setSyncActivity('sending');
          const sceneBytes = encoder.encode(JSON.stringify(elements));
          if (sceneBytes.byteLength <= CHUNK_BYTES) {
            await send(encoder.encode(JSON.stringify({ type: 'scene', elements })));
          } else {
            const transferId = crypto.randomUUID();
            const total = Math.ceil(sceneBytes.byteLength / CHUNK_BYTES);
            for (let index = 0; index < total; index += 1) {
              const chunk = sceneBytes.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
              await send(encoder.encode(JSON.stringify({
                type: 'scene-chunk', transferId, index, total, data: bytesToBase64(chunk),
              })));
            }
          }
          setSyncError('');
          setSyncActivity('ready');
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'unknown error';
          setSyncError(`Board send failed: ${reason}`);
        }
      })();
    }, 250);
  }, [room, send]);
  publishSceneRef.current = publishScene;

  useEffect(() => {
    const synchronize = () => {
      setSyncError('');
      void send(encoder.encode(JSON.stringify({ type: 'request-scene' })))
        .catch((error) => setSyncError(`Board sync failed: ${error instanceof Error ? error.message : 'unknown error'}`));
      // If someone drew while the connection was being established, do not
      // discard it. Publish the last local scene once the data channel opens.
      if (elementsRef.current.length > 0) publishSceneRef.current(elementsRef.current);
    };
    room.on(RoomEvent.Connected, synchronize);
    if (room.state === ConnectionState.Connected) synchronize();
    return () => {
      room.off(RoomEvent.Connected, synchronize);
      if (broadcastTimer.current) clearTimeout(broadcastTimer.current);
    };
  }, [room, send]);

  const clearBoard = () => {
    setConfirmClear(false);
    elementsRef.current = [];
    apiRef.current?.updateScene({ elements: [] });
    publishScene([]);
  };

  return (
    <section className="relative h-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <PenLine className="h-4 w-4 text-indigo-600" /> Collaborative whiteboard
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${syncError ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{syncError || (syncActivity === 'received' ? 'update received' : syncActivity === 'sending' ? 'syncing...' : 'synced')}</span>
        </div>
        <button onClick={() => setConfirmClear(true)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-700">
          <Eraser className="h-3.5 w-3.5" /> Clear
        </button>
      </div>
      <div className="h-full pt-10">
        <Excalidraw
          excalidrawAPI={(api) => {
            apiRef.current = api;
            // A scene response can arrive before Excalidraw finishes mounting.
            if (elementsRef.current.length > 0) api.updateScene({ elements: elementsRef.current });
          }}
          onChange={(elements) => {
            elementsRef.current = elements;
            // Excalidraw emits an empty scene while mounting. Do not let a
            // newly joined participant erase the current shared board.
            if (!hasReceivedInitialScene.current) {
              hasReceivedInitialScene.current = true;
              return;
            }
            if (ignoreNextChange.current) {
              ignoreNextChange.current = false;
              return;
            }
            publishScene(elements);
          }}
          UIOptions={{ canvasActions: { clearCanvas: false, saveToActiveFile: false, loadScene: false } }}
        />
      </div>
      {confirmClear && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-slate-950/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="font-bold text-slate-900">Clear the shared board?</h3>
            <p className="mt-1 text-sm text-slate-500">This removes every drawing for everyone currently in the room.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmClear(false)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={clearBoard} className="flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700"><RotateCcw className="h-4 w-4" /> Clear board</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
