@echo off
chcp 65001 >nul
cd /d "%~dp0"

call :load_port

echo.
echo ===== SmarterPM 关闭 =====
echo 正在结束监听端口 %OPEN_PORT% 的进程...
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%OPEN_PORT% " ^| findstr LISTENING') do (
  echo 结束进程 PID %%a
  taskkill /F /PID %%a >nul 2>&1
)

echo.
echo 已完成（若没有运行中的服务，上面可能没有输出）。
pause
goto :eof

:load_port
set "OPEN_PORT=11011"
for /f "tokens=2 delims=|" %%p in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$r=Join-Path (Get-Location).Path 'config.json'; if(-not(Test-Path -LiteralPath $r)){Write-Output 'x|11011';exit}; try{$j=Get-Content -LiteralPath $r -Encoding UTF8 -Raw|ConvertFrom-Json;$p=$j.server.port;if($null -eq $p){$p=11011};Write-Output ('x|'+[string]$p)}catch{Write-Output 'x|11011'}"') do set "OPEN_PORT=%%p"
exit /b
