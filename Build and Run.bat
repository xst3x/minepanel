@echo on

cd /d "%~dp0\src\frontend"
call npm run build

cd /d "%~dp0"

call npm run start

pause