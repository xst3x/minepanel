@echo off
echo ========================================
echo   Building MinePanel (Frontend)
echo ========================================

cd /d "%~dp0\src\frontend"
call npm run build

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Frontend build failed with code %errorlevel%
    pause
    exit /b %errorlevel%
)

echo.
echo [OK] Frontend build complete.
echo.
pause