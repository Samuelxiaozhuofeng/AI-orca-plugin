@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: Orca AI Plugin 自动部署脚本
:: 功能：复制 dist 文件夹到目标位置，并重启 Orca Note

title Orca AI Plugin 部署工具
color 0B

echo.
echo ========================================
echo    Orca AI Plugin 部署脚本
echo ========================================
echo.

:: 定义路径
set "SOURCE_PATH=D:\orca插件\AI plugin\dist"
set "TARGET_PATH=C:\Users\1\Documents\orca\plugins\AI\dist"
set "ORCA_EXE=D:\orcanote\Orca Note\Orca Note.exe"

:: 1. 检查源文件夹是否存在
echo [1/5] 检查源文件夹...
if not exist "%SOURCE_PATH%" (
    color 0C
    echo [错误] 源文件夹不存在: %SOURCE_PATH%
    pause
    exit /b 1
)
echo [√] 源文件夹存在
echo.

:: 2. 杀掉 Orca Note 进程（如果正在运行）
echo [2/5] 检查 Orca Note 进程...
tasklist /FI "IMAGENAME eq Orca Note.exe" 2>NUL | find /I /N "Orca Note.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [!] 发现 Orca Note 正在运行，正在关闭...
    taskkill /F /IM "Orca Note.exe" >nul 2>&1
    timeout /t 2 /nobreak >nul
    echo [√] Orca Note 已关闭
) else (
    echo [√] Orca Note 未运行
)
echo.

:: 3. 删除目标文件夹和缓存（如果存在）
echo [3/6] 删除旧的 dist 文件夹和缓存...
if exist "%TARGET_PATH%" (
    rd /s /q "%TARGET_PATH%"
    echo [√] 旧文件夹已删除
) else (
    echo [√] 目标位置无旧文件
)

:: 清除可能的应用缓存
set "ORCA_CACHE_PATH=%USERPROFILE%\Documents\orca\.cache"
if exist "%ORCA_CACHE_PATH%" (
    echo [!] 清除应用缓存...
    rd /s /q "%ORCA_CACHE_PATH%" 2>nul
    echo [√] 应用缓存已清除
)

:: 清除 Electron 缓存（如果存在）
set "ELECTRON_CACHE=%APPDATA%\orca"
if exist "%ELECTRON_CACHE%\Cache" (
    echo [!] 清除 Electron 缓存...
    rd /s /q "%ELECTRON_CACHE%\Cache" 2>nul
    rd /s /q "%ELECTRON_CACHE%\Code Cache" 2>nul
    rd /s /q "%ELECTRON_CACHE%\GPUCache" 2>nul
    echo [√] Electron 缓存已清除
)

echo.

:: 4. 复制新的 dist 文件夹
echo [4/6] 复制新的 dist 文件夹...
xcopy "%SOURCE_PATH%" "%TARGET_PATH%\" /E /I /Y >nul
if %ERRORLEVEL% equ 0 (
    echo [√] 文件复制完成
) else (
    color 0C
    echo [错误] 文件复制失败
    pause
    exit /b 1
)
echo.

:: 5. 启动 Orca Note
echo [5/6] 启动 Orca Note...
if exist "%ORCA_EXE%" (
    start "" "%ORCA_EXE%"
    echo [√] Orca Note 已启动
) else (
    color 0C
    echo [错误] Orca Note 可执行文件不存在: %ORCA_EXE%
    pause
    exit /b 1
)
echo.

:: 6. 等待应用完全启动
echo [6/6] 等待应用启动...
timeout /t 3 /nobreak >nul
echo [√] 应用已启动，缓存已清除
echo.

color 0A
echo ========================================
echo    部署完成！
echo ========================================
echo.
echo 按任意键退出...
pause >nul
