# 清仓复盘历史分析页设计

## 背景

当前系统已经支持当前持仓详情、交易记录、部分卖出/清仓和历史净值快照。下一步需要补齐投资闭环里的历史复盘能力，让用户能回看已经清仓的资产表现，而不是只看到当前仍持有的资产。

首版聚焦“清仓复盘”，只分析已经完全卖出的历史资产。当前仍持有的资产继续走当前持仓详情页，不在本页混合展示。

## 目标

- 展示已清仓资产的复盘列表。
- 汇总已实现收益、胜率、平均收益率和平均持仓天数。
- 支持展开查看单个清仓资产的完整买入/卖出时间线。
- 不新增数据库 schema，不迁移旧数据，不修改旧资产、交易、提醒或历史净值数据。
- 所有后端分析 API 必须用户隔离，只能读取当前登录用户的 `TradeRecord`。

## 非目标

- 不展示当前仍持有资产的详情，当前持仓继续使用 `/assets/:id/detail`。
- 不做月度报表、币种报表、类型收益分布等完整统计中心。
- 不做手工编辑复盘笔记。
- 不导入或修复历史成交数据。
- 不改动交易记录写入逻辑，除非测试发现已有字段无法支持只读聚合。

## 数据来源

首版只使用现有 `TradeRecord`：

- `action='buy'` 表示买入记录。
- `action='sell'` 表示卖出或清仓卖出记录。
- `asset_id` 用于关联同一资产生命周期。
- `asset_name`、`symbol`、`asset_type`、`currency` 用于展示历史快照名称和分类。
- `amount` 表示成交金额。
- `cost_basis`、`realized_profit`、`realized_profit_percent` 用于卖出收益统计。
- `created_at` 用于时间线、首次买入时间、最后卖出时间和持仓周期。

清仓判断采用现有记录聚合规则：

- 按 `user_id + asset_id` 聚合同一资产生命周期。
- 只统计同时存在买入记录和卖出记录的资产。
- 若卖出总数量大于或等于买入总数量，视为清仓。
- 部分卖出但仍未卖完的资产不进入清仓复盘列表。
- `asset_id` 为空的异常历史记录不参与清仓资产聚合，但仍保留在原交易历史里。

## 后端 API

新增只读蓝图：`backend/routes/analytics.py`

新增接口：

```text
GET /api/analytics/closed-positions
```

响应结构：

```json
{
  "summary": {
    "closed_count": 2,
    "total_realized_profit": 1200.5,
    "win_count": 1,
    "loss_count": 1,
    "win_rate": 50.0,
    "average_realized_profit_percent": 8.2,
    "average_holding_days": 36.5
  },
  "positions": [
    {
      "asset_id": 12,
      "asset_name": "示例资产",
      "symbol": "AAPL",
      "asset_type": "us_stock",
      "currency": "USD",
      "buy_quantity": 10,
      "sell_quantity": 10,
      "total_cost": 1000,
      "total_proceeds": 1120,
      "realized_profit": 120,
      "realized_profit_percent": 12.0,
      "first_buy_at": "2026-01-01T00:00:00",
      "closed_at": "2026-02-10T00:00:00",
      "holding_days": 40,
      "records": []
    }
  ]
}
```

计算规则：

- `total_cost` 优先使用卖出记录的 `cost_basis` 汇总；缺失时回退到买入记录 `amount` 汇总。
- `total_proceeds` 使用卖出记录 `amount` 汇总。
- `realized_profit` 优先使用卖出记录的 `realized_profit` 汇总；缺失时使用 `total_proceeds - total_cost`。
- `realized_profit_percent = realized_profit / total_cost * 100`，`total_cost <= 0` 时返回 `null`。
- `holding_days` 使用首次买入时间到最后卖出时间的自然日差，最小为 `0`。
- 列表默认按 `closed_at` 倒序，最新清仓在前。
- 同一用户多币种清仓资产不做跨币种汇总换算；首版 `summary.total_realized_profit` 只在同一币种数据中有直接意义。若存在多币种，前端需提示“总收益未做跨币种折算”。

错误处理：

- 未登录：由 JWT 机制返回认证错误。
- 用户无清仓资产：返回 `summary` 零值和 `positions: []`。
- 异常/脏数据：跳过无法归属的记录，不写库，不修复源数据。

## 前端页面

新增页面：

```text
/analytics/closed-positions
```

新增类型：

- `ClosedPositionSummary`
- `ClosedPositionItem`
- `ClosedPositionsData`

页面结构：

- 顶部标题：`历史分析`
- 副标题：说明本页只展示已清仓资产。
- 概览卡片：
  - 已清仓资产数
  - 总已实现收益
  - 胜率
  - 平均收益率
  - 平均持仓天数
- 清仓资产列表：
  - 资产名、代码、类型、币种
  - 投入成本、卖出金额
  - 已实现收益、收益率
  - 持仓周期、清仓日期
- 展开区：
  - 展示该资产的全部买入/卖出时间线
  - 每条记录显示动作、成交时间、数量、价格、金额、卖出收益
- 空状态：
  - 文案：`暂无清仓复盘，完成一次清仓卖出后会在这里生成复盘。`

入口：

- Dashboard 历史净值曲线或交易区域附近增加 `历史分析` 入口。
- 入口不改变当前持仓详情页逻辑。

移动端：

- 概览卡片两列或单列自适应。
- 清仓资产列表使用纵向卡片，不使用宽表格。
- 展开时间线默认折叠，避免首屏过长。

## 测试策略

后端新增 `backend/test_closed_position_analytics.py`：

- 无清仓资产返回空列表和零值 summary。
- 部分卖出不进入清仓列表。
- 完全卖出进入清仓列表。
- 收益、收益率、持仓天数计算正确。
- 多用户数据隔离。
- `asset_id` 为空记录不会导致接口崩溃。
- 接口只读：调用前后 `TradeRecord`、`Asset`、`Alert`、`PortfolioHistorySnapshot` 行数不变。

前端验证：

- `npm run build` 必须通过。
- 页面空状态可见。
- 有清仓数据时列表与展开时间线渲染正常。
- 移动端卡片不横向溢出。

CI：

- 将 `test_closed_position_analytics.py` 加入后端 CI 测试列表。
- 将 `routes/analytics.py` 和新测试文件加入 compileall 列表。

## 数据安全约束

- 不新增 schema。
- 不执行迁移。
- 不删除、覆盖或修复旧记录。
- `GET /api/analytics/closed-positions` 只能读数据，不能 `commit`。
- 前端历史分析页不能触发任何写接口。

## 验收标准

- 用户能从页面入口进入历史分析页。
- 没有清仓资产时看到明确空状态。
- 完成清仓卖出后，该资产出现在清仓复盘列表。
- 部分卖出资产不出现在清仓复盘列表。
- 清仓资产收益、收益率、持仓周期与交易记录一致。
- 后端新增测试、既有后端回归、前端构建全部通过。
