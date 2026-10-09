@echo off
setlocal
set "PROJECT_ROOT=%~dp0.."
powershell.exe -NoProfile -Command "$root=[IO.Path]::GetFullPath('%PROJECT_ROOT%'); foreach($name in @('backend','frontend')){ $file=Join-Path $root ('scripts\.'+$name+'.pid'); if(-not (Test-Path $file)){ Write-Output ($name+' PID file not found.'); continue }; $id=[int](Get-Content $file -Raw); $p=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$id); $expected=if($name -eq 'backend'){'backend[/\\]server\.py'}else{'npm\.cmd run dev:web'}; if($p -and $p.Name -eq 'cmd.exe' -and $p.CommandLine -match $expected){ taskkill.exe /PID $id /T /F }else{ Write-Output ($name+' launcher is no longer running; skipped PID '+$id) }; Remove-Item $file -Force }"
