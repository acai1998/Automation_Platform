@echo off
REM 自动化测试平台 - 快速部署脚本（Windows）
REM Automation Platform - Quick Setup Script for Windows

setlocal enabledelayedexpansion

REM 颜色定义
set "GREEN=[92m"
set "YELLOW=[93m"
set "RED=[91m"
set "BLUE=[94m"
set "RESET=[0m"

REM 欢迎信息
cls
echo.
echo ============================================================
echo     自动化测试平台 - 快速部署脚本
echo     Automation Platform - Quick Setup Script
echo ============================================================
echo.

REM 检查 Node.js
echo [INFO] 检查 Node.js 环境...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] 未检测到 Node.js，请先安装 Node.js 18.0.0 或更高版本
    echo.
    echo 访问 https://nodejs.org 下载安装
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo [SUCCESS] Node.js 已安装: %NODE_VERSION%

REM 检查 npm
echo [INFO] 检查 npm 环境...

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] 未检测到 npm，请重新安装 Node.js
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo [SUCCESS] npm 已安装: %NPM_VERSION%

echo.

REM 检查项目目录
if not exist "package.json" (
    echo [ERROR] 当前目录不是项目根目录，请确保在项目根目录运行此脚本
    pause
    exit /b 1
)

echo [SUCCESS] 检测到项目文件

REM 清理旧依赖（可选）
if exist "node_modules" (
    set /p CLEAN_DEPS="检测到已存在的 node_modules，是否删除并重新安装? (y/n): "
    if /i "!CLEAN_DEPS!"=="y" (
        echo [INFO] 删除旧的依赖...
        rmdir /s /q node_modules
        if exist "package-lock.json" del package-lock.json
        echo [SUCCESS] 已删除
    )
)

echo.
echo [INFO] 安装项目依赖...
echo 这可能需要几分钟，请耐心等待...
echo.

call npm install
if %errorlevel% neq 0 (
    echo [WARNING] 依赖安装可能出现问题，尝试使用 legacy peer deps...
    call npm install --legacy-peer-deps
    if %errorlevel% neq 0 (
        echo [ERROR] 依赖安装失败，请检查网络连接
        pause
        exit /b 1
    )
)

echo [SUCCESS] 依赖安装完成

echo.

REM 初始化数据库
echo [INFO] 初始化数据库...

call npm run db:init
if %errorlevel% neq 0 (
    echo [ERROR] 数据库初始化失败
    pause
    exit /b 1
)

echo [SUCCESS] 数据库初始化完成

echo.

REM 验证安装
echo [INFO] 验证安装...

set "all_ok=true"

if exist "package.json" (
    echo [SUCCESS] ✓ package.json
) else (
    echo [WARNING] ✗ package.json
    set "all_ok=false"
)

if exist "tsconfig.json" (
    echo [SUCCESS] ✓ tsconfig.json
) else (
    echo [WARNING] ✗ tsconfig.json
    set "all_ok=false"
)

if exist "src" (
    echo [SUCCESS] ✓ src
) else (
    echo [WARNING] ✗ src
    set "all_ok=false"
)

if exist "server" (
    echo [SUCCESS] ✓ server
) else (
    echo [WARNING] ✗ server
    set "all_ok=false"
)

if exist "node_modules" (
    echo [SUCCESS] ✓ node_modules
) else (
    echo [WARNING] ✗ node_modules
    set "all_ok=false"
)

if exist "server\db\autotest.db" (
    echo [SUCCESS] ✓ server/db/autotest.db
) else (
    echo [WARNING] ✗ server/db/autotest.db
    set "all_ok=false"
)

echo.

if "!all_ok!"=="true" (
    echo [SUCCESS] 所有文件检查通过！
) else (
    echo [WARNING] 部分文件缺失，但可能不影响正常运行
)

echo.
echo ============================================================
echo                   部署完成！
echo.
echo   接下来，您可以运行以下命令启动应用：
echo.
echo   启动前后端（推荐）：
echo     npm run start
echo.
echo   仅启动前端（Vite）：
echo     npm run dev
echo     访问: http://localhost:5173
echo.
echo   仅启动后端（Express）：
echo     npm run server
echo     访问: http://localhost:3000
echo.
echo   构建生产版本：
echo     npm run build
echo.
echo   重置数据库：
echo     npm run db:reset
echo.
echo ============================================================
echo.
echo [SUCCESS] 部署脚本执行完成！

pause