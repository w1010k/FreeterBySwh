@echo off
rem `acedeck` CLI: runs build/cli.js (in app.asar) on the AceDeck executable as plain Node.
setlocal
set ELECTRON_RUN_AS_NODE=1
"%~dp0..\..\AceDeck.exe" "%~dp0..\app.asar\cli.js" %*
exit /b %ERRORLEVEL%
