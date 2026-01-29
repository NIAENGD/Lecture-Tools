@echo off
setlocal ENABLEDELAYEDEXPANSION

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%" >nul

set "PYTHON_VERSION=3.11.9"
set "PYTHON_DIR=%SCRIPT_DIR%storage\python"
set "PYTHON_EXE=%PYTHON_DIR%\python.exe"
set "PYTHON_PTH=%PYTHON_DIR%\python311._pth"
set "PIP_SENTINEL=%SCRIPT_DIR%storage\.pip_ready"

call :ensure_storage
call :ensure_python
if errorlevel 1 goto :error

call :ensure_pip
if errorlevel 1 goto :error

call :ensure_requirements
if errorlevel 1 goto :error

"%PYTHON_EXE%" run.py %*
set "EXIT_CODE=%ERRORLEVEL%"
goto :cleanup

:ensure_storage
if not exist "%SCRIPT_DIR%storage" mkdir "%SCRIPT_DIR%storage" >nul 2>&1
exit /b 0

:ensure_python
if exist "%PYTHON_EXE%" exit /b 0

echo Local Python runtime not found. Downloading Python %PYTHON_VERSION%...
set "PYTHON_ZIP=python-%PYTHON_VERSION%-embed-amd64.zip"
set "PYTHON_URL=https://www.python.org/ftp/python/%PYTHON_VERSION%/%PYTHON_ZIP%"
set "PYTHON_ARCHIVE=%SCRIPT_DIR%storage\%PYTHON_ZIP%"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%PYTHON_URL%' -OutFile '%PYTHON_ARCHIVE%'"
if errorlevel 1 (
  echo Failed to download Python runtime.
  exit /b 1
)

echo Installing Python %PYTHON_VERSION% into storage\python...
if exist "%PYTHON_DIR%" rmdir /s /q "%PYTHON_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%PYTHON_ARCHIVE%' -DestinationPath '%PYTHON_DIR%' -Force"
if errorlevel 1 (
  echo Failed to extract Python runtime.
  exit /b 1
)

del /q "%PYTHON_ARCHIVE%" >nul 2>&1

if exist "%PYTHON_PTH%" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$pth = Get-Content -LiteralPath '%PYTHON_PTH%'; $pth = $pth | ForEach-Object { if ($_ -match '^#?import site') { 'import site' } else { $_ } }; if (-not ($pth -contains 'Lib\\site-packages')) { $pth += 'Lib\\site-packages' }; Set-Content -LiteralPath '%PYTHON_PTH%' -Value $pth -Encoding ASCII"
)

if not exist "%PYTHON_EXE%" (
  echo Failed to provision a local Python runtime.
  exit /b 1
)

exit /b 0

:ensure_pip
if exist "%PIP_SENTINEL%" exit /b 0
set "GET_PIP=%SCRIPT_DIR%storage\get-pip.py"
if not exist "%GET_PIP%" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile '%GET_PIP%'"
  if errorlevel 1 (
    echo Failed to download pip bootstrap.
    exit /b 1
  )
)

"%PYTHON_EXE%" "%GET_PIP%" --no-warn-script-location
if errorlevel 1 (
  echo Failed to install pip for the local Python runtime.
  exit /b 1
)

>"%PIP_SENTINEL%" echo ready
exit /b 0

:ensure_requirements
set "REQ_FILE=%SCRIPT_DIR%requirements-dev.txt"
if not exist "%REQ_FILE%" set "REQ_FILE=%SCRIPT_DIR%requirements.txt"
if not exist "%REQ_FILE%" exit /b 0

"%PYTHON_EXE%" -m pip install --disable-pip-version-check --no-warn-script-location -r "%REQ_FILE%"
if errorlevel 1 (
  echo Failed to install Python dependencies.
  exit /b 1
)

exit /b 0

:error
set "EXIT_CODE=1"

echo.
echo An error occurred while preparing or running Lecture Tools.
echo Exit code: %EXIT_CODE%

goto :cleanup

:cleanup
popd >nul
endlocal & exit /b %EXIT_CODE%
