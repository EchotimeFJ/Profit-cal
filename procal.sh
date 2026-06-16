#!/bin/bash

# Profit Cal 启动/停止脚本

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_ROOT="/Users/frankjia/project/Profit_Cal"
BACKEND_PYTHON="$PROJECT_ROOT/backend/venv/bin/python"

# PID文件
BACKEND_PID_FILE="$PROJECT_ROOT/backend.pid"
FRONTEND_PID_FILE="$PROJECT_ROOT/frontend.pid"

# 端口
BACKEND_PORT=8002
FRONTEND_PORT=8001

# 从日志获取实际端口
get_actual_frontend_port() {
    if [ -f "$PROJECT_ROOT/frontend.log" ]; then
        local port=$(grep -oP "Local:\s+http://localhost:\K\d+" "$PROJECT_ROOT/frontend.log" 2>/dev/null | tail -1)
        if [ ! -z "$port" ]; then
            echo "$port"
        else
            echo "$FRONTEND_PORT"
        fi
    else
        echo "$FRONTEND_PORT"
    fi
}

# 检查进程是否运行
is_running() {
    local pid=$1
    if [ -z "$pid" ]; then
        return 1
    fi
    if ps -p "$pid" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# 启动后端
start_backend() {
    echo -e "${YELLOW}启动后端服务...${NC}"
    cd "$PROJECT_ROOT/backend"
    
    # 检查端口是否被占用
    if lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${RED}错误：端口 $BACKEND_PORT 已被占用${NC}"
        echo -e "${YELLOW}正在停止现有进程...${NC}"
        lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t | xargs kill -9 2>/dev/null
        sleep 1
    fi
    
    # 启动后端
    if [ ! -x "$BACKEND_PYTHON" ]; then
        BACKEND_PYTHON="python3"
    fi
    > "$PROJECT_ROOT/backend.log"
    FLASK_DEBUG=false FLASK_HOST=127.0.0.1 FLASK_PORT=$BACKEND_PORT nohup "$BACKEND_PYTHON" app.py > "$PROJECT_ROOT/backend.log" 2>&1 &
    local backend_pid=$!
    echo $backend_pid > "$BACKEND_PID_FILE"
    
    # 等待后端启动
    sleep 3
    
    if is_running $backend_pid; then
        echo -e "${GREEN}✓ 后端服务已启动 (PID: $backend_pid)${NC}"
    else
        echo -e "${RED}✗ 后端服务启动失败${NC}"
        cat "$PROJECT_ROOT/backend.log"
        return 1
    fi
}

# 启动前端
start_frontend() {
    echo -e "${YELLOW}启动前端服务...${NC}"
    cd "$PROJECT_ROOT/frontend"
    
    # 检查端口是否被占用
    if lsof -Pi :$FRONTEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}端口 $FRONTEND_PORT 被占用，Vite将自动选择可用端口${NC}"
    fi
    
    # 清空旧日志
    > "$PROJECT_ROOT/frontend.log"
    
    # 启动前端
    nohup npm run dev > "$PROJECT_ROOT/frontend.log" 2>&1 &
    local frontend_pid=$!
    echo $frontend_pid > "$FRONTEND_PID_FILE"
    
    # 等待前端启动并获取实际端口
    sleep 5
    
    if is_running $frontend_pid; then
        local actual_port=$(get_actual_frontend_port)
        echo -e "${GREEN}✓ 前端服务已启动 (PID: $frontend_pid) - 端口: $actual_port${NC}"
        echo -e "${GREEN}🌐 访问地址: http://localhost:$actual_port${NC}"
    else
        echo -e "${RED}✗ 前端服务启动失败${NC}"
        cat "$PROJECT_ROOT/frontend.log"
        return 1
    fi
}

# 停止后端
stop_backend() {
    if [ -f "$BACKEND_PID_FILE" ]; then
        local backend_pid=$(cat "$BACKEND_PID_FILE")
        if is_running $backend_pid; then
            echo -e "${YELLOW}停止后端服务 (PID: $backend_pid)...${NC}"
            kill $backend_pid 2>/dev/null
            sleep 2
            if ! is_running $backend_pid; then
                echo -e "${GREEN}✓ 后端服务已停止${NC}"
            else
                kill -9 $backend_pid 2>/dev/null
                echo -e "${GREEN}✓ 后端服务已强制停止${NC}"
            fi
        else
            echo -e "${YELLOW}后端服务未运行${NC}"
        fi
        rm "$BACKEND_PID_FILE"
    else
        # 尝试通过端口查找
        local pid=$(lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t 2>/dev/null)
        if [ ! -z "$pid" ]; then
            echo -e "${YELLOW}停止后端服务 (PID: $pid)...${NC}"
            kill $pid 2>/dev/null
            sleep 2
            echo -e "${GREEN}✓ 后端服务已停止${NC}"
        else
            echo -e "${YELLOW}后端服务未运行${NC}"
        fi
    fi
}

# 停止前端
stop_frontend() {
    if [ -f "$FRONTEND_PID_FILE" ]; then
        local frontend_pid=$(cat "$FRONTEND_PID_FILE")
        if is_running $frontend_pid; then
            echo -e "${YELLOW}停止前端服务 (PID: $frontend_pid)...${NC}"
            kill $frontend_pid 2>/dev/null
            sleep 2
            if ! is_running $frontend_pid; then
                echo -e "${GREEN}✓ 前端服务已停止${NC}"
            else
                kill -9 $frontend_pid 2>/dev/null
                echo -e "${GREEN}✓ 前端服务已强制停止${NC}"
            fi
        else
            echo -e "${YELLOW}前端服务未运行${NC}"
        fi
        rm "$FRONTEND_PID_FILE"
    else
        # 尝试停止所有Vite相关进程
        local pids=$(pgrep -f "vite")
        if [ ! -z "$pids" ]; then
            echo -e "${YELLOW}停止前端服务 (PIDs: $pids)...${NC}"
            echo $pids | xargs kill 2>/dev/null
            sleep 2
            echo -e "${GREEN}✓ 前端服务已停止${NC}"
        else
            echo -e "${YELLOW}前端服务未运行${NC}"
        fi
    fi
}

