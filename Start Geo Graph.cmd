@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto missing
where npm.cmd >nul 2>nul
if errorlevel 1 goto missing
call npm.cmd run launch
if errorlevel 1 pause
exit /b %errorlevel%
:missing
echo Install Node.js 22.13 or newer from https://nodejs.org/ then reopen this file.
pause
exit /b 1
