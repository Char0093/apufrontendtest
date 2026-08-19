@echo off
setlocal
cd /d "%~dp0"

:: Force UTF-8 output so emoji in log messages don't crash on Windows GBK terminals
set PYTHONIOENCODING=utf-8

echo ============================================
echo   Corporate Brain - Starting all services
echo ============================================
echo.

if not exist "backend\.env" (
    echo [ERROR] backend\.env is missing. Copy backend\.env.example to
    echo         backend\.env and configure the Neo4j password first.
    pause
    exit /b 1
)

echo Select processing mode:
echo   [D] Demo mode - no external AI API calls
echo   [R] Real mode - uses configured Deepgram/Gemini/Agnes services
choice /C DR /N /M "Choose D or R: "
if errorlevel 2 (
    set "DEMO_MODE=false"
    echo [REAL] External AI API calls are enabled.
) else (
    set "DEMO_MODE=true"
    echo [DEMO] External transcription and LLM API calls are disabled.
)
echo.

echo [0/4] Releasing port 8000 (killing any existing backend process)...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8000 "') do (
    if not "%%a"=="0" (
        taskkill /F /PID %%a >nul 2>&1
    )
)
echo       Port 8000 is free.
echo.

echo [1/4] Starting Redis + Neo4j + LiveKit (Docker)...
docker compose up -d redis neo4j livekit
if errorlevel 1 (
    echo [ERROR] Docker failed to start. Is Docker Desktop running?
    pause
    exit /b 1
)

echo [2/4] Checking backend Python environment...
if exist "backend\.venv\.deps_installed" (
    echo       Already installed, skipping.
) else (
    echo       Installing backend dependencies - this can take a few
    echo       minutes on first run only...
    if not exist "backend\.venv\Scripts\python.exe" (
        python -m venv backend\.venv
    )
    backend\.venv\Scripts\python.exe -m pip install --quiet --upgrade pip
    backend\.venv\Scripts\python.exe -m pip install --quiet -r backend\requirements.txt
    if errorlevel 1 (
        echo [ERROR] Dependency installation failed - see the error above.
        echo         Fix the issue and run start.bat again.
        pause
        exit /b 1
    )
    echo done > "backend\.venv\.deps_installed"
)

echo [3/4] Starting backend API server...
:: NOTE: --reload is intentionally removed - it causes WinError 10013 when files change.
:: The server now starts cleanly and stays stable. Restart start.bat to apply code changes.
start "Corporate Brain - Backend API" cmd /k "set PYTHONIOENCODING=utf-8 && cd /d "%~dp0backend" && .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
if exist "ASK COCO\server.py" (
    start "Corporate Brain - Ask Coco Server" cmd /k ""%~dp0launch_askcoco.bat""
)

echo [4/4] Starting frontend dev server...
if exist "frontend\node_modules\.deps_installed" (
    echo       Already installed, skipping.
) else (
    echo       Installing frontend dependencies - this can take a minute
    echo       or two on first run only...
    call npm --prefix frontend install
    if errorlevel 1 (
        echo [ERROR] npm install failed - see the error above.
        echo         Fix the issue and run start.bat again.
        pause
        exit /b 1
    )
    echo done > "frontend\node_modules\.deps_installed"
)
start "Corporate Brain - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo All services are starting in their own windows. Opening the app
echo in your browser in a few seconds (give the backend time to boot)...
timeout /t 8 /nobreak >nul
start http://localhost:5173

echo.
echo Done. Each service has its own window - close a window to stop
echo that service, or run stop.bat to shut everything down at once.
echo.
pause
