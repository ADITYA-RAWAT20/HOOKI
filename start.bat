@echo off
cd /d "%~dp0"
echo Installing, please wait...
call npm install
echo.
echo Starting HOOKI. Open http://localhost:3000 in Chrome. Keep this window open.
npm start
pause
