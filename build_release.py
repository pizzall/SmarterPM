#!/usr/bin/env python3
"""SmarterPM 发布包构建脚本

将 Python embeddable 发行版 + 所有依赖 + 项目代码打包成一个 ZIP，
非技术用户解压后双击 BAT 即可运行，无需安装任何环境。

用法:
    python build_release.py               # 构建 v1.0
    python build_release.py --version 1.1 # 指定版本号

输出:
    dist/SmarterPM-v{VERSION}-win64.zip
"""

import argparse
import json
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

# ── 配置 ─────────────────────────────────────────────────────────────────────

PYTHON_VERSION = "3.12.9"
PYTHON_EMBED_URL = (
    f"https://www.python.org/ftp/python/{PYTHON_VERSION}/"
    f"python-{PYTHON_VERSION}-embed-amd64.zip"
)
GET_PIP_URL = "https://bootstrap.pypa.io/get-pip.py"

PROJECT_ROOT = Path(__file__).resolve().parent
DIST_DIR = PROJECT_ROOT / "dist"

INCLUDE_DIRS = ["backend", "frontend"]
INCLUDE_FILES = ["database.json", "requirements.txt"]
EXCLUDE_NAMES = {"__pycache__", ".venv", "dist", ".git", ".claude", ".playwright-mcp", "backups", "node_modules"}
EXCLUDE_EXTS = {".pyc", ".pyo"}

# ── 用户脚本内容（内嵌，避免额外模板文件）────────────────────────────────────

START_BAT = """\
@echo off
chcp 65001 >nul
cd /d "%~dp0"

call :load_host_port

echo.
echo ===== SmarterPM 启动 =====
echo 访问地址: http://%OPEN_HOST%:%OPEN_PORT%/
echo 关闭标题为「SmarterPM」的黑色窗口即可停止服务。
echo 也可双击「停止SmarterPM.bat」关闭。
echo.

start "SmarterPM" /D "%~dp0" "%~dp0_python\\python.exe" -m backend.main

timeout /t 3 >nul
start "" "http://%OPEN_HOST%:%OPEN_PORT%/"
echo 浏览器已自动打开，按任意键关闭此窗口...
pause >nul
goto :eof

:load_host_port
set "OPEN_HOST=127.0.0.1"
set "OPEN_PORT=11011"
for /f "tokens=1,2 delims=|" %%a in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$r=Join-Path (Get-Location).Path 'config.json'; if(-not(Test-Path -LiteralPath $r)){Write-Output '127.0.0.1|11011';exit}; try{$j=Get-Content -LiteralPath $r -Encoding UTF8 -Raw|ConvertFrom-Json;$h=$j.server.host;if([string]::IsNullOrWhiteSpace($h)){$h='127.0.0.1'}elseif($h -eq '0.0.0.0'){$h='127.0.0.1'};$p=$j.server.port;if($null -eq $p){$p=11011};Write-Output ($h+'|'+[string]$p)}catch{Write-Output '127.0.0.1|11011'}"') do (
  set "OPEN_HOST=%%a"
  set "OPEN_PORT=%%b"
)
exit /b
"""

STOP_BAT = """\
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
"""

README_TXT = """\
SmarterPM 使用说明
==================

【快速开始】
1. 双击「启动SmarterPM.bat」
2. 等待黑色窗口出现，浏览器会自动打开
3. 开始使用（无需任何安装）

【停止服务】
关闭标题为「SmarterPM」的黑色窗口，或双击「停止SmarterPM.bat」。

【启用 AI 功能】
1. 用记事本打开 config.json
2. 将 api_key 的值改为你的真实 API Key
   例如: "api_key": "sk-xxxxxxxxxxxxxxxx"
3. 保存文件后重启服务（停止 → 再启动）

推荐使用 DeepSeek API（https://platform.deepseek.com/）
或任何兼容 OpenAI 格式的服务（在 base_url 中填写对应地址）。

【数据存储】
所有数据保存在 database.json 文件中。
系统会在每次修改前自动备份到 backups/ 目录（最多保留 20 份）。

【注意事项】
- 请勿删除 _python 目录（内置运行环境）
- 可以将整个文件夹移动到任意位置
- 仅支持 64 位 Windows 10 / 11
"""

DEFAULT_CONFIG = {
    "server": {
        "host": "127.0.0.1",
        "port": 11011
    },
    "llm": {
        "base_url": "https://api.deepseek.com/v1",
        "api_key": "",
        "model": "deepseek-chat",
        "temperature": 0.4,
        "timeout": 60
    },
    "storage": {
        "database_file": "database.json",
        "backup_dir": "backups",
        "max_backups": 20
    }
}

# ── 辅助函数 ──────────────────────────────────────────────────────────────────

def step(msg: str) -> None:
    print(f"\n[>>] {msg}")


def ok(msg: str = "") -> None:
    print(f"    OK  {msg}" if msg else "    OK")


def fail(msg: str) -> None:
    print(f"\n[!!] {msg}", file=sys.stderr)
    sys.exit(1)


