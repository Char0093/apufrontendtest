import asyncio
import json

import pytest

from app.core.config import Settings
from app.services import live_transcription_service


def test_open_connection_raises_without_api_key(monkeypatch):
    monkeypatch.setattr(
        live_transcription_service, "settings", Settings(_env_file=None, neo4j_password="x", deepgram_api_key="")
    )
    with pytest.raises(ValueError, match="DEEPGRAM_API_KEY"):
        asyncio.run(live_transcription_service.open_connection())


class _FakeDeepgramSocket:
    """Minimal async-iterable stand-in for a websockets connection."""

    def __init__(self, messages):
        self._messages = messages

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not self._messages:
            raise StopAsyncIteration
        return self._messages.pop(0)


def test_read_results_only_queues_final_transcripts():
    messages = [
        json.dumps({"type": "Metadata"}),
        json.dumps({"channel": {"alternatives": [{"transcript": "hello wo"}]}, "is_final": False}),
        json.dumps({"channel": {"alternatives": [{"transcript": "hello world"}]}, "is_final": True}),
        json.dumps({"channel": {"alternatives": [{"transcript": ""}]}, "is_final": True}),
    ]
    fake_ws = _FakeDeepgramSocket(messages)
    results: asyncio.Queue = asyncio.Queue()

    asyncio.run(live_transcription_service._read_results(fake_ws, results))

    assert results.qsize() == 1
    assert results.get_nowait() == "hello world"
