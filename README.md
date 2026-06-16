# Profit Cal - 快速启动指南

## 🚀 快速启动

项目启动命令已配置完成！你可以在任意终端目录下使用以下命令：

### 基本命令

```bash
procal start      # 启动所有服务
procal stop       # 停止所有服务
procal restart    # 重启所有服务
procal status     # 查看服务状态
procal logs       # 查看日志
```

### 首次使用

如果这是你第一次运行项目，请先安装后端依赖：

```bash
cd /Users/frankjia/project/Profit_Cal/backend
pip3 install -r requirements.txt
```

### 启动服务

```bash
procal start
```

成功启动后会显示：

```
======================================
       启动 Profit Cal
======================================

启动后端服务...
✓ 后端服务已启动 (PID: xxxxx)
启动前端服务...
✓ 前端服务已启动 (PID: xxxxx)

🌐 访问地址: http://localhost:3000
```

### 查看状态

```bash
procal status
```

示例输出：

```
======================================
         Profit Cal 状态
======================================

✓ 后端服务: 运行中 (PID: 75349) - 端口: 5001
✓ 前端服务: 运行中 (PID: 75354) - 端口: 3000

🌐 访问地址: http://localhost:3000
```

### 查看日志

```bash
procal logs
```

会提示选择查看：
1. 后端日志
2. 前端日志  
3. 所有日志

### 停止服务

```bash
procal stop
```

会停止所有服务：

```
======================================
       停止 Profit Cal
======================================

前端服务未运行
停止后端服务 (PID: 75349)...
✓ 后端服务已停止

所有服务已停止
```

### 重启服务

```bash
procal restart
```

等同于：先停止，再启动。

## 📂 项目结构

```
Profit_Cal/
├── backend/              # Flask 后端
│   ├── app.py           # 主应用
│   ├── db.py            # 数据库配置
│   ├── models.py        # 数据模型
│   ├── routes/          # API 路由
│   ├── services/        # 业务逻辑
│   └── requirements.txt # Python 依赖
├── frontend/            # React 前端
│   ├── src/            # 源代码
│   ├── package.json    # Node 依赖
│   └── dist/           # 构建输出
└── procal.sh          # 启动脚本
```

## 🔧 技术栈

### 后端
- Flask (Python Web 框架)
- SQLAlchemy (ORM)
- JWT (用户认证)
- Tushare Pro API (A股数据)
- Gate.io API (加密货币)
- CoinGecko API (加密货币和大宗商品)

### 前端
- React 18
- TypeScript
- Tailwind CSS
- Framer Motion (动画)
- Coinbase 设计风格

## 🌐 服务端口

- **前端**: http://localhost:3000
- **后端 API**: http://localhost:5001

## 📱 功能特性

1. **资产管理**
   - 支持 A股、港股、美股、加密货币、大宗商品
   - 实时价格更新（30秒间隔）
   - 盈亏统计

2. **价格提醒**
   - 自定义价格阈值
   - 弹窗和震动提醒
   - 实时监控

3. **数据分析**
   - 总盈亏计算
   - 当日盈亏
   - 多货币支持

## 🐛 故障排查

### 端口被占用

如果启动时提示端口被占用，脚本会自动尝试停止占用该端口的进程。

手动停止：

```bash
# 查看端口占用
lsof -i :3000
lsof -i :5001

# 停止进程
kill -9 <PID>
```

### 后端启动失败

检查后端日志：

```bash
procal logs
```

查看是否有依赖缺失：

```bash
cd backend
pip3 install -r requirements.txt
```

### 前端启动失败

检查前端日志：

```bash
procal logs
```

进入前端目录重新安装依赖：

```bash
cd frontend
npm install
```

## 📞 获取帮助

命令帮助：

```bash
procal
```

会显示：

```
用法: procal {start|stop|restart|status|logs}

命令说明：
  start   - 启动后端和前端服务
  stop    - 停止所有服务
  restart - 重启所有服务
  status  - 查看服务状态
  logs    - 查看日志
```

## 🎯 提示

- 服务会在后台运行，不会占用你的终端
- 所有日志文件保存在项目根目录
- PID 文件用于跟踪服务进程
- 重启前会自动停止现有服务
- 支持同时启动多个实例（需要修改端口配置）
