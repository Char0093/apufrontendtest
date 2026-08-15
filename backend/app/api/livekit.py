"""Short-lived LiveKit room token issuance.

The browser receives only the signed JWT, never the LiveKit API secret.
"""

import re
import uuid
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.config import get_settings

try:
    from livekit import api as livekit_api
except ImportError:  # Keeps health endpoints available until the optional feature is installed.
    livekit_api = None


router = APIRouter(prefix="/livekit", tags=["livekit"])
_SAFE_ROOM = re.compile(r"^[a-zA-Z0-9_-]{1,80}$")


class LiveKitTokenRequest(BaseModel):
    room_name: str = Field(min_length=1, max_length=80)
    display_name: str = Field(min_length=1, max_length=80)


class LiveKitTokenResponse(BaseModel):
    token: str
    server_url: str
    identity: str


@router.post("/token", response_model=LiveKitTokenResponse)
def create_livekit_token(payload: LiveKitTokenRequest, request: Request) -> LiveKitTokenResponse:
    """Issue a participant-scoped token for one meeting room."""
    if livekit_api is None:
        raise HTTPException(status_code=503, detail="LiveKit support is not installed on the API server")

    room_name = payload.room_name.strip()
    display_name = payload.display_name.strip()
    if not _SAFE_ROOM.fullmatch(room_name):
        raise HTTPException(
            status_code=422,
            detail="Room ID may contain only letters, numbers, underscores, and hyphens",
        )

    # A unique identity lets the same display name join from multiple tabs.
    identity = f"{re.sub(r'[^a-zA-Z0-9_-]', '-', display_name)[:48]}-{uuid.uuid4().hex[:8]}"
    settings = get_settings()
    token = (
        livekit_api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(identity)
        .with_name(display_name)
        .with_grants(
            livekit_api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
        .to_jwt()
    )
    server_url = settings.livekit_url
    parsed_livekit_url = urlsplit(server_url)
    request_host = request.url.hostname
    # The localhost default is convenient on the host but wrong for guests:
    # their browser would try to connect to LiveKit on their own computer.
    # Preserve explicitly configured public/LAN URLs, and only derive a host
    # from the incoming request while using the local development default.
    if parsed_livekit_url.hostname in {"localhost", "127.0.0.1"} and request_host:
        safe_host = f"[{request_host}]" if ":" in request_host else request_host
        scheme = "wss" if request.url.scheme == "https" else "ws"
        server_url = f"{scheme}://{safe_host}:{parsed_livekit_url.port or 7880}"

    return LiveKitTokenResponse(token=token, server_url=server_url, identity=identity)
