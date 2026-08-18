@echo off
rem ─────────────────────────────────────────────────────────────────
rem  launch_askcoco.bat  —  Wrapper that loads backend\.env and then
rem  starts the Ask Coco server on port 8200.
rem  Called by start.bat so the GROQ_API_KEY is reliably available.
rem ─────────────────────────────────────────────────────────────────

rem Move to repo root (this file lives in root, same as start.bat)
cd /d "%~dp0"

rem ── Load all variables from backend\.env ──────────────────────────
for /f "usebackq tokens=1,* delims==" %%A in ("%~dp0backend\.env") do (
    rem Skip comment lines starting with #
    echo %%A | findstr /b "#" >nul || set "%%A=%%B"
)

rem ── Confirm GROQ_API_KEY ─────────────────────────────────────────
if "%GROQ_API_KEY%"=="" (
    echo.
    echo [ASK COCO] ERROR: GROQ_API_KEY not found in backend\.env!
    echo             Make sure the line exists:
    echo             GROQ_API_KEY=gsk_...
    pause
    exit /b 1
) else (
    echo [ASK COCO] GROQ_API_KEY loaded OK.
)

rem ── Start Ask Coco server on port 8200 ───────────────────────────
cd /d "%~dp0ASK COCO"
..\backend\.venv\Scripts\python.exe -m uvicorn server:app --host 127.0.0.1 --port 8200 --reload
