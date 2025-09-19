@echo off
setlocal ENABLEDELAYEDEXPANSION

REM Determine repository root based on the location of this script
set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%" >nul

REM Prefer an existing virtual environment if it already exists
set "VENV_PY=.venv\Scripts\python.exe"
if exist "%VENV_PY%" goto :use_venv

REM Locate a suitable system Python interpreter (3.11+)
set "PYTHON_BASE="
for /f "usebackq delims=" %%I in (`py -3.11 -c "import sys; print(sys.executable)" 2^>nul`) do set "PYTHON_BASE=%%I"
if not defined PYTHON_BASE (
    for /f "usebackq delims=" %%I in (`py -3 -c "import sys; print(sys.executable)" 2^>nul`) do set "PYTHON_BASE=%%I"
)
if not defined PYTHON_BASE (
    for /f "usebackq delims=" %%I in (`python -c "import sys; print(sys.executable)" 2^>nul`) do set "PYTHON_BASE=%%I"
)
if not defined PYTHON_BASE (
    echo Could not find a Python interpreter. Please install Python 3.11 or later.
    goto :error
)

for /f "usebackq tokens=1-3 delims=." %%A in (`"%PYTHON_BASE%" -c "import sys; print('.'.join(map(str, sys.version_info[:3])))"`) do (
    set "PY_MAJOR=%%A"
    set "PY_MINOR=%%B"
)
if NOT "!PY_MAJOR!"=="3" goto :bad_version
for %%V in (!PY_MINOR!) do if %%V LSS 11 goto :bad_version

if not exist ".venv" (
    echo Creating virtual environment...
    "%PYTHON_BASE%" -m venv .venv || goto :error
)

:use_venv
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
echo Launching Lecture Tools CLI...
if "%~1"=="" (
    echo Hint: pass commands such as "overview" or "ingest" after start.bat.
    echo Example: start.bat overview
    echo Example: start.bat ingest --help
    echo.
)
"%VENV_PY%" "%SCRIPT_DIR%run.py" %*
set "EXIT_CODE=%ERRORLEVEL%"

:cleanup
popd >nul
endlocal & exit /b %EXIT_CODE%

:bad_version
echo Python 3.11 or newer is required. Found version !PY_MAJOR!.!PY_MINOR!.
goto :error

:error
set "EXIT_CODE=1"
goto :cleanup
