# 当前持仓详情页与历史净值曲线设计

## 背景

当前网页版已经具备基础投资主链路：

- 用户可以注册、登录、退出后再次登录
- 用户可以新增资产、加仓、部分卖出和清仓卖出
- 主页可以展示当前持仓、实时价格、总盈亏和交易历史
- 提醒系统支持 `above`、`below`、`reach`
- CI 已覆盖后端测试、编译检查和前端构建

下一阶段目标是进入“产品闭环优先”的功能深化。第一步不做大而全的组合报表，也不先做清仓复盘，而是先把每个当前持仓做成可解释、可操作、可回归验证的详情页，并为组合级表现补上最小可用的历史净值曲线。

## 目标

新增一个当前持仓详情页，让用户可以从主页进入某个仍在持有的资产，查看：

- 当前价格和价格状态
- 当前持仓数量、平均成本、投入成本和持仓市值
- 未实现收益、收益率和当日收益
- 当前资产相关的买入、加仓、部分卖出交易时间线
- 当前资产历史部分卖出产生的已实现收益摘要
- 加仓、卖出、创建提醒等操作入口

同时新增组合历史净值曲线，让用户能看到自己组合总市值和累计收益的时间变化。第一版曲线以每日快照为主，不追求补齐过去所有真实每日行情。

成功标准：

- 主页当前持仓可以进入详情页
- 详情页只支持当前仍持有的资产
- 已清仓资产不展示详情页，后续交给历史分析和复盘模块
- 主页或分析区可以展示组合历史净值曲线
- 新增历史快照 schema 时必须提供非破坏式迁移
- 迁移过程必须保留旧资产、旧交易记录和旧组合缓存
- 后端详情接口不改写已有资产和交易记录
- 后端测试覆盖正常、越权、不存在、已清仓或无当前持仓、历史净值快照和迁移兼容等场景
- 前端构建通过，既有登录、资产、提醒回归测试继续通过

## 非目标

本阶段不包含：

- 清仓资产详情页
- 大而全的组合级收益报表
- 交易复盘备注、标签或策略系统
- 数据导入导出
- PWA、离线缓存或原生 App 外壳
- 会覆盖或重写历史资产、交易记录的数据迁移

## 数据约束

用户明确允许后续做数据库 schema 变更，但要求不能改变、破坏或覆盖已有数据。如果 schema 改变，必须提供数据迁移方案，并保证旧数据迁移到新能力可读的结构中。

当前持仓详情页优先不做数据库 schema 变更，直接复用：

- `Asset`：当前仍持有的资产
- `TradeRecord`：买入、加仓、卖出记录
- `PortfolioSnapshot`：组合缓存，保持现有失效机制

历史净值曲线需要新增持久化历史快照表，避免继续复用 `PortfolioSnapshot` 这种短期缓存表。建议新增：

```text
PortfolioHistorySnapshot
```

建议字段：

- `id`
- `user_id`
- `snapshot_date`
- `settlement_currency`
- `total_investment`
- `total_current_value`
- `total_profit`
- `total_profit_percent`
- `daily_profit`
- `payload`
- `created_at`
- `updated_at`

迁移规则：

- 只新增，不删除旧字段或旧表
- 不覆盖已有记录内容
- 旧数据读取逻辑保持兼容
- 新字段必须允许旧记录为空或有安全默认值
- 迁移脚本必须可重复执行，不重复插入同一天同币种快照
- 对已有用户至少回填一条初始历史快照
- 初始快照优先来自当前 `Asset` 实时估值；价格不可用时使用成本口径生成基线快照，并在 `payload` 标记 `baseline_source`
- 旧 `PortfolioSnapshot` 只作为缓存继续保留，不迁移为历史事实来源
- 迁移失败时不能删除或修改 `Asset`、`TradeRecord`、`Alert`、`CustomAlert`
- 测试必须覆盖旧数据仍可读取

## 范围

### 后端能力

新增当前持仓详情接口，建议路径：

```text
GET /api/assets/<asset_id>/detail
```

接口只返回当前登录用户名下、仍存在于 `Asset` 表中的资产详情。清仓资产当前会被删除，因此访问清仓后的 `asset_id` 应返回 404，并给出“资产不存在或已清仓”的错误文案。

响应建议结构：

```json
{
  "asset": {
    "id": 1,
    "name": "中国铝业",
    "symbol": "601600.SS",
    "asset_type": "a_stock",
    "currency": "CNY",
    "buy_price": 9.33,
    "quantity": 150
  },
  "price": {
    "current_price": 10.2,
    "previous_close": 10.0,
    "currency": "CNY",
    "source": "tushare",
    "quote_time": "2026-07-09T10:30:00"
  },
  "performance": {
    "investment": 1399.5,
    "current_value": 1530.0,
    "unrealized_profit": 130.5,
    "unrealized_profit_percent": 9.32,
    "daily_profit": 30.0,
    "daily_profit_percent": 2.0,
    "realized_profit": 80.0,
    "realized_profit_percent": 12.5
  },
  "records": []
}
```

