import json
from pathlib import Path

from app.core.config import get_settings

_SUBDIRS = ("raw", "audio", "transcripts", "summaries", "exports")


class StorageService:
    def __init__(self, base_path: str | None = None):
        self.base_path = Path(base_path or get_settings().storage_path)
        for sub in _SUBDIRS:
            (self.base_path / sub).mkdir(parents=True, exist_ok=True)

    def save_raw_file(self, meeting_id: str, filename: str, content: bytes) -> str:
        ext = Path(filename).suffix
        relative_path = f"raw/{meeting_id}{ext}"
        (self.base_path / relative_path).write_bytes(content)
        return relative_path

    def save_audio(self, meeting_id: str, content: bytes) -> str:
        relative_path = f"audio/{meeting_id}.wav"
        (self.base_path / relative_path).write_bytes(content)
        return relative_path

    def save_transcript(self, meeting_id: str, data: dict) -> str:
        relative_path = f"transcripts/{meeting_id}.json"
        (self.base_path / relative_path).write_text(json.dumps(data, indent=2))
        return relative_path

    def save_live_segments(self, meeting_id: str, segments: list[dict]) -> str:
        """Raw segments captured live, before Gemini extraction — read back
        by process_live_meeting_task. Lives under raw/ alongside uploaded
        files: both are "the raw input for this meeting", just a different
        format when there's no uploaded file at all."""
        relative_path = f"raw/{meeting_id}_live.json"
        (self.base_path / relative_path).write_text(json.dumps(segments, indent=2))
        return relative_path

    def get_live_segments(self, meeting_id: str) -> list[dict]:
        relative_path = f"raw/{meeting_id}_live.json"
        return json.loads((self.base_path / relative_path).read_text())

    def get_summary(self, meeting_id: str) -> dict | None:
        p = self.base_path / "summaries" / f"{meeting_id}.json"
        if p.exists():
            try:
                return json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                return None
        return None

    def get_transcript(self, meeting_id: str) -> dict | None:
        p = self.base_path / "transcripts" / f"{meeting_id}.json"
        if p.exists():
            try:
                return json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                return None
        return None

    def save_summary(self, meeting_id: str, data: dict) -> str:
        relative_path = f"summaries/{meeting_id}.json"
        (self.base_path / relative_path).write_text(json.dumps(data, indent=2))
        return relative_path

    def save_export(self, meeting_id: str, content: str, fmt: str = "md") -> str:
        relative_path = f"exports/{meeting_id}.{fmt}"
        (self.base_path / relative_path).write_text(content)
        return relative_path

    def get_file(self, relative_path: str) -> bytes:
        return (self.base_path / relative_path).read_bytes()

    def delete_meeting_files(self, meeting_id: str) -> None:
        """Deletes all storage files (raw video, extracted audio, transcript, summary, exports) for a meeting."""
        for sub in _SUBDIRS:
            sub_dir = self.base_path / sub
            if not sub_dir.exists():
                continue
            for file_path in sub_dir.glob(f"{meeting_id}*"):
                try:
                    file_path.unlink()
                except Exception:
                    pass


storage = StorageService()
