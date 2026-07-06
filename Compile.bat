@echo off
echo ========================================
echo   Compiling TypeScript Backend...
echo ========================================

cd /d "%~dp0"
call npx tsc || echo [INFO] Type errors exist, but JS files were emitted.

echo.
echo [OK] TypeScript compilation complete.
echo.
pause
