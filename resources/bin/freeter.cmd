@echo off
rem `freeter`: the former name of the `acedeck` CLI. Keeps `freeter` working where it is found on PATH (the in-app
rem terminal). A setup that stored the full path of the old install folder still has to be pointed at the new one.
call "%~dp0acedeck.cmd" %*
exit /b %ERRORLEVEL%
