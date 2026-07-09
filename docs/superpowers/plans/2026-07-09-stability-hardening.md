# 稳定性增强更新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为当前仓库补齐自动化校验、前端环境说明、冒烟文档、关键后端日志和少量高价值回归保护，让现有登录、资产、提醒主链路具备更稳的上线前保护层。

**Architecture:** 本次更新不引入新业务页面或数据库变更，而是在现有前后端主链路外增加一层“验证与可观测性”能力。实现分为仓库级自动化、文档与环境固化、后端日志增强三块，尽量保持每个任务都能独立验证并单独提交。

**Tech Stack:** GitHub Actions, Flask, Python unittest, compileall, React, Vite, TypeScript, npm

---

## File Map

- Create: `.github/workflows/ci.yml`
- Create: `.nvmrc`
- Create: `docs/smoke-tests.md`
- Modify: `README.md`
- Modify: `backend/routes/auth.py`
- Modify: `backend/routes/assets.py`
- Modify: `backend/routes/alerts.py`
- Modify: `backend/routes/prices.py`

## Task 1: 仓库自动化校验

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.nvmrc`
- Modify: `README.md`

- [ ] **Step 1: 写出失败前提的最小计划注释**

先在计划里明确本任务的验收命令，避免后面 workflow 写偏：

```yaml
# backend
cd backend
./venv/bin/python -m unittest test_auth_flows.py test_password_crypto.py test_password_hash_compat.py test_assets_add_position.py test_alert_reach.py
./venv/bin/python -m compileall routes/assets.py routes/alerts.py routes/prices.py test_assets_add_position.py test_alert_reach.py

# frontend
cd frontend
npm install
npm run build
```

- [ ] **Step 2: 新增 Node 版本声明**

创建 `.nvmrc`，固定前端推荐环境版本：

```text
20
```

- [ ] **Step 3: 先写 workflow 文件骨架**

创建 `.github/workflows/ci.yml`：

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  backend-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"

  frontend-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: ".nvmrc"
```

- [ ] **Step 4: 补齐 backend-check 具体步骤**

在 `backend-check` job 中补上依赖安装和校验命令：

```yaml
  backend-check:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - name: Install backend dependencies
        run: |
          python -m venv venv
          . venv/bin/activate
          pip install --upgrade pip
          pip install -r requirements.txt
      - name: Run backend tests
        run: |
          . venv/bin/activate
          python -m unittest test_auth_flows.py test_password_crypto.py test_password_hash_compat.py test_assets_add_position.py test_alert_reach.py
      - name: Run backend compile checks
        run: |
          . venv/bin/activate
          python -m compileall routes/assets.py routes/alerts.py routes/prices.py test_assets_add_position.py test_alert_reach.py
```

- [ ] **Step 5: 补齐 frontend-build 具体步骤**

在 `frontend-build` job 中补上安装和构建命令：

```yaml
  frontend-build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: ".nvmrc"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json
      - name: Install frontend dependencies
        run: npm install
      - name: Build frontend
        run: npm run build
```

- [ ] **Step 6: 更新 README 的前端环境说明**

在 `README.md` 的前端相关部分补上 Node/npm 与构建说明，至少加入以下内容：

```md
### 前端环境要求

- Node.js 20
- npm 10 或兼容版本

### 前端安装与构建

```bash
cd frontend
npm install
npm run build
```

如果本地使用 `nvm`，可以执行：

```bash
nvm use
```
```

- [ ] **Step 7: 本地验证 workflow 相关文件**

Run:

```bash
git diff --check -- .github/workflows/ci.yml .nvmrc README.md
```

Expected:

```text
无输出，退出码 0
```

- [ ] **Step 8: Commit**

```bash
git add .github/workflows/ci.yml .nvmrc README.md
git commit -m "ci: add automated backend and frontend checks"
```

## Task 2: 冒烟清单与运行说明

**Files:**
- Create: `docs/smoke-tests.md`
- Modify: `README.md`

- [ ] **Step 1: 创建冒烟清单文档**

新增 `docs/smoke-tests.md`：

```md
# 冒烟测试清单

## 登录与账号

- [ ] 注册成功
- [ ] 登录成功
- [ ] 退出后再次登录成功
- [ ] 忘记密码后可重新登录

## 资产链路

- [ ] 新增资产成功
- [ ] 加仓成功，主页持仓更新
- [ ] 部分卖出成功，交易历史新增 sell 记录
- [ ] 清仓卖出成功，资产消失且关联提醒被清理
- [ ] 删除资产成功，关联提醒被清理

## 提醒链路

- [ ] 创建 above 提醒成功
- [ ] 创建 below 提醒成功
- [ ] 创建 reach 提醒成功
- [ ] 提醒触发后主页横幅文案正确
- [ ] 编辑已有提醒时不允许切换提醒来源
```

- [ ] **Step 2: 在 README 中挂出冒烟文档入口**

在 `README.md` 增加一段：

```md
## 验证

核心功能上线前请至少执行：

- 后端测试与编译检查
- 前端构建
- 冒烟测试清单：`docs/smoke-tests.md`
```

- [ ] **Step 3: 检查文档是否自洽**

Run:

