@echo off
setlocal
set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"

if not exist "%ROOT%\node_modules" (
  echo Dependencies are missing. Run npm.cmd install from the repository root first.
  exit /b 1
)
if not exist "%ROOT%\.venv\Scripts\python.exe" (
  echo Python virtual environment is missing. Run py -m venv .venv and install backend requirements first.
  exit /b 1
)
if exist "%ROOT%\scripts\.backend.pid" (
  echo Existing service PID files were found. Run scripts\stop.bat before starting again.
  exit /b 1
)
if exist "%ROOT%\scripts\.frontend.pid" (
  echo Existing service PID files were found. Run scripts\stop.bat before starting again.
  exit /b 1
)

powershell.exe -NoProfile -Command "$root=[IO.Path]::GetFullPath('%ROOT%'); $p=Start-Process -FilePath $env:ComSpec -ArgumentList @('/k','title EB Scheduling Backend & .venv\Scripts\python.exe backend\server.py') -WorkingDirectory $root -PassThru; Set-Content -Path (Join-Path $root 'scripts\.backend.pid') -Value $p.Id -NoNewline"
if errorlevel 1 exit /b 1
powershell.exe -NoProfile -Command "$root=[IO.Path]::GetFullPath('%ROOT%'); $p=Start-Process -FilePath $env:ComSpec -ArgumentList @('/k','title EB Scheduling Frontend & npm.cmd run dev:web') -WorkingDirectory $root -PassThru; Set-Content -Path (Join-Path $root 'scripts\.frontend.pid') -Value $p.Id -NoNewline"
