@echo off
setlocal
cd /d "%~dp0"

echo Stopping Corporate Brain services...

taskkill /FI "WINDOWTITLE eq Corporate Brain - Backend API*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Corporate Brain - Ask Coco Server*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Corporate Brain - Celery Worker*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Corporate Brain - Frontend*" /T /F >nul 2>&1

echo Stopping Docker containers (Redis, Neo4j)...
docker compose down

echo.
echo All services stopped.
pause
