@echo off
rem `acedeck` CLI: runs build/cli.js (in app.asar) on the Acedeck executable as plain Node.
setlocal
set ELECTRON_RUN_AS_NODE=1
"%~dp0..\..\Acedeck.exe" "%~dp0..\app.asar\cli.js" %*
exit /b %ERRORLEVEL%
