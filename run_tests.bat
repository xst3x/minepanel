@echo off
cd /d "%~dp0"
node_modules\.bin\jest.cmd --forceExit %*
