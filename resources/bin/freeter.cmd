@echo off
rem `freeter` CLI: runs build/cli.js (in app.asar) on the Freeter executable as plain Node.
setlocal
set ELECTRON_RUN_AS_NODE=1
"%~dp0..\..\Freeter-SWH.exe" "%~dp0..\app.asar\cli.js" %*
exit /b %ERRORLEVEL%
