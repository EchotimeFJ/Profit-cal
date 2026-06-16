# Profit Cal - 命令速查

## 🚀 快速命令

### 启动服务
```bash
procal start
```
启动后端（8002端口）和前端（8001端口）

### 停止服务
```bash
procal stop
```
停止所有服务

### 重启服务
```bash
procal restart
```
先停止再启动

### 查看状态
```bash
procal status
```
显示所有服务的运行状态和访问地址

### 查看日志
```bash
procal logs
```
选择查看后端、前端或所有日志

## 📊 当前状态

当前服务正在运行：
- **后端**: http://localhost:8002
- **前端**: http://localhost:8001

## 🎯 常用场景

### 1. 每天开始工作时
```bash
procal start
```

### 2. 开发调试时
```bash
# 查看后端日志
procal logs
# 选择 1

# 查看前端日志  
procal logs
# 选择 2
```

### 3. 遇到问题时
```bash
# 重启所有服务
procal restart

# 查看状态
procal status
```

### 4. 每天结束时
```bash
procal stop
```

## 🆘 故障排除

### 端口被占用
```bash
# 查看端口占用
lsof -i :8001
lsof -i :8002

# 手动杀死进程
kill -9 <PID>
```

### 服务启动失败
```bash
# 检查日志
procal logs

# 重新安装依赖
cd backend
pip3 install -r requirements.txt

cd frontend
npm install
```

### 重置所有服务
```bash
procal stop
pkill -f "python.*app.py"
pkill -f vite
procal start
```

## 📝 帮助信息

```bash
procal
```

会显示完整的使用说明。

## 🔧 配置信息

- **项目路径**: `/Users/frankjia/project/Profit_Cal`
- **后端端口**: 8002
- **前端端口**: 8001 (默认)
- **日志文件**: 
  - `backend.log`
  - `frontend.log`
- **PID文件**:
  - `backend.pid`
  - `frontend.pid`

## 🌐 访问地址

启动成功后，访问地址会显示在终端：

```
🌐 访问地址: http://localhost:8001
```

## 📚 完整文档

查看完整文档：
```bash
cat README.md
```

或打开浏览器访问：
- 完整文档: `file:///Users/frankjia/project/Profit_Cal/README.md`

## 💡 提示

1. **别名已配置**: 在任意目录下输入 `procal` 即可使用
2. **后台运行**: 服务在后台运行，不会占用终端
3. **自动端口**: 如果默认端口被占用，会自动选择其他端口
4. **日志保留**: 日志文件会保留在项目根目录
5. **PID跟踪**: 使用PID文件跟踪服务进程

## 🔍 快速检查

### 检查服务状态
```bash
procal status
```

### 检查后端是否正常
```bash
curl http://localhost:8002
```

### 检查前端是否正常
```bash
curl http://localhost:8001 | head
```

### 检查端口占用
```bash
lsof -i :8001 -i :8002
```

## 🎉 成功标志

当你看到以下输出时，表示服务启动成功：

```
======================================
       启动 Profit Cal
======================================

启动后端服务...
✓ 后端服务已启动 (PID: xxxxx)
启动前端服务...
✓ 前端服务已启动 (PID: xxxxx) - 端口: 8001

🌐 访问地址: http://localhost:8001
```