```bash
grep -n "冒烟测试清单\|前端环境要求\|前端安装与构建" README.md docs/smoke-tests.md
```

Expected:

```text
能看到对应标题或段落
```

- [ ] **Step 4: Commit**

```bash
git add docs/smoke-tests.md README.md
git commit -m "docs: add smoke test checklist and setup guidance"
```

## Task 3: 后端关键日志增强

**Files:**
- Modify: `backend/routes/auth.py`
- Modify: `backend/routes/assets.py`
- Modify: `backend/routes/alerts.py`
- Modify: `backend/routes/prices.py`

- [ ] **Step 1: 在 auth 路由中加入 logger**

在 `backend/routes/auth.py` 顶部加入标准库 logger：

```python
import logging

logger = logging.getLogger(__name__)
```

- [ ] **Step 2: 为登录与密码重置补轻量日志**

在 `login()`、`register()`、`forgot_password()`、`change_password()` 中只记录关键状态，不记录密码：

```python
logger.info("auth.login.success user_id=%s", user.id)
logger.warning("auth.login.invalid_credentials identifier=%s", identifier)
logger.info("auth.register.success user_id=%s", user.id)
logger.info("auth.password_reset.success user_id=%s", user.id)
```

- [ ] **Step 3: 为资产写操作补轻量日志**

在 `backend/routes/assets.py` 中加入 logger，并在新增、更新、卖出、加仓、删除后记录：

```python
import logging

logger = logging.getLogger(__name__)
```

```python
logger.info("assets.create.success user_id=%s asset_id=%s", user_id, asset.id)
logger.info("assets.update.success user_id=%s asset_id=%s", user_id, asset.id)
logger.info("assets.sell.success user_id=%s asset_id=%s closed=%s", user_id, asset.id, asset_closed)
logger.info("assets.add_position.success user_id=%s asset_id=%s", user_id, asset.id)
logger.info("assets.delete.success user_id=%s asset_id=%s", user_id, asset_id)
```

- [ ] **Step 4: 为提醒写操作和触发补轻量日志**

在 `backend/routes/alerts.py` 与 `backend/routes/prices.py` 中加入 logger：

```python
import logging

logger = logging.getLogger(__name__)
```

为提醒新增、更新、删除、触发加日志：

```python
logger.info("alerts.create.success user_id=%s kind=%s alert_id=%s", user_id, "asset", alert.id)
logger.info("alerts.update.success user_id=%s kind=%s alert_id=%s", user_id, kind, alert.id)
logger.info("alerts.delete.success user_id=%s kind=%s alert_id=%s", user_id, kind, alert.id)
logger.info("alerts.triggered user_id=%s kind=%s alert_id=%s", alert.user_id, "asset", alert.id)
```

- [ ] **Step 5: 保持日志克制，不给高频读取接口加明细日志**

检查代码时遵守这个限制：

```python
# 不要给这些路径加逐请求 info 日志
# get_assets()
# get_alerts()
# get_portfolio_prices()
```

- [ ] **Step 6: 运行后端回归测试**

Run:

```bash
cd backend
./venv/bin/python -m unittest test_auth_flows.py test_password_crypto.py test_password_hash_compat.py test_assets_add_position.py test_alert_reach.py
```

Expected:

```text
Ran ... tests
OK
```

- [ ] **Step 7: 运行编译校验**

Run:

```bash
cd backend
./venv/bin/python -m compileall routes/auth.py routes/assets.py routes/alerts.py routes/prices.py test_auth_flows.py test_password_crypto.py test_password_hash_compat.py test_assets_add_position.py test_alert_reach.py
```

Expected:

```text
退出码 0
```

- [ ] **Step 8: Commit**

```bash
git add backend/routes/auth.py backend/routes/assets.py backend/routes/alerts.py backend/routes/prices.py
git commit -m "feat: add lightweight backend audit logging"
```

## Task 4: 最终验证与仓库收口

**Files:**
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/smoke-tests.md`

- [ ] **Step 1: 本地执行完整后端验证**

Run:

```bash
cd backend
./venv/bin/python -m unittest test_auth_flows.py test_password_crypto.py test_password_hash_compat.py test_assets_add_position.py test_alert_reach.py
./venv/bin/python -m compileall routes/auth.py routes/assets.py routes/alerts.py routes/prices.py test_auth_flows.py test_password_crypto.py test_password_hash_compat.py test_assets_add_position.py test_alert_reach.py
```

Expected:

```text
tests OK
compileall 退出码 0
```

- [ ] **Step 2: 本地执行前端构建**

Run:

```bash
cd frontend
npm install
npm run build
```

Expected:

```text
vite build 成功
```

- [ ] **Step 3: 检查仓库变更范围**

Run:

```bash
git status --short
```

Expected:

```text
只出现本计划涉及的文件
```

- [ ] **Step 4: 再读一遍 README 和冒烟文档**

人工检查以下内容是否一致：

```md
- README 中的环境要求与 .nvmrc 一致
- README 中的构建命令与 package.json scripts 一致
- 冒烟清单覆盖本轮重点链路
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .nvmrc README.md docs/smoke-tests.md
git commit -m "chore: finalize stability hardening rollout"
```
