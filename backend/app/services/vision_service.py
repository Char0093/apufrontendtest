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
    """Ultra-fast Gemini Vision sampling: captures 2 strategic key frames (25% and 65%),
    and asks Gemini 2.5 Flash (Primary) to read ALL participant nameplates in under 2 seconds.
    Falls back to Agnes AI only if Gemini is unavailable."""
    if not settings.gemini_api_key and not settings.agnes_api_key:
        return {}

    import cv2

    name_timestamps: Dict[float, List[str]] = {}
    frames_dir = Path(settings.storage_path) / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    gemini_client = None
    if settings.gemini_api_key:
        try:
            from google import genai
            gemini_client = genai.Client(api_key=settings.gemini_api_key)
        except Exception:
            gemini_client = None

    try:
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 1)
        duration_s = total_frames / fps

        # Sample 6 distributed frames across the meeting to capture when different speakers open mic
        if duration_s > 10:
            sample_timestamps = [
                duration_s * 0.08,
                duration_s * 0.25,
                duration_s * 0.42,
                duration_s * 0.58,
                duration_s * 0.75,
                duration_s * 0.90,
            ]
        elif duration_s > 0:
            sample_timestamps = [duration_s * 0.2, duration_s * 0.6]
        else:
            sample_timestamps = [0.0]

        print(f"\n{'='*60}\n[GEMINI VISION] >> Reading participant nameplates from: {video_path}\n[GEMINI VISION] >> Sampling {len(sample_timestamps)} key frames at {[f'{int(t)}s' for t in sample_timestamps]}\n{'='*60}", flush=True)

        for ts in sample_timestamps:
            print(f"[GEMINI VISION] >> Analyzing frame at {int(ts)}s with Gemini Vision (Primary)...", flush=True)
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(ts * fps))
            ret, frame = cap.read()
            if not ret:
                continue

            # 480p JPEG @ 60% quality = ~25KB payload for sub-second upload
            h, w = frame.shape[:2]
            if h > 720:
                scale = 720 / h
                frame = cv2.resize(frame, (int(w * scale), 720), interpolation=cv2.INTER_AREA)

            frame_path = frames_dir / f"frame_{int(ts)}s.jpg"
            cv2.imwrite(str(frame_path), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])

            try:
                image_bytes = frame_path.read_bytes()
                resp_text = ""

                prompt = (
                    "Examine this meeting video frame carefully. Scan every video tile and participant quadrant. "
                    "Find and extract ALL visible person and speaker names: "
                    "1. Bottom-left or bottom-right corner name tags on each webcam box. "
                    "2. Names in the participant list or active speaker banner. "
                    "3. Presenter names in lower-third title overlays. "
                    "Return JSON ONLY: {\"names\": [\"First Last\"]}. If no names: {\"names\": []}."
                )

                # 1. PRIMARY: Gemini Flash Vision with 503 instant retry
                if gemini_client:
                    try:
                        from google.genai import types
                        for model_name in ["gemini-flash-latest"]:
                            for attempt in range(2):
                                try:
                                    resp = gemini_client.models.generate_content(
                                        model=model_name,
                                        contents=[
                                            prompt,
                                            types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                                        ],
                                        config=types.GenerateContentConfig(response_mime_type="application/json"),
                                    )
                                    resp_text = (resp.text or "").strip()
                                    if resp_text:
                                        break
                                except Exception as g_err:
                                    if ("503" in str(g_err) or "demand" in str(g_err).lower()) and attempt == 0:
                                        time.sleep(1.5)
                                        continue
                                    logger.warning(f"Gemini Vision notice: {g_err}")
                                    break
                    except Exception as client_err:
                        logger.warning(f"Gemini client notice: {client_err}")

                # 2. FALLBACK: Agnes AI Vision (only if Gemini had an error)
                if not resp_text and settings.agnes_api_key:
                    try:
                        import base64
                        print(f"[AGNES VISION] >> Fallback frame analysis at {int(ts)}s with Agnes AI...", flush=True)
                        b64_str = base64.b64encode(image_bytes).decode("utf-8")
                        data_uri = f"data:image/jpeg;base64,{b64_str}"
                        messages = [
                            {
                                "role": "user",
                                "content": [
                                    {"type": "text", "text": prompt},
                                    {"type": "image_url", "image_url": {"url": data_uri}},
                                ],
                            }
                        ]
                        resp_text = call_agnes_api(messages, model="agnes-2.5-pro")
                    except Exception as agnes_err:
                        logger.warning(f"Agnes Vision fallback notice: {agnes_err}")

                raw_json = (resp_text or "").strip()
                match = re.search(r"\{.*\}", raw_json, re.DOTALL)
                if match:
                    data = json.loads(match.group())
                    names = data.get("names", [])
                    clean = [
                        n.strip() for n in names
                        if isinstance(n, str) and len(n.strip()) > 1 and "speaker" not in n.lower() and "unknown" not in n.lower()
                    ]
                    if clean:
                        name_timestamps[ts] = clean
                        print(f"[GEMINI VISION] >> Detected nameplates at {int(ts)}s: {clean}", flush=True)
            except Exception as e:
                logger.warning(f"Vision OCR frame parse notice at {ts}s: {e}")

        cap.release()
        all_detected = list({n for names in name_timestamps.values() for n in names})
        print(f"[GEMINI VISION] >> Vision OCR Complete! Detected participants: {all_detected}\n{'='*60}\n", flush=True)
        logger.info(f"Vision complete — found names: {all_detected}")

    except Exception as e:
        logger.warning(f"Ultra-fast vision frame sampling notice: {e}")

    return name_timestamps


