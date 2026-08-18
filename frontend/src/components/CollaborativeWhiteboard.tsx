import { Excalidraw, exportToCanvas } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useRoomContext } from '@livekit/components-react';
import { ConnectionState, RoomEvent } from 'livekit-client';
import { Eraser, PenLine, RotateCcw, ChevronLeft, ChevronRight, Plus, Download, FileText } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

type WhiteboardMessage =
  | { type: 'request-scene' }
  | { type: 'scene'; currentPage: number; pages: Record<number, readonly ExcalidrawElement[]> }
  | { type: 'scene-chunk'; transferId: string; index: number; total: number; data: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CHUNK_BYTES = 8_000;

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

/** Automatically export all whiteboard pages as image / PDF assets */
export async function downloadWhiteboardPdf(pagesMap: Record<number, readonly ExcalidrawElement[]>, roomName: string) {
  const pageNumbers = Object.keys(pagesMap).map(Number).sort((a, b) => a - b);
  const safeRoom = roomName.replace(/[^a-zA-Z0-9_-]/g, '-');
  
  for (const pageNum of pageNumbers) {
    const elements = pagesMap[pageNum];
    if (!elements || elements.length === 0) continue;
    try {
      const canvas = await exportToCanvas({
        elements,
        appState: {
          exportBackground: true,
          viewBackgroundColor: '#ffffff',
        },
        files: null,
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `Whiteboard_${safeRoom}_Page_${pageNum}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed exporting whiteboard page:', err);
    }
  }
}

export const CollaborativeWhiteboard: React.FC<{ roomName?: string }> = ({ roomName = 'meeting-room' }) => {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const ignoreNextChange = useRef(false);
  const hasReceivedInitialScene = useRef(false);
  const broadcastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingChunks = useRef(new Map<string, { chunks: string[]; total: number }>());

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const pagesRef = useRef<Record<number, readonly ExcalidrawElement[]>>({ 1: [] });
  const currentPageRef = useRef<number>(1);

  const room = useRoomContext();
  const [confirmClear, setConfirmClear] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncActivity, setSyncActivity] = useState<'ready' | 'sending' | 'received'>('ready');

  const handleMessage = useCallback((data: Uint8Array<ArrayBuffer>, _participant?: unknown, _kind?: unknown, topic?: string) => {
    if (topic !== 'whiteboard') return;
    try {
      const payload = JSON.parse(decoder.decode(data)) as WhiteboardMessage;
      if (payload.type === 'request-scene') {
        publishSceneRef.current(pagesRef.current, currentPageRef.current);
      }
      if (payload.type === 'scene' && payload.pages) {
        ignoreNextChange.current = true;
        hasReceivedInitialScene.current = true;
        pagesRef.current = payload.pages;
        setTotalPages(Math.max(Object.keys(payload.pages).length, 1));
        const pg = payload.currentPage || 1;
        setCurrentPage(pg);
        currentPageRef.current = pg;

        const currentElements = payload.pages[pg] || [];
        apiRef.current?.updateScene({ elements: currentElements });
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
          const parsed = JSON.parse(decoder.decode(base64ToBytes(transfer.chunks.join('')))) as {
            currentPage: number;
            pages: Record<number, readonly ExcalidrawElement[]>;
          };
          ignoreNextChange.current = true;
          hasReceivedInitialScene.current = true;
          pagesRef.current = parsed.pages;
          setTotalPages(Math.max(Object.keys(parsed.pages).length, 1));
          const pg = parsed.currentPage || 1;
          setCurrentPage(pg);
          currentPageRef.current = pg;

          const currentElements = parsed.pages[parsed.currentPage || 1] || [];
          apiRef.current?.updateScene({ elements: currentElements });
          setSyncActivity('received');
        }
      }
    } catch {
      setSyncError('A board update could not be read.');
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

  const publishScene = useCallback((allPages: Record<number, readonly ExcalidrawElement[]>, activePg: number) => {
    if (broadcastTimer.current) clearTimeout(broadcastTimer.current);
    broadcastTimer.current = setTimeout(() => {
      void (async () => {
        try {
          if (room.state !== ConnectionState.Connected) return;
          setSyncActivity('sending');
          const payloadObj = { type: 'scene', currentPage: activePg, pages: allPages };
          const sceneBytes = encoder.encode(JSON.stringify(payloadObj));
          if (sceneBytes.byteLength <= CHUNK_BYTES) {
            await send(sceneBytes);
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

  const publishSceneRef = useRef(publishScene);
  publishSceneRef.current = publishScene;

  useEffect(() => {
    const synchronize = () => {
      setSyncError('');
      void send(encoder.encode(JSON.stringify({ type: 'request-scene' })))
        .catch((error) => setSyncError(`Board sync failed: ${error instanceof Error ? error.message : 'unknown error'}`));
      if (Object.keys(pagesRef.current).length > 0) {
        publishSceneRef.current(pagesRef.current, currentPageRef.current);
      }
    };
    room.on(RoomEvent.Connected, synchronize);
    if (room.state === ConnectionState.Connected) synchronize();
    return () => {
      room.off(RoomEvent.Connected, synchronize);
      if (broadcastTimer.current) clearTimeout(broadcastTimer.current);
    };
  }, [room, send]);

  // Page Switcher Handlers
  const switchPage = (targetPage: number) => {
    if (targetPage < 1) return;
    const updatedPages = { ...pagesRef.current };

    if (!updatedPages[targetPage]) {
      updatedPages[targetPage] = [];
    }

    pagesRef.current = updatedPages;
    setTotalPages(Math.max(Object.keys(updatedPages).length, 1));

    setCurrentPage(targetPage);
    currentPageRef.current = targetPage;

    ignoreNextChange.current = true;
    apiRef.current?.updateScene({ elements: updatedPages[targetPage] || [] });
    publishScene(updatedPages, targetPage);
  };

  const addNewPage = () => {
    const nextPg = Math.max(...Object.keys(pagesRef.current).map(Number), 0) + 1;
    switchPage(nextPg);
  };

  const clearCurrentPage = () => {
    setConfirmClear(false);
    const updatedPages = { ...pagesRef.current, [currentPage]: [] };
    pagesRef.current = updatedPages;
    apiRef.current?.updateScene({ elements: [] });
    publishScene(updatedPages, currentPage);
  };

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 shadow-sm space-y-3 font-sans">
      {/* Top Header Bar & Page Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-white">
          <PenLine className="h-4 w-4 text-blue-600" />
          <span>Collaborative Whiteboard</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${syncError ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {syncError || (syncActivity === 'received' ? 'updated' : syncActivity === 'sending' ? 'syncing...' : 'synced')}
          </span>
        </div>

        {/* Multi-Page Navigation Controls (< Page X of Y > + Add Page) */}
        <div className="flex items-center gap-2">
          <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold">
            <button
              type="button"
              onClick={() => switchPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="p-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30 transition-colors cursor-pointer"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <span className="px-2 font-mono font-bold text-slate-700 dark:text-slate-200">
              Page {currentPage} / {totalPages}
            </span>

            <button
              type="button"
              onClick={() => {
                if (currentPage < totalPages) switchPage(currentPage + 1);
                else addNewPage();
              }}
              className="p-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer"
              title={currentPage === totalPages ? "Add New Page" : "Next Page"}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={addNewPage}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
            title="Add New Whiteboard Page"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Page</span>
          </button>

          <button
            type="button"
            onClick={() => void downloadWhiteboardPdf(pagesRef.current, roomName)}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
            title="Export Whiteboard PDF Pages"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>Export PDF</span>
          </button>

          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
          >
            <Eraser className="h-3.5 w-3.5" /> Clear Page
          </button>
        </div>
      </div>

      {/* Restricted Canvas Size Container with Grey Border */}
      <div className="w-full bg-slate-200 dark:bg-slate-800 p-4 sm:p-6 rounded-2xl border border-slate-300 dark:border-slate-700/80 flex items-center justify-center min-h-[520px]">
        
        {/* Bounded Sheet Document Box */}
        <div className="w-full max-w-[900px] h-[480px] rounded-xl bg-white shadow-2xl border border-slate-300 dark:border-slate-700 relative overflow-hidden shrink-0">
          <Excalidraw
            excalidrawAPI={(api) => {
              apiRef.current = api;
              const initialElements = pagesRef.current[currentPageRef.current] || [];
              if (initialElements.length > 0) api.updateScene({ elements: initialElements });
            }}
            onChange={(elements) => {
              pagesRef.current[currentPageRef.current] = elements;
              if (!hasReceivedInitialScene.current) {
                hasReceivedInitialScene.current = true;
                return;
              }
              if (ignoreNextChange.current) {
                ignoreNextChange.current = false;
                return;
              }
              publishScene(pagesRef.current, currentPageRef.current);
            }}
            UIOptions={{ canvasActions: { clearCanvas: false, saveToActiveFile: false, loadScene: false } }}
          />
        </div>

      </div>

      {confirmClear && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl border border-slate-200">
            <h3 className="font-bold text-slate-900">Clear Page {currentPage}?</h3>
            <p className="mt-1 text-xs text-slate-500">This removes drawings on Page {currentPage} for everyone in this room.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmClear(false)} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer">Cancel</button>
              <button onClick={clearCurrentPage} className="flex items-center gap-1 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"><RotateCcw className="h-3.5 w-3.5" /> Clear Page</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
