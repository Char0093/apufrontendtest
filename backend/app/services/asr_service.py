"""ASR service — ffmpeg audio extraction + Deepgram transcription/diarization
(Phase 2). Ported from MEETINGS/pipeline.py's extract_audio() and
run_deepgram_transcription(): that module's actual, exercised ASR path is
Deepgram — Whisper/Pyannote are listed in its requirements.txt but never
called by run_full_pipeline(), so they aren't ported here either.
"""
import logging
import subprocess
from pathlib import Path
from typing import List

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def extract_audio(video_path: str, audio_path: str) -> str:
    """Extract audio using ffmpeg. Output: 16kHz mono WAV (Deepgram-ready)."""
    if Path(audio_path).exists():
        logger.info(f"Audio already exists: {audio_path}")
        return audio_path

    logger.info(f"Extracting audio from: {video_path}")
    cmd = [
        "ffmpeg", "-i", video_path,
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        "-y",
        audio_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr[:500]}")

    logger.info(f"Audio extracted: {audio_path}")
    return audio_path


def run_deepgram_transcription(audio_path: str) -> List[dict]:
    """Transcription + diarization in one Deepgram call.
    Returns aligned segments: {timestamp, start, speaker, speaker_raw, text}.
    """
    if not settings.deepgram_api_key:
        raise ValueError("DEEPGRAM_API_KEY is not set.")

    logger.info(f"Sending audio to Deepgram: {audio_path}")

    with open(audio_path, "rb") as file:
        buffer_data = file.read()

    headers = {
        "Authorization": f"Token {settings.deepgram_api_key}",
        "Content-Type": "audio/wav",
    }
    params = {
        "model": "nova-2",
        "smart_format": "true",
        "diarize": "true",
        "paragraphs": "true",
        "language": "en",
    }

    with httpx.Client(timeout=300.0) as client:
        response = client.post(
            "https://api.deepgram.com/v1/listen",
            headers=headers,
            params=params,
            content=buffer_data,
        )
        response.raise_for_status()
        data = response.json()

    alts = data.get("results", {}).get("channels", [{}])[0].get("alternatives", [{}])[0]
    paragraphs = alts.get("paragraphs", {}).get("paragraphs", [])

    segments: List[dict] = []

    if paragraphs:
        for p in paragraphs:
            start = p.get("start", 0)
            h, m, s = int(start // 3600), int((start % 3600) // 60), int(start % 60)

            sentences = p.get("sentences", [])
            text = " ".join(sent.get("text", "") for sent in sentences).strip()
            if not text:
                continue

            segments.append({
                "timestamp": f"{h:02d}:{m:02d}:{s:02d}",
                "start": start,
                "speaker": f"SPEAKER_{p.get('speaker', 0) + 1:02d}",
                "speaker_raw": str(p.get("speaker", 0)),
                "text": text,
            })
    else:
        # Fallback if Deepgram doesn't return paragraph grouping.
        words = alts.get("words", [])
        for i in range(0, len(words), 10):
            chunk = words[i:i + 10]
            start = chunk[0].get("start", 0)
            h, m, s = int(start // 3600), int((start % 3600) // 60), int(start % 60)
            text = " ".join(w.get("punctuated_word", w.get("word", "")) for w in chunk)
            speaker = chunk[0].get("speaker", 0)

            segments.append({
                "timestamp": f"{h:02d}:{m:02d}:{s:02d}",
                "start": start,
                "speaker": f"SPEAKER_{speaker + 1:02d}",
                "speaker_raw": str(speaker),
                "text": text.strip(),
            })

    logger.info(f"Deepgram transcription complete — {len(segments)} segments")
    return segments
