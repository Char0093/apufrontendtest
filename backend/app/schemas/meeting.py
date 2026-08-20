from pydantic import BaseModel


class MeetingCreate(BaseModel):
    title: str
    project: str | None = None
    date: str | None = None
    time_range: str | None = None
    department: str | None = None
    participant_names: list[str] = []


class MeetingCreateResponse(BaseModel):
    meeting_id: str


class RsvpRequest(BaseModel):
    status: str  # 'accepted' | 'declined'


class MeetingStatusResponse(BaseModel):
    meeting_id: str
    status: str
    progress_percentage: int
    error_message: str | None = None


class MeetingListItem(BaseModel):
    id: str
    title: str
    project: str | None = None
    date: str | None = None
    status: str
    progress: int
    decisions_count: int = 0
    action_items_count: int = 0
    flags_count: int = 0
    source: str | None = None
    room_id: str | None = None
    time_range: str | None = None
    department: str | None = None
    host_name: str | None = None
    rsvp_status: str | None = None
    participant_names: list[str] = []
