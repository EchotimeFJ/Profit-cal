#!/bin/bash

echo "=== Profit Cal - 资产管理与价格监控 ==="
echo ""

# 检查是否有 Python
if ! command -v python3 &> /dev/null; then
    echo "错误: 找不到 Python3，请先安装 Python"
    exit 1
fi

# 检查是否有 npm
if ! command -v npm &> /dev/null; then
    echo "错误: 找不到 npm，请先安装 Node.js"
    exit 1
fi

echo "1. 安装后端依赖..."
cd backend
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt
cd ..

echo ""
echo "2. 安装前端依赖..."
cd frontend
npm install
cd ..

echo ""
echo "3. 启动服务..."
echo "后端将在 http://localhost:5001 运行"
echo "前端将在 http://localhost:5173 运行"
echo ""
echo "按 Ctrl+C 停止服务"
echo ""

# 在后台启动后端
cd backend
source venv/bin/activate
flask run --port 5001 &
BACKEND_PID=$!
cd ..

# 等待后端启动
sleep 3

# 启动前端
cd frontend
npm run dev &
FRONTEND_PID=$!

# 等待用户中断
wait $FRONTEND_PID $BACKEND_PID