计算规则：

- `investment = asset.buy_price * asset.quantity`
- `current_value = current_price * asset.quantity`
- `unrealized_profit = current_value - investment`
- `unrealized_profit_percent = unrealized_profit / investment * 100`
- `daily_profit = (current_price - previous_close) * asset.quantity`，仅当 `previous_close` 有效时计算
- `daily_profit_percent = (current_price - previous_close) / previous_close * 100`，仅当 `previous_close > 0` 时计算
- `realized_profit` 汇总该 `asset_id` 下 `action = sell` 且 `realized_profit` 非空的记录
- `realized_profit_percent` 可按卖出记录成本汇总后计算；如果成本为 0 或缺失则返回 `null`

异常规则：

- 资产不存在、已清仓或不属于当前用户：返回 404
- 价格获取失败：接口仍返回资产、交易记录和可计算的成本数据，`price.current_price` 为 `null`，收益相关字段为 `null`
- 价格币种与资产币种不一致：接口返回明确错误状态，不进行跨币种收益计算
- 非法 `asset_id` 由路由层处理

新增组合历史净值能力，建议路径：

```text
GET /api/portfolio/history
POST /api/portfolio/history/snapshot
```

接口职责：

- `GET /api/portfolio/history` 返回当前用户的历史快照，默认按日期升序，支持 `currency` 参数
- `POST /api/portfolio/history/snapshot` 为当前用户生成或更新当天快照，仅用于登录态用户主动刷新或后续定时任务复用
- 生成快照时复用现有组合估值逻辑，避免出现两套收益口径
- 同一用户、同一日期、同一结算币种只保留一条快照，重复生成时更新该快照，不插入重复点

历史净值响应建议结构：

```json
{
  "currency": "CNY",
  "points": [
    {
      "date": "2026-07-09",
      "total_investment": 10000.0,
      "total_current_value": 11200.0,
      "total_profit": 1200.0,
      "total_profit_percent": 12.0,
      "daily_profit": 80.0
    }
  ]
}
```

第一版曲线规则：

- 迁移时为已有用户回填一条初始基线快照
- `GET /api/portfolio/history` 只读，不生成快照，不产生数据库副作用
- 如果新用户没有历史快照，`GET /api/portfolio/history` 返回空数组和可读空状态
- 用户点击刷新组合后，通过 `POST /api/portfolio/history/snapshot` 生成或更新当天快照
- 新增、加仓、卖出、删除资产后不直接改写历史快照，只失效组合缓存；历史快照通过显式生成接口或后续定时任务记录
- 当天重复生成快照时允许更新当天点，因为当天仍处于变化中
- 历史日期快照不被普通资产操作回写

### 前端能力

新增页面：

```text
frontend/src/pages/AssetDetail.tsx
```

新增路由：

```text
/assets/:id/detail
```

主页入口：

- 当前持仓卡片增加“查看详情”入口，或卡片主体可点击进入详情
- 不为清仓历史记录提供详情入口

详情页布局：

- 顶部返回入口：返回主页
- 资产标题区：名称、代码、资产类型、币种
- 价格状态区：当前价、更新时间、价格来源、错误提示
- 持仓表现区：数量、平均成本、投入成本、市值、未实现收益、收益率、当日收益
- 已实现收益摘要：仅汇总当前资产历史部分卖出收益
- 交易时间线：当前资产相关买入、加仓、部分卖出记录，最新在前
- 操作区：加仓、卖出、创建提醒

历史净值曲线入口：

- 第一版建议放在主页组合概览下方，作为“组合历史净值”卡片
- 图表展示总市值曲线和累计收益曲线
- 点位不足 2 个时展示空状态：“暂无足够历史数据，今天开始记录”
- 移动端以横向可读的简化折线图展示，不要求复杂交互

移动端要求：

- 页面必须适配手机宽度
- 关键数字优先展示，不让操作按钮挤压收益信息
- 交易时间线在小屏下纵向展示

### 交互规则

- 点击主页当前持仓进入详情页
- 在详情页加仓或卖出成功后，刷新详情数据
- 如果卖出导致清仓，详情页显示“当前持仓已清仓”，并提供返回主页入口
- 创建提醒入口可以跳转到提醒页，第一版不强制预填表单
- 价格获取失败时，不阻塞用户查看成本和交易记录
- 打开主页时可以加载历史净值曲线
- 用户点击刷新组合后，可以生成或更新当天历史快照
- 历史净值曲线不允许用户手动编辑历史点