def _reporthook(block: int, block_size: int, total: int) -> None:
    if total > 0:
        pct = min(100, block * block_size * 100 // total)
        print(f"\r      {pct}%...", end="", flush=True)


def download(url: str, dest: Path, label: str) -> None:
    if dest.exists():
        print(f"    · {label} 已缓存，跳过下载")
        return
    print(f"    · 正在下载 {label}...")
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        urllib.request.urlretrieve(url, dest, reporthook=_reporthook)
        print()
    except Exception as e:
        dest.unlink(missing_ok=True)
        fail(f"下载失败 ({url}): {e}")
    ok(f"{dest.name}")


def copytree_filtered(src: Path, dst: Path) -> None:
    dst.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        if item.name in EXCLUDE_NAMES:
            continue
        if item.suffix in EXCLUDE_EXTS:
            continue
        if item.is_dir():
            copytree_filtered(item, dst / item.name)
        else:
            shutil.copy2(item, dst / item.name)


# ── 主构建逻辑 ────────────────────────────────────────────────────────────────

def build(version: str) -> None:
    release_name = f"SmarterPM-v{version}-win64"
    release_dir = DIST_DIR / release_name
    python_dir = release_dir / "_python"
    cache_dir = DIST_DIR / ".cache"

    print(f"\n{'='*52}")
    print(f"  SmarterPM 发布包构建器")
    print(f"  版本: v{version}   →   {release_name}.zip")
    print(f"  Python: {PYTHON_VERSION} embeddable (win64)")
    print(f"{'='*52}")

    # 清理旧发布目录
    if release_dir.exists():
        step("清理旧发布目录...")
        shutil.rmtree(release_dir)
        ok()
    release_dir.mkdir(parents=True)
    python_dir.mkdir()

    # ① 下载 Python embeddable
    step(f"下载 Python {PYTHON_VERSION} embeddable...")
    python_zip = cache_dir / f"python-{PYTHON_VERSION}-embed-amd64.zip"
    download(PYTHON_EMBED_URL, python_zip, f"python-{PYTHON_VERSION}-embed-amd64.zip")

    # ② 解压 Python
    step("解压 Python...")
    with zipfile.ZipFile(python_zip) as zf:
        zf.extractall(python_dir)
    ok(f"解压到 _python/ ({sum(1 for _ in python_dir.iterdir())} 个文件)")

    # ③ 修复 _pth 文件（启用 site-packages，这是关键步骤）
    step("启用 site-packages（修改 _pth 文件）...")
    pth_ver = PYTHON_VERSION.replace(".", "")[:3]  # "3.12.9" → "312"
    pth_file = python_dir / f"python{pth_ver}._pth"
    if not pth_file.exists():
        fail(f"找不到 {pth_file.name}，Python 版本可能不兼容")
    content = pth_file.read_text(encoding="utf-8")
    if "#import site" in content:
        content = content.replace("#import site", "import site")
        pth_file.write_text(content, encoding="utf-8")
        ok(f"已修改 {pth_file.name}")
    else:
        ok(f"{pth_file.name} 已是正确状态")

    # ④ 引导安装 pip
    step("安装 pip（通过 get-pip.py）...")
    get_pip = cache_dir / "get-pip.py"
    download(GET_PIP_URL, get_pip, "get-pip.py")
    python_exe = python_dir / "python.exe"
    result = subprocess.run(
        [str(python_exe), str(get_pip), "--no-warn-script-location"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        fail(f"pip 安装失败:\n{result.stderr}")
    ok("pip 安装成功")

    # ⑤ 安装依赖包
    step("安装依赖包（来自 requirements.txt）...")
    req_file = PROJECT_ROOT / "requirements.txt"
    if not req_file.exists():
        fail("找不到 requirements.txt")
    result = subprocess.run(
        [str(python_exe), "-m", "pip", "install",
         "-r", str(req_file),
         "--no-warn-script-location"],
    )
    if result.returncode != 0:
        fail("依赖安装失败")
    ok("所有依赖安装完成")

    # ⑥ 复制项目文件
    step("复制项目文件...")
    for d in INCLUDE_DIRS:
        src = PROJECT_ROOT / d
        if not src.exists():
            print(f"    · 警告：{d}/ 不存在，跳过")
            continue
        copytree_filtered(src, release_dir / d)
        ok(f"{d}/")

    for f in INCLUDE_FILES:
        src = PROJECT_ROOT / f
        if src.exists():
            shutil.copy2(src, release_dir / f)
            ok(f"{f}")
        else:
            print(f"    · {f} 不存在，跳过")

    # ⑦ 写入 config.json（api_key 留空 = 离线模式）
    step("生成 config.json...")
    config_path = release_dir / "config.json"
    config_path.write_text(
        json.dumps(DEFAULT_CONFIG, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    ok("api_key 留空，启动后为离线模式（可手动填入 Key 开启 AI）")

    # ⑧ 创建 backups 目录
    (release_dir / "backups").mkdir()

    # ⑨ 写入用户脚本
    step("生成用户脚本...")
    (release_dir / "启动SmarterPM.bat").write_text(START_BAT, encoding="utf-8")
    ok("启动SmarterPM.bat")
    (release_dir / "停止SmarterPM.bat").write_text(STOP_BAT, encoding="utf-8")
    ok("停止SmarterPM.bat")
    (release_dir / "使用说明.txt").write_text(README_TXT, encoding="utf-8")
    ok("使用说明.txt")

    # ⑩ 压缩为 ZIP
    step("打包 ZIP...")
    zip_path = DIST_DIR / f"{release_name}.zip"
    zip_path.unlink(missing_ok=True)
    file_count = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for file in sorted(release_dir.rglob("*")):
            if file.is_file():
                arcname = file.relative_to(DIST_DIR)
                zf.write(file, arcname)
                file_count += 1
    size_mb = zip_path.stat().st_size / 1024 / 1024
    ok(f"共打包 {file_count} 个文件")

    print(f"\n{'='*52}")
    print(f"  [OK] Build complete!")
    print(f"  -->  {zip_path}")
    print(f"  Size: {size_mb:.1f} MB")
    print(f"{'='*52}\n")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="SmarterPM 发布包构建脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="示例:\n  python build_release.py\n  python build_release.py --version 1.1"
    )
    parser.add_argument("--version", default="1.0", metavar="X.Y", help="版本号（默认: 1.0）")
    args = parser.parse_args()
    build(args.version)


if __name__ == "__main__":
    main()
