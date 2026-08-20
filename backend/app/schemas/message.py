from pydantic import BaseModel


class SendMessageRequest(BaseModel):
    receiver_name: str
    text: str


class DirectMessageItem(BaseModel):
    id: str
    sender_name: str
    receiver_name: str
    text: str
    is_read: bool
    created_at: str
