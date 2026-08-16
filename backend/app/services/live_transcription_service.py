"""Thin proxy to Deepgram's live streaming WebSocket. One connection per
participant, opened lazily on captions_on. See
docs/superpowers/specs/2026-08-15-live-transcript-suggestions-design.md.
"""
import asyncio
import json
import logging
import time

import websockets

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_DEEPGRAM_URL = (
    "wss://api.deepgram.com/v1/listen"
    "?model=nova-2&smart_format=true&interim_results=true&punctuate=true&language=en"
)
_KEEPALIVE_INTERVAL_SECONDS = 5


class DeepgramLiveConnection:
    def __init__(self, ws) -> None:
        self._ws = ws
        self.results: asyncio.Queue[str] = asyncio.Queue()
        self._last_audio_sent = time.monotonic()
        self._reader_task: asyncio.Task | None = None
        self._keepalive_task: asyncio.Task | None = None

    async def send_audio(self, chunk: bytes) -> None:
        await self._ws.send(chunk)
        self._last_audio_sent = time.monotonic()

    async def close(self) -> None:
        if self._reader_task is not None:
            self._reader_task.cancel()
        if self._keepalive_task is not None:
            self._keepalive_task.cancel()
        await self._ws.close()


async def _read_results(ws, results: "asyncio.Queue[str]") -> None:
    """Only Deepgram's *finalized* results are queued — interim results are
    for a client-side typing indicator only, never the durable transcript."""
    try:
        async for raw in ws:
            data = json.loads(raw)
            channel = data.get("channel")
            if not channel:
                continue
            alternatives = channel.get("alternatives") or [{}]
            text = alternatives[0].get("transcript", "")
            if text and data.get("is_final"):
                await results.put(text)
    except Exception as exc:
        logger.warning("Deepgram live connection reader stopped: %s", exc)


async def _send_keepalive(connection: DeepgramLiveConnection) -> None:
    """Deepgram's live socket can time out during a pause in speech with no
    audio and no KeepAlive. Sends one only when audio has actually been idle
    for the interval, so it never fights with real traffic."""
    try:
        while True:
            await asyncio.sleep(_KEEPALIVE_INTERVAL_SECONDS)
            if time.monotonic() - connection._last_audio_sent >= _KEEPALIVE_INTERVAL_SECONDS:
                await connection._ws.send(json.dumps({"type": "KeepAlive"}))
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        logger.warning("Deepgram keepalive stopped: %s", exc)


async def open_connection() -> DeepgramLiveConnection:
    if not settings.deepgram_api_key:
        raise ValueError("DEEPGRAM_API_KEY is not set.")
    ws = await websockets.connect(
        _DEEPGRAM_URL,
        additional_headers={"Authorization": f"Token {settings.deepgram_api_key}"},
    )
    connection = DeepgramLiveConnection(ws)
    connection._reader_task = asyncio.create_task(_read_results(ws, connection.results))
    connection._keepalive_task = asyncio.create_task(_send_keepalive(connection))
    return connection