# 显示状态
show_status() {
    echo ""
    echo "======================================"
    echo "         Profit Cal 状态"
    echo "======================================"
    echo ""
    
    # 后端状态
    if [ -f "$BACKEND_PID_FILE" ]; then
        local backend_pid=$(cat "$BACKEND_PID_FILE")
        if is_running $backend_pid; then
            echo -e "${GREEN}✓${NC} 后端服务: 运行中 (PID: $backend_pid) - 端口: $BACKEND_PORT"
        else
            echo -e "${RED}✗${NC} 后端服务: 已停止 (PID文件过期)"
        fi
    else
        local pid=$(lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t 2>/dev/null)
        if [ ! -z "$pid" ]; then
            echo -e "${GREEN}✓${NC} 后端服务: 运行中 (PID: $pid) - 端口: $BACKEND_PORT"
        else
            echo -e "${RED}✗${NC} 后端服务: 已停止"
        fi
    fi
    
    # 前端状态
    local actual_frontend_port=$(get_actual_frontend_port)
    if [ -f "$FRONTEND_PID_FILE" ]; then
        local frontend_pid=$(cat "$FRONTEND_PID_FILE")
        if is_running $frontend_pid; then
            echo -e "${GREEN}✓${NC} 前端服务: 运行中 (PID: $frontend_pid) - 端口: $actual_frontend_port"
        else
            echo -e "${RED}✗${NC} 前端服务: 已停止 (PID文件过期)"
        fi
    else
        local pid=$(lsof -Pi :$actual_frontend_port -sTCP:LISTEN -t 2>/dev/null)
        if [ ! -z "$pid" ]; then
            echo -e "${GREEN}✓${NC} 前端服务: 运行中 (PID: $pid) - 端口: $actual_frontend_port"
        else
            echo -e "${RED}✗${NC} 前端服务: 已停止"
        fi
    fi
    
    echo ""
    echo "======================================"
    echo ""
    
    # 检查是否有服务在运行
    local backend_running=false
    local frontend_running=false
    
    if [ -f "$BACKEND_PID_FILE" ]; then
        if is_running $(cat "$BACKEND_PID_FILE"); then
            backend_running=true
        fi
    elif lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        backend_running=true
    fi
    
    if [ -f "$FRONTEND_PID_FILE" ]; then
        if is_running $(cat "$FRONTEND_PID_FILE"); then
            frontend_running=true
        fi
    elif lsof -Pi :$actual_frontend_port -sTCP:LISTEN -t >/dev/null 2>&1; then
        frontend_running=true
    fi
    
    if $backend_running && $frontend_running; then
        echo -e "🌐 访问地址: ${GREEN}http://localhost:$actual_frontend_port${NC}"
    fi
    
    echo ""
}

# 主程序
case "$1" in
    start)
        echo "======================================"
        echo "       启动 Profit Cal"
        echo "======================================"
        echo ""
        start_backend
        start_frontend
        echo ""
        ;;
    stop)
        echo "======================================"
        echo "       停止 Profit Cal"
        echo "======================================"
        echo ""
        stop_frontend
        stop_backend
        echo ""
        echo -e "${GREEN}所有服务已停止${NC}"
        ;;
    restart)
        echo "======================================"
        echo "       重启 Profit Cal"
        echo "======================================"
        echo ""
        stop_frontend
        stop_backend
        sleep 2
        start_backend
        start_frontend
        echo ""
        ;;
    status)
        show_status
        ;;
    logs)
        echo "======================================"
        echo "         查看日志"
        echo "======================================"
        echo ""
        echo "选择查看的日志："
        echo "1) 后端日志"
        echo "2) 前端日志"
        echo "3) 所有日志"
        read -p "请输入选项 [1-3]: " choice
        case $choice in
            1)
                if [ -f "$PROJECT_ROOT/backend.log" ]; then
                    tail -50 "$PROJECT_ROOT/backend.log"
                else
                    echo -e "${RED}后端日志文件不存在${NC}"
                fi
                ;;
            2)
                if [ -f "$PROJECT_ROOT/frontend.log" ]; then
                    tail -50 "$PROJECT_ROOT/frontend.log"
                else
                    echo -e "${RED}前端日志文件不存在${NC}"
                fi
                ;;
            3)
                echo "=== 后端日志 ==="
                if [ -f "$PROJECT_ROOT/backend.log" ]; then
                    tail -30 "$PROJECT_ROOT/backend.log"
                else
                    echo -e "${RED}后端日志文件不存在${NC}"
                fi
                echo ""
                echo "=== 前端日志 ==="
                if [ -f "$PROJECT_ROOT/frontend.log" ]; then
                    tail -30 "$PROJECT_ROOT/frontend.log"
                else
                    echo -e "${RED}前端日志文件不存在${NC}"
                fi
                ;;
        esac
        ;;
    *)
        echo "用法: procal {start|stop|restart|status|logs}"
        echo ""
        echo "命令说明："
        echo "  start   - 启动后端和前端服务"
        echo "  stop    - 停止所有服务"
        echo "  restart - 重启所有服务"
        echo "  status  - 查看服务状态"
        echo "  logs    - 查看日志"
        echo ""
        exit 1
        ;;
esac

exit 0
