@echo off
echo ========================================
echo   Compiling TypeScript Backend...
echo ========================================

cd /d "%~dp0"
call npx tsc || echo [INFO] Type errors exist, but JS files were emitted.

echo.
echo ========================================
echo   Building Frontend...
echo ========================================

cd /d "%~dp0\src\frontend"
call npm run build

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Frontend build failed.
    echo.
    pause
    exit /b %errorlevel%
)

echo [OK] Frontend built successfully.
echo.
echo ========================================
echo   Starting MinePanel...
echo ========================================
echo.

cd /d "%~dp0"
npm run start

pause