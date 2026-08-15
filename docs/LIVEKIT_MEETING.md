# LiveKit meeting room

The Live Meeting navigation item uses a self-hosted LiveKit server. FastAPI signs a short-lived participant JWT at `POST /livekit/token`; `LIVEKIT_API_SECRET` is never sent to the browser.

## Local development

1. Install backend dependencies: `cd backend` then `pip install -r requirements.txt`.
2. Copy `backend/.env.example` to `backend/.env`. The documented `devkey` / `secret` values are only for the local LiveKit development server.
3. Install the LiveKit server and run `livekit-server --dev`. It listens on `ws://localhost:7880` and uses `devkey` / `secret`.
4. Start FastAPI from `backend`: `uvicorn app.main:app --reload`.
5. Start the frontend from `frontend`: `npm install` then `npm run dev`.
6. Visit `http://localhost:5173`, sign in to the demo, then open **Live Meeting**. Use the same room ID in two browser profiles to test it.

For a different API host, set `VITE_API_URL` in the frontend environment. When it is omitted, the frontend uses the hostname that served Vite with port `8000`, so LAN clients do not accidentally call their own `localhost`. Configure these backend variables for a non-default LiveKit instance: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`.

## Networking

`localhost` permits only clients on the same computer. For a LAN test, start the services with the host computer's LAN IP (replace `192.168.1.20`):

```powershell
livekit-server --dev --bind 0.0.0.0 --node-ip 192.168.1.20
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
cd ../frontend
npm run dev -- --host 0.0.0.0
```

Then share `http://192.168.1.20:5173`. With the local `LIVEKIT_URL` default, the token endpoint automatically returns the request host on port `7880`; an explicitly configured URL is always preserved. Windows Firewall must allow the three services. Camera and microphone access requires a secure context in most browser cases; localhost is specially trusted, so use HTTPS for reliable access from another device.

For public use, deploy LiveKit with a public DNS name, trusted HTTPS/TLS, TURN, and the required UDP/TCP firewall ports. Do not use the development API key/secret or expose the FastAPI token endpoint without application authentication and authorization.

## Whiteboard behaviour

The Excalidraw board publishes reliable LiveKit data packets under the `whiteboard` topic. Joining participants request the current scene from existing participants, and changes remain available while at least one participant with the board remains in the room. It intentionally does not persist the drawing after everybody leaves.

## Local recording

The **Record** control creates a local WebM recording in the participant's browser. When prompted, select the **current browser tab**. The recorder crops the capture to the Live Meeting content, including videos, participant list, controls, and whiteboard, while excluding the application's top bar and navigation sidebar. It also mixes subscribed microphone tracks. Press **Stop** to finish and download the file. The recording is not uploaded to FastAPI or LiveKit; each participant who needs a copy must record locally. Browser support is best in current Chromium releases.
