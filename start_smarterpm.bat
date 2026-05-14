@echo off
chcp 65001 >nul
cd /d "%~dp0"

call :load_host_port

echo.
echo ===== SmarterPM 启动 =====
echo 配置端口: %OPEN_PORT% （来自本目录 config.json，读不到则用默认 11011）
echo 浏览器将打开: http://%OPEN_HOST%:%OPEN_PORT%/
echo 关闭标题为「SmarterPM」的黑色窗口即可停止服务。
echo 也可双击 stop_smarterpm.bat 关闭。
echo.

if exist ".venv\Scripts\python.exe" (
  start "SmarterPM" /D "%~dp0" ".venv\Scripts\python.exe" -m backend.main
) else (
  echo [提示] 未找到 .venv，改用「python」。若失败请先在本文件夹打开命令行执行：
  echo   python -m venv .venv
  echo   .venv\Scripts\pip install -r requirements.txt
  echo.
  start "SmarterPM" /D "%~dp0" python -m backend.main
)

timeout /t 2 >nul
start "" "http://%OPEN_HOST%:%OPEN_PORT%/"
echo.
pause
goto :eof

:load_host_port
set "OPEN_HOST=127.0.0.1"
set "OPEN_PORT=11011"
for /f "tokens=1,2 delims=|" %%a in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$r=Join-Path (Get-Location).Path 'config.json'; if(-not(Test-Path -LiteralPath $r)){Write-Output '127.0.0.1|11011';exit}; try{$j=Get-Content -LiteralPath $r -Encoding UTF8 -Raw|ConvertFrom-Json;$h=$j.server.host;if([string]::IsNullOrWhiteSpace($h)){$h='127.0.0.1'}elseif($h -eq '0.0.0.0'){$h='127.0.0.1'};$p=$j.server.port;if($null -eq $p){$p=11011};Write-Output ($h+'|'+[string]$p)}catch{Write-Output '127.0.0.1|11011'}"') do (
  set "OPEN_HOST=%%a"
  set "OPEN_PORT=%%b"
)
exit /b