## 测试策略

### 后端测试

新增测试文件：

```text
backend/test_asset_detail.py
backend/test_portfolio_history.py
backend/test_schema_migration_compat.py
```

覆盖场景：

- 当前用户可以查看自己仍持有的资产详情
- 响应包含资产、价格、表现摘要和交易记录
- 交易记录按 `created_at desc, id desc` 排序
- 部分卖出后的 `realized_profit` 汇总正确
- 非本人资产返回 404
- 不存在或已清仓资产返回 404
- 价格获取失败时仍返回资产和交易记录，收益字段安全为 `null`
- 价格币种不一致时不误算收益
- 历史净值接口返回当前用户自己的快照
- 历史净值接口不会泄露其他用户快照
- 历史净值读取接口没有数据库写入副作用
- 没有历史快照的新用户会得到空数组
- 同一天同币种重复生成快照会更新而不是重复插入
- 迁移后旧资产、旧交易记录、旧提醒仍可读取
- 迁移对已有用户回填初始历史快照

回归测试继续运行：

```bash
cd backend
./venv/bin/python -m unittest test_auth_flows.py test_password_crypto.py test_password_hash_compat.py test_assets_add_position.py test_alert_reach.py test_asset_detail.py test_portfolio_history.py test_schema_migration_compat.py
./venv/bin/python -m compileall routes/auth.py routes/assets.py routes/alerts.py routes/prices.py test_auth_flows.py test_password_crypto.py test_password_hash_compat.py test_assets_add_position.py test_alert_reach.py test_asset_detail.py test_portfolio_history.py test_schema_migration_compat.py
```

### 前端验证

运行：

```bash
cd frontend
npm run build
```

验证重点：

- 新路由类型和构建通过
- 主页入口可达详情页
- 详情页加载、错误、已清仓提示状态清晰
- 历史净值曲线空状态、单点状态、多点状态清晰
- 移动端布局不遮挡关键操作

### 冒烟测试更新

更新 `docs/smoke-tests.md`，增加：

- 从主页进入当前持仓详情页
- 当前持仓详情页显示价格、成本、盈亏和交易时间线
- 详情页加仓后数据刷新
- 详情页部分卖出后数据刷新
- 清仓后详情页提示当前持仓已清仓
- 主页显示历史净值曲线
- 刷新组合后当天历史净值点可生成或更新

## 方案对比

### 方案 A：当前持仓详情 + 最小历史净值曲线

推荐方案。

做法：

- 新增当前持仓详情接口
- 新增当前持仓详情页
- 复用当前资产和交易记录计算表现
- 清仓资产不进入详情页
- 新增历史快照表和迁移脚本
- 新增组合历史净值曲线卡片

优点：

- 贴近现有代码和用户主路径
- 历史净值曲线能立刻提高产品专业度
- 能快速提升产品完整度
- 为后续组合报表和历史复盘沉淀数据口径

缺点：

- 比单纯持仓详情页多一块 schema 和迁移工作
- 第一版组合级图表仍保持克制，只做净值趋势
- 清仓资产复盘要等后续阶段

### 方案 B：组合报表优先

做法：

- 先做组合级收益、资产分布、收益排名和图表

优点：

- 视觉冲击更强
- 首页会更像专业投资工具

缺点：

- 当前缺少更完整的日报、分布和排名数据
- 容易为了图表提前引入较多数据结构
- 不如详情页贴近当前用户操作闭环

### 方案 C：交易复盘优先

做法：

- 先给交易记录增加备注、标签、交易理由和复盘结论

优点：

- 长期价值高
- 适合严肃投资记录

缺点：

- 当前用户最直接需要的持仓解释能力仍不足
- 需要更多输入表单和后续数据建模

## 设计结论

采用方案 A：当前持仓详情 + 最小历史净值曲线。

第一阶段只覆盖当前仍持有的资产。清仓资产暂不提供详情页，后续在“历史分析”和“交易复盘”阶段统一处理。历史净值曲线作为组合级表现的最小闭环纳入本阶段，但仅做每日快照和基础趋势，不扩展到完整报表系统。这样可以避免第一阶段范围膨胀，同时让当前网页版尽快具备更完整的投资闭环。

## 后续路线

完成当前持仓详情页后，建议继续按以下顺序推进：

1. 组合报表：资产分布、收益排名、币种分布、资产类型表现
2. 历史分析：清仓资产汇总、已实现收益统计、历史交易筛选
3. 交易复盘：备注、标签、策略、复盘结论
4. 提醒中心增强：提醒历史、条件组合提醒、推送中心
5. 账户与同步：导入导出、备份恢复、多设备同步准备
6. App 体验：PWA、移动端交互、通知、离线缓存
