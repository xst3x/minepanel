@echo off
echo ========================================
echo   Compiling TypeScript Backend...
echo ========================================

cd /d "%~dp0"
call npx tsc || echo [INFO] Type errors exist, but JS files were emitted.

echo.
echo ========================================
echo   Starting MinePanel Backend...
echo ========================================
echo.

npm run start

pause