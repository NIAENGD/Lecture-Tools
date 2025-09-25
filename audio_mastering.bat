@echo off
setlocal ENABLEDELAYEDEXPANSION

REM Determine repository root based on the location of this script
set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%" >nul

REM Configure paths for the self-contained Python runtime
set "PY_VERSION=3.11.9"
set "PY_STORAGE=%SCRIPT_DIR%storage\python"
set "LOCAL_PYTHON=%PY_STORAGE%\python.exe"
set "PY_INSTALLER=%SCRIPT_DIR%assets\python-%PY_VERSION%-amd64.exe"
set "PY_DOWNLOAD_URL=https://www.python.org/ftp/python/%PY_VERSION%/python-%PY_VERSION%-amd64.exe"

REM Bootstrap a local copy of Python if it does not exist yet
if not exist "%LOCAL_PYTHON%" (
    call :setup_python || goto :error
)

REM Ensure the virtual environment exists and is based on the local runtime
if not exist ".venv" (
    echo Creating virtual environment...
    "%LOCAL_PYTHON%" -m venv .venv || goto :error
)

set "VENV_PY=.venv\Scripts\python.exe"
if not exist "%VENV_PY%" (
    echo Virtual environment is missing the Python executable.
    goto :error
)

REM Ensure pip is up to date and install requirements
echo Updating pip...
"%VENV_PY%" -m pip install --upgrade pip >nul || goto :error
echo Installing project requirements...
if exist requirements-dev.txt (
    "%VENV_PY%" -m pip install -r requirements-dev.txt || goto :error
) else if exist requirements.txt (
    "%VENV_PY%" -m pip install -r requirements.txt || goto :error
) else (
    echo No requirements file found. Skipping dependency installation.
)

echo.
if "%~1"=="" goto :usage

set "AUDIO_PATH=%~1"
if not exist "%AUDIO_PATH%" (
    echo Provided audio file was not found: %~1
    goto :error
)

shift
set "REMAINING_ARGS=%*"

echo Launching mastering pipeline for "%AUDIO_PATH%"...
"%VENV_PY%" "%SCRIPT_DIR%run.py" test-mastering "%AUDIO_PATH%" %REMAINING_ARGS%
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" goto :error

goto :cleanup

:usage
echo Usage: audio_mastering.bat ^<path\to\audio_file^> [additional typer options]
echo Example: audio_mastering.bat "C:\\Lectures\\week1.wav"
echo.
echo Drag and drop a file onto this script or pass the path as the first argument.
set "EXIT_CODE=1"
goto :cleanup

:cleanup
popd >nul
endlocal & exit /b %EXIT_CODE%

:error
if not defined EXIT_CODE set "EXIT_CODE=1"
echo.
echo An error occurred while preparing or running the mastering pipeline.
echo Exit code: %EXIT_CODE%
echo.
echo Press any key to close this window...
pause >nul
goto :cleanup

:setup_python
if not exist "%SCRIPT_DIR%assets" mkdir "%SCRIPT_DIR%assets" >nul
if not exist "%PY_STORAGE%" mkdir "%PY_STORAGE%" >nul
echo Local Python runtime not found. Downloading Python %PY_VERSION%...
powershell -NoLogo -NoProfile -Command "try { $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '%PY_DOWNLOAD_URL%' -OutFile '%PY_INSTALLER%' -UseBasicParsing } catch { Write-Error $_; exit 1 }" || goto :setup_error
echo Installing Python %PY_VERSION% into storage\python...
"%PY_INSTALLER%" /quiet InstallAllUsers=0 PrependPath=0 Include_test=0 SimpleInstall=1 TargetDir="%PY_STORAGE%" || goto :setup_error
if exist "%PY_INSTALLER%" del "%PY_INSTALLER%" >nul 2>nul
if not exist "%LOCAL_PYTHON%" goto :setup_error
exit /b 0

:setup_error
if exist "%PY_INSTALLER%" del "%PY_INSTALLER%" >nul 2>nul
echo Failed to provision a local Python runtime.
exit /b 1
