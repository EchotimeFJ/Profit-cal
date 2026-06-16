@echo off
echo === Profit Cal - 资产管理与价格监控 ===
echo.

REM 检查是否有 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 找不到 Python，请先安装 Python
    exit /b 1
)

REM 检查是否有 npm
npm --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 找不到 npm，请先安装 Node.js
    exit /b 1
)

echo 1. 安装后端依赖...
cd backend
if not exist "venv" (
    python -m venv venv
)
call venv\Scripts\activate.bat
pip install -r requirements.txt
cd ..

echo.
echo 2. 安装前端依赖...
cd frontend
call npm install
cd ..

echo.
echo 3. 启动服务...
echo 后端将在 http://localhost:5001 运行
echo 前端将在 http://localhost:5173 运行
echo.
echo 请按 Ctrl+C 停止服务，或关闭此窗口
echo.

REM 在新窗口启动后端
cd backend
call venv\Scripts\activate.bat
start "Profit Cal Backend" flask run --port 5001
cd ..

REM 等待后端启动
timeout /t 3 /nobreak >nul

REM 在新窗口启动前端
cd frontend
start "Profit Cal Frontend" npm run dev
cd ..

echo.
echo 服务已启动！
echo.
pause
