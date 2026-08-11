from pydantic import BaseModel


class MeetingCreate(BaseModel):
    title: str
    project: str | None = None
    date: str | None = None


class MeetingCreateResponse(BaseModel):
    meeting_id: str


class MeetingStatusResponse(BaseModel):
    meeting_id: str
    status: str
    progress_percentage: int
    error_message: str | None = None
