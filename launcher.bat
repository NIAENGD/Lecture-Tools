@echo off
setlocal ENABLEDELAYEDEXPANSION

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%" >nul

echo.
echo ============================================
echo   Lecture Tools Launcher (Windows Client)
echo ============================================
echo.
echo Select how you want to run Lecture Tools:
echo   [1] Local deployment (run everything locally)
echo   [2] Cloud UI (connect to an existing server)
echo   [3] Local Boost helper (local compute server)
echo.

choice /C 123 /N /M "Choose 1, 2, or 3: "
set "CHOICE=%ERRORLEVEL%"

if "%CHOICE%"=="1" goto :local
if "%CHOICE%"=="2" goto :cloud
if "%CHOICE%"=="3" goto :boost

echo Invalid choice.
goto :cleanup

:local
echo Starting local deployment...
call "%SCRIPT_DIR%start.bat" serve
goto :cleanup

:cloud
set "CLOUD_URL="
set /P CLOUD_URL="Enter the cloud server URL (example: https://lecturetools.example.com): "
if "%CLOUD_URL%"=="" goto :cloud
echo Opening %CLOUD_URL% ...
start "" "%CLOUD_URL%"
goto :cleanup

:boost
echo Starting Local Boost helper on http://localhost:8000 ...
call "%SCRIPT_DIR%start.bat" serve --host 127.0.0.1 --port 8000
goto :cleanup

:cleanup
popd >nul
endlocal & exit /b 0
