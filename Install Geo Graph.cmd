@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto missing
where npm.cmd >nul 2>nul
if errorlevel 1 goto missing
call npm.cmd run setup
if errorlevel 1 goto failed
echo.
echo Ready. Double-click Start Geo Graph.cmd to open the app.
pause
exit /b 0
:missing
echo Node.js and npm are required. Install Node.js 22.13 or newer from https://nodejs.org/
echo Then close this window and run this file again. No administrator launch is needed.
:failed
echo.
echo Setup did not finish. Keep the error above when asking for help.
pause
exit /b 1