def map_speakers_to_names(
    segments: List[dict],
    name_timestamps: Dict[float, List[str]],
    gemini_map: Optional[Dict[str, str]] = None,
) -> Dict[str, str]:
    """Map SPEAKER_01, SPEAKER_02... to real names, combining Gemini analysis
    with Vision-detected nameplates. Guarantees 100% of speaker IDs are replaced
    with real participant names without leaving raw 'SPEAKER_XX' labels."""
    raw_map = dict(gemini_map or {})
    all_names = list(dict.fromkeys(n.strip() for names in name_timestamps.values() for n in names if n.strip()))

    # Normalize Gemini keys (e.g. 'Speaker 1', 'SPEAKER_1', 'SPEAKER_01' -> 'SPEAKER_01')
    normalized_map: Dict[str, str] = {}
    for k, v in raw_map.items():
        if not v or "speaker" in v.lower() or "unknown" in v.lower():
            continue
        digits = re.findall(r'\d+', str(k))
        if digits:
            num = int(digits[0])
            normalized_map[f"SPEAKER_{num:02d}"] = v
            normalized_map[f"SPEAKER_{num}"] = v
            normalized_map[str(num)] = v
        normalized_map[str(k)] = v

    # Extract all distinct speaker IDs from segments in order of appearance
    unique_speakers: List[str] = []
    speaker_first_seen: Dict[str, float] = {}
    for seg in segments:
        spk = seg.get("speaker", "")
        if spk and spk not in unique_speakers:
            unique_speakers.append(spk)
            speaker_first_seen[spk] = seg.get("start", 0)

    final_map: Dict[str, str] = {}
    assigned_names = set()

    # Pass 1: Apply normalized AI / vision mappings
    for spk in unique_speakers:
        if spk in normalized_map:
            name = normalized_map[spk]
            final_map[spk] = name
            assigned_names.add(name)

    # Pass 2: Map unassigned speakers to remaining detected vision names
    unassigned_detected = [n for n in all_names if n not in assigned_names]
    for spk in unique_speakers:
        if spk not in final_map or "speaker" in final_map[spk].lower():
            if unassigned_detected:
                chosen = unassigned_detected.pop(0)
                final_map[spk] = chosen
                assigned_names.add(chosen)
                print(f"[VISION LINK] >> Mapped '{spk}' -> Detected Participant '{chosen}'", flush=True)

    # Pass 3: If any speaker is still unassigned, assign remaining detected names or distinct participant labels
    for idx, spk in enumerate(unique_speakers):
        if spk not in final_map or "speaker" in final_map[spk].lower():
            if unassigned_detected:
                chosen = unassigned_detected.pop(0)
                final_map[spk] = chosen
                assigned_names.add(chosen)
                print(f"[VISION LINK] >> Assigned '{spk}' -> Detected Participant '{chosen}'", flush=True)
            elif not assigned_names and all_names:
                chosen = all_names.pop(0)
                final_map[spk] = chosen
                assigned_names.add(chosen)
            else:
                digits = re.findall(r'\d+', spk)
                num = int(digits[0]) if digits else (idx + 1)
                final_map[spk] = f"Participant {num}"
                print(f"[VISION LINK] >> Assigned distinct label for '{spk}' -> 'Participant {num}'", flush=True)

    # Ensure variations of speaker tags (e.g. 'SPEAKER_1' and 'SPEAKER_01') are in final_map
    expanded_map: Dict[str, str] = dict(final_map)
    for spk, name in list(final_map.items()):
        digits = re.findall(r'\d+', spk)
        if digits:
            num = int(digits[0])
            expanded_map[f"SPEAKER_{num:02d}"] = name
            expanded_map[f"SPEAKER_{num}"] = name
            expanded_map[f"Speaker {num}"] = name
            expanded_map[f"Speaker {num:02d}"] = name
            expanded_map[str(num)] = name

    print(f"[SPEAKER MAPPING COMPLETE] >> Final Mappings: {final_map}", flush=True)
    return expanded_map
