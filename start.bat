@echo off
setlocal ENABLEDELAYEDEXPANSION
set "EXIT_CODE=0"

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

REM If no CLI arguments were supplied, start the full dev environment instead of
REM running a single command.
if "%~1"=="" goto :launch_dev_environment

echo.
echo Launching Lecture Tools CLI...
echo.
echo Hint: pass commands such as "overview" or "ingest" after start.bat.
echo Example: start.bat overview --style modern
echo Example: start.bat ingest --help
echo.
REM Launch the CLI directly so that stdout and stderr remain visible in this
REM window. This makes it easier to diagnose failures, especially when the
REM Python process exits with an error code.
"%VENV_PY%" "%SCRIPT_DIR%run.py" %*
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" goto :error
goto :cleanup

:launch_dev_environment
REM Launch the web GUI dev server and an activated CLI shell so contributors can
REM inspect and debug the stack locally.
echo.
echo No CLI arguments detected - launching the full development server stack...
echo (Pass commands such as "overview" to run the CLI directly.)
echo.

set "PNPM_CMD=pnpm"
call :ensure_pnpm
if errorlevel 1 goto :cleanup

if not exist "node_modules" (
    echo Installing JavaScript workspace dependencies...
    call %PNPM_CMD% install || goto :error
) else (
    echo JavaScript dependencies already installed. Skipping pnpm install.
)

echo.
echo Starting the Lecture Tools GUI dev server in a new window...
start "Lecture Tools GUI" cmd /k "cd /d \"%SCRIPT_DIR%\" && call %PNPM_CMD% --filter gui dev -- --host 127.0.0.1 --port 5173"
if errorlevel 1 (
    echo Failed to launch the GUI dev server window.
    set "EXIT_CODE=1"
    goto :cleanup
)

echo.
echo Opening a shell with the Python virtual environment activated...
start "Lecture Tools CLI" cmd /k "cd /d \"%SCRIPT_DIR%\" && call .venv\Scripts\activate && echo Virtual environment ready. && echo Run python run.py --help to explore CLI commands. && echo."
if errorlevel 1 (
    echo Failed to launch the CLI shell window.
    set "EXIT_CODE=1"
    goto :cleanup
)

echo.
echo Lecture Tools development services are starting.
echo   GUI URL: http://localhost:5173
echo Close the spawned windows to stop the servers.
set "EXIT_CODE=0"

:ensure_pnpm
where %PNPM_CMD% >nul 2>nul
if not errorlevel 1 (
    rem pnpm already available
    exit /b 0
)

echo pnpm was not detected on PATH. Attempting to set it up automatically...

where node >nul 2>nul
if errorlevel 1 (
    echo Error: Node.js 18 or later is required to run the JavaScript tooling.
    echo Please install Node.js from https://nodejs.org/ and run this script again.
    set "EXIT_CODE=1"
    exit /b 1
)

where corepack >nul 2>nul
if not errorlevel 1 (
    echo Enabling pnpm via Corepack...
    corepack enable pnpm >nul 2>nul
    where %PNPM_CMD% >nul 2>nul
    if not errorlevel 1 exit /b 0
)

where npm >nul 2>nul
if not errorlevel 1 (
    echo Installing pnpm globally via npm...
    npm install -g pnpm || goto :pnpm_install_failed
    where %PNPM_CMD% >nul 2>nul
    if not errorlevel 1 exit /b 0
)

:pnpm_install_failed
echo Error: Could not provision pnpm automatically.
echo If pnpm remains unavailable, install it manually following https://pnpm.io/installation.
set "EXIT_CODE=1"
exit /b 1

:cleanup
popd >nul
endlocal & exit /b %EXIT_CODE%

:error
if not defined EXIT_CODE set "EXIT_CODE=1"
echo.
echo An error occurred while preparing or running Lecture Tools.
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
