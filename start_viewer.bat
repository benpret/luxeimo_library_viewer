@echo off
setlocal ENABLEDELAYEDEXPANSION

REM Luxeimo Library Viewer launcher
REM Usage: double-click OR pass custom library root as first argument.

set LIBRARY_ROOT=C:\ImerzaLibrary
if not "%~1"=="" set LIBRARY_ROOT=%~1

echo ==============================================
echo  Luxeimo Library Viewer
echo  Library Root: %LIBRARY_ROOT%
echo  (Override by running: start_viewer.bat D:\Path\To\Library)
echo ==============================================

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js not found in PATH. Please install Node.js from https://nodejs.org/
  pause
  exit /b 1
)

REM Start the proxy server
node server.js --port 5173 --libraryRoot "%LIBRARY_ROOT%"

endlocal
