from pydantic import BaseModel


class NotificationItem(BaseModel):
    id: str
    title: str
    message: str
    category: str
    type: str | None = None
    meeting_id: str | None = None
    sender_name: str | None = None
    target_tab: str | None = None
    read: bool
    created_at: str
