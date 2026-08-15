"""Vision service — Gemini Vision (primary) / Agnes Vision (fallback) reads
participant nameplates from sampled video frames, then maps SPEAKER_XX labels
to real names. Ported from MEETINGS/pipeline.py's extract_names_from_video()
and map_speakers_to_names().
"""
import base64
import json
import logging
import re
import time
from pathlib import Path
from typing import Dict, List, Optional

from app.core.config import get_settings
from app.services.gemini_service import call_agnes_api

logger = logging.getLogger(__name__)
settings = get_settings()


def extract_names_from_video(video_path: str) -> Dict[float, List[str]]:
    """Sample 4 frames across the video, ask Vision to read participant
    names off nameplates/tiles. Returns {timestamp_s: [names]}."""
    if not settings.agnes_api_key and not settings.gemini_api_key:
        return {}

    import cv2

    name_timestamps: Dict[float, List[str]] = {}
    frames_dir = Path(settings.storage_path) / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    gemini_client = None
    if settings.gemini_api_key:
        from google import genai
        gemini_client = genai.Client(api_key=settings.gemini_api_key)

    try:
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 1)
        duration_s = total_frames / fps

        sample_timestamps = (
            [duration_s * 0.15, duration_s * 0.40, duration_s * 0.65, duration_s * 0.85]
            if duration_s > 0
            else [0.0]
        )

        logger.info("Sampling 4 key video frames for Vision...")

        for ts in sample_timestamps:
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(ts * fps))
            ret, frame = cap.read()
            if not ret:
                continue

            frame_path = frames_dir / f"frame_{int(ts)}s.jpg"
            cv2.imwrite(str(frame_path), frame)

            try:
                time.sleep(1.0)
                image_bytes = frame_path.read_bytes()
                resp_text = ""

                if settings.gemini_api_key:
                    try:
                        from google.genai import types
                        prompt = (
                            "Look at this video meeting screenshot. "
                            "List all visible participant names (from name tags, banners, or video tiles). "
                            'Return ONLY JSON: {"names": ["Name1", "Name2"]}. '
                            'If no names visible: {"names": []}.'
                        )
                        resp = gemini_client.models.generate_content(
                            model="gemini-2.0-flash",
                            contents=[
                                prompt,
                                types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                            ],
                            config=types.GenerateContentConfig(response_mime_type="application/json"),
                        )
                        resp_text = resp.text
                    except Exception as gemini_err:
                        logger.warning(f"Gemini Vision notice: {gemini_err}. Falling back to Agnes AI Vision...")
                        resp_text = ""

                if not resp_text and settings.agnes_api_key:
                    b64_str = base64.b64encode(image_bytes).decode("utf-8")
                    data_uri = f"data:image/jpeg;base64,{b64_str}"
                    messages = [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": 'Look at this video meeting screenshot. List all visible participant names (from name tags, video tiles, or banners). Return ONLY JSON: {"names": ["Name1", "Name2"]}. If none: {"names": []}.'},
                                {"type": "image_url", "image_url": {"url": data_uri}},
                            ],
                        }
                    ]
                    resp_text = call_agnes_api(messages, model="agnes-2.0-flash")

                raw_json = resp_text.strip()
                match = re.search(r"\{.*\}", raw_json, re.DOTALL)
                if match:
                    raw_json = match.group(0)
                data = json.loads(raw_json)
                names = data.get("names", []) or data.get("participants", [])
                if names:
                    name_timestamps[ts] = names
            except Exception as e:
                logger.warning(f"  Frame {int(ts)}s Vision notice: {e}")

        cap.release()
        logger.info(f"Vision complete — names found in {len(name_timestamps)} frames")

    except Exception as e:
        logger.warning(f"Vision extraction notice: {e}")
    finally:
        for p in frames_dir.glob("frame_*.jpg"):
            try:
                p.unlink()
            except Exception:
                pass

    return name_timestamps


def map_speakers_to_names(
    segments: List[dict],
    name_timestamps: Dict[float, List[str]],
    gemini_map: Optional[Dict[str, str]] = None,
) -> Dict[str, str]:
    """Map SPEAKER_01, SPEAKER_02... to real names, combining the Gemini
    analysis speaker_map with Vision-detected nameplate timestamps, enforcing
    unique 1:1 assignment."""
    speaker_map: Dict[str, str] = dict(gemini_map or {})
    all_names = list(set(n for names in name_timestamps.values() for n in names))

    if not name_timestamps or not all_names:
        return speaker_map

    speaker_frames: Dict[str, List[float]] = {}
    for seg in segments:
        spk = seg["speaker"]
        t_str = seg["timestamp"]
        try:
            parts = t_str.split(":")
            if len(parts) == 2:
                seg_sec = int(parts[0]) * 60 + int(parts[1])
            elif len(parts) == 3:
                seg_sec = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
            else:
                seg_sec = 0
        except Exception:
            seg_sec = 0

        speaker_frames.setdefault(spk, []).append(seg_sec)

    for spk, times in speaker_frames.items():
        if spk in speaker_map and speaker_map[spk] and "speaker" not in speaker_map[spk].lower():
            continue

        matched_names: List[str] = []
        for seg_t in times:
            for frame_t, names in name_timestamps.items():
                if abs(frame_t - seg_t) < 60:
                    matched_names.extend(names)

        if matched_names:
            most_common = max(set(matched_names), key=matched_names.count)
            speaker_map[spk] = most_common
            logger.info(f"Mapped {spk} -> {most_common} (from Vision timestamps)")

    return speaker_map
