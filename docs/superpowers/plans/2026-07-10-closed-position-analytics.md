# 清仓复盘历史分析页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增清仓复盘历史分析页，让用户查看已清仓资产的已实现收益、胜率、持仓周期和交易时间线。

**Architecture:** 后端新增只读 `analytics` 蓝图，从现有 `TradeRecord` 聚合清仓资产，不新增 schema、不迁移、不修复旧数据。前端新增 `/analytics/closed-positions` 页面和 Dashboard 入口，页面只调用只读 GET 接口。

**Tech Stack:** Flask、Flask-JWT-Extended、SQLAlchemy、Python `unittest`、React、TypeScript、Vite、Tailwind CSS。

---

## File Map

- Create `backend/routes/analytics.py`
  - 新增 `analytics_bp`
  - 实现 `GET /api/analytics/closed-positions`
  - 包含清仓聚合 helper，helper 只读 `TradeRecord`
- Modify `backend/app.py`
  - 注册 `analytics_bp`
- Create `backend/test_closed_position_analytics.py`
  - 覆盖空状态、部分卖出、完全清仓、收益计算、用户隔离、脏数据、只读性
- Modify `.github/workflows/ci.yml`
  - 将新测试和新路由加入 CI
- Modify `frontend/src/types.ts`
  - 新增 `ClosedPositionSummary`、`ClosedPositionItem`、`ClosedPositionsData`
- Create `frontend/src/pages/ClosedPositionAnalytics.tsx`
  - 新增历史分析页
  - 展示 summary、清仓卡片、展开时间线、空状态
- Modify `frontend/src/App.tsx`
  - 注册 `/analytics/closed-positions`
- Modify `frontend/src/pages/Dashboard.tsx`
  - 添加 `历史分析` 入口，不改变现有持仓详情和历史净值逻辑
- Modify `docs/smoke-tests.md`
  - 补充清仓复盘冒烟场景

---

## Task 1: 后端清仓复盘聚合 API

**Files:**
- Create: `backend/routes/analytics.py`
- Modify: `backend/app.py`
- Test: `backend/test_closed_position_analytics.py`

- [ ] **Step 1: 写后端失败测试**

Create `backend/test_closed_position_analytics.py`:

```python
import unittest
from datetime import datetime, timedelta

from app import app
from db import db
from models import Alert, Asset, PortfolioHistorySnapshot, TradeRecord, User


def auth_headers(client, username='alice', email='alice@example.com'):
    response = client.post('/api/auth/register', json={
        'username': username,
        'email': email,
        'password': 'password123',
    })
    token = response.get_json()['access_token']
    return {'Authorization': f'Bearer {token}'}


def create_trade(user_id, asset_id, action, *, quantity, price, amount=None,
                 cost_basis=None, realized_profit=None,
                 realized_profit_percent=None, days_ago=0,
                 asset_name='测试资产', symbol='TEST', asset_type='us_stock',
                 currency='USD'):
    record = TradeRecord(
        user_id=user_id,
        asset_id=asset_id,
        action=action,
        asset_name=asset_name,
        symbol=symbol,
        asset_type=asset_type,
        price=price,
        quantity=quantity,
        amount=amount if amount is not None else price * quantity,
        currency=currency,
        cost_basis=cost_basis,
        realized_profit=realized_profit,
        realized_profit_percent=realized_profit_percent,
    )
    record.created_at = datetime.utcnow() - timedelta(days=days_ago)
    db.session.add(record)
    return record


class ClosedPositionAnalyticsTestCase(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        with app.app_context():
            db.drop_all()
            db.create_all()

    def tearDown(self):
        with app.app_context():
            db.session.remove()

    def test_empty_closed_positions(self):
        headers = auth_headers(self.client)
        response = self.client.get('/api/analytics/closed-positions', headers=headers)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data['positions'], [])
        self.assertEqual(data['summary']['closed_count'], 0)
        self.assertEqual(data['summary']['total_realized_profit'], 0)
        self.assertIsNone(data['summary']['win_rate'])

    def test_partial_sell_is_not_closed(self):
        headers = auth_headers(self.client)
        with app.app_context():
            user = User.query.filter_by(username='alice').one()
            create_trade(user.id, 101, 'buy', quantity=10, price=100, days_ago=10)
            create_trade(
                user.id,
                101,
                'sell',
                quantity=4,
                price=120,
                cost_basis=400,
                realized_profit=80,
                realized_profit_percent=20,
                days_ago=2,
            )
            db.session.commit()

        response = self.client.get('/api/analytics/closed-positions', headers=headers)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data['positions'], [])
        self.assertEqual(data['summary']['closed_count'], 0)

    def test_fully_sold_position_is_returned_with_metrics(self):
        headers = auth_headers(self.client)
        with app.app_context():
            user = User.query.filter_by(username='alice').one()
            create_trade(user.id, 101, 'buy', quantity=10, price=100, days_ago=10)
            create_trade(
                user.id,
                101,
                'sell',
                quantity=10,
                price=130,
                cost_basis=1000,
                realized_profit=300,
                realized_profit_percent=30,
                days_ago=1,
            )
            db.session.commit()

        response = self.client.get('/api/analytics/closed-positions', headers=headers)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data['summary']['closed_count'], 1)
        self.assertEqual(data['summary']['win_count'], 1)
        self.assertEqual(data['summary']['loss_count'], 0)
        self.assertEqual(data['summary']['win_rate'], 100.0)
        self.assertEqual(data['summary']['total_realized_profit'], 300)
        self.assertEqual(data['summary']['average_realized_profit_percent'], 30.0)
        self.assertEqual(len(data['positions']), 1)

        position = data['positions'][0]
        self.assertEqual(position['asset_id'], 101)
        self.assertEqual(position['buy_quantity'], 10)
        self.assertEqual(position['sell_quantity'], 10)
        self.assertEqual(position['total_cost'], 1000)
        self.assertEqual(position['total_proceeds'], 1300)
        self.assertEqual(position['realized_profit'], 300)
        self.assertEqual(position['realized_profit_percent'], 30.0)
        self.assertEqual(position['holding_days'], 9)
        self.assertEqual([record['action'] for record in position['records']], ['buy', 'sell'])

    def test_user_scope_and_descending_closed_order(self):
        alice_headers = auth_headers(self.client, 'alice', 'alice@example.com')
        bob_headers = auth_headers(self.client, 'bob', 'bob@example.com')
        with app.app_context():
            alice = User.query.filter_by(username='alice').one()
            bob = User.query.filter_by(username='bob').one()
            create_trade(alice.id, 101, 'buy', quantity=1, price=100, days_ago=30, symbol='OLD')
            create_trade(alice.id, 101, 'sell', quantity=1, price=120, cost_basis=100, realized_profit=20, days_ago=20, symbol='OLD')
            create_trade(alice.id, 102, 'buy', quantity=1, price=100, days_ago=10, symbol='NEW')
            create_trade(alice.id, 102, 'sell', quantity=1, price=90, cost_basis=100, realized_profit=-10, days_ago=1, symbol='NEW')
            create_trade(bob.id, 201, 'buy', quantity=1, price=100, days_ago=5, symbol='BOB')
            create_trade(bob.id, 201, 'sell', quantity=1, price=200, cost_basis=100, realized_profit=100, days_ago=1, symbol='BOB')
            db.session.commit()

        alice_response = self.client.get('/api/analytics/closed-positions', headers=alice_headers)
        bob_response = self.client.get('/api/analytics/closed-positions', headers=bob_headers)

        self.assertEqual(alice_response.status_code, 200)
        self.assertEqual([item['symbol'] for item in alice_response.get_json()['positions']], ['NEW', 'OLD'])
        self.assertEqual(bob_response.status_code, 200)
        self.assertEqual([item['symbol'] for item in bob_response.get_json()['positions']], ['BOB'])

    def test_dirty_records_are_skipped_and_endpoint_is_read_only(self):
        headers = auth_headers(self.client)
        with app.app_context():
            user = User.query.filter_by(username='alice').one()
            asset = Asset(
                user_id=user.id,
                name='当前资产',
                symbol='CUR',
                asset_type='us_stock',
                buy_price=10,
                quantity=1,
                currency='USD',
            )
            db.session.add(asset)
            db.session.flush()
            db.session.add(Alert(user_id=user.id, asset_id=asset.id, target_price=20, alert_type='above'))
            db.session.add(PortfolioHistorySnapshot(user_id=user.id, snapshot_date=datetime.utcnow().date()))
            create_trade(user.id, None, 'sell', quantity=1, price=100, realized_profit=50)
            create_trade(user.id, 101, 'buy', quantity=1, price=100, days_ago=2)
            create_trade(user.id, 101, 'sell', quantity=1, price=110, cost_basis=100, realized_profit=10, days_ago=1)
            db.session.commit()
            before = {
                'assets': Asset.query.count(),
                'trades': TradeRecord.query.count(),
                'alerts': Alert.query.count(),
                'history': PortfolioHistorySnapshot.query.count(),
            }

        response = self.client.get('/api/analytics/closed-positions', headers=headers)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(len(data['positions']), 1)
        with app.app_context():
            after = {
                'assets': Asset.query.count(),
                'trades': TradeRecord.query.count(),
                'alerts': Alert.query.count(),
                'history': PortfolioHistorySnapshot.query.count(),
            }
        self.assertEqual(after, before)


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: 运行失败测试**

Run:

```bash
cd backend
./venv/bin/python -m unittest test_closed_position_analytics.py
```

Expected: FAIL with `404` for `/api/analytics/closed-positions` or import/route missing.

- [ ] **Step 3: 实现后端只读聚合 API**

Create `backend/routes/analytics.py`:

```python
from collections import defaultdict

from flask import Blueprint, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from models import TradeRecord


analytics_bp = Blueprint('analytics', __name__, url_prefix='/api/analytics')


def _current_user_id():
    return int(get_jwt_identity())


def _safe_sum(values):
    return sum(value for value in values if value is not None)


def _round_or_none(value):
    if value is None:
        return None
    return round(value, 4)


def _record_to_dict(record):
    return {
        'id': record.id,
        'user_id': record.user_id,
        'asset_id': record.asset_id,
        'action': record.action,
        'asset_name': record.asset_name,
        'symbol': record.symbol,
        'asset_type': record.asset_type,
        'price': record.price,
        'quantity': record.quantity,
        'amount': record.amount,
        'currency': record.currency,
        'cost_basis': record.cost_basis,
        'realized_profit': record.realized_profit,
        'realized_profit_percent': record.realized_profit_percent,
        'created_at': record.created_at.isoformat(),
    }


def _build_closed_position(asset_id, records):
    buy_records = [record for record in records if record.action == 'buy']
    sell_records = [record for record in records if record.action == 'sell']
    if not buy_records or not sell_records:
        return None

    buy_quantity = _safe_sum(record.quantity for record in buy_records)
    sell_quantity = _safe_sum(record.quantity for record in sell_records)
    if sell_quantity < buy_quantity:
        return None

    ordered_records = sorted(records, key=lambda record: (record.created_at, record.id or 0))
    first_buy_at = min(record.created_at for record in buy_records)
    closed_at = max(record.created_at for record in sell_records)
    holding_days = max((closed_at.date() - first_buy_at.date()).days, 0)

    cost_basis_values = [record.cost_basis for record in sell_records if record.cost_basis is not None]
    total_cost = _safe_sum(cost_basis_values) if cost_basis_values else _safe_sum(record.amount for record in buy_records)
    total_proceeds = _safe_sum(record.amount for record in sell_records)

    realized_values = [record.realized_profit for record in sell_records if record.realized_profit is not None]
    realized_profit = _safe_sum(realized_values) if realized_values else total_proceeds - total_cost
    realized_profit_percent = (realized_profit / total_cost * 100) if total_cost > 0 else None

    latest_record = ordered_records[-1]
    return {
        'asset_id': asset_id,
        'asset_name': latest_record.asset_name,
        'symbol': latest_record.symbol,
        'asset_type': latest_record.asset_type,
        'currency': latest_record.currency,
        'buy_quantity': buy_quantity,
        'sell_quantity': sell_quantity,
        'total_cost': total_cost,
        'total_proceeds': total_proceeds,
        'realized_profit': realized_profit,
        'realized_profit_percent': _round_or_none(realized_profit_percent),
        'first_buy_at': first_buy_at.isoformat(),
        'closed_at': closed_at.isoformat(),
        'holding_days': holding_days,
        'records': [_record_to_dict(record) for record in ordered_records],
    }


def _build_summary(positions):
    closed_count = len(positions)
    win_count = len([item for item in positions if item['realized_profit'] > 0])
    loss_count = len([item for item in positions if item['realized_profit'] < 0])
    percent_values = [
        item['realized_profit_percent']
        for item in positions
        if item['realized_profit_percent'] is not None
    ]
    holding_days_values = [item['holding_days'] for item in positions]
    return {
        'closed_count': closed_count,
        'total_realized_profit': _safe_sum(item['realized_profit'] for item in positions),
        'win_count': win_count,
        'loss_count': loss_count,
        'win_rate': round(win_count / closed_count * 100, 4) if closed_count else None,
        'average_realized_profit_percent': round(sum(percent_values) / len(percent_values), 4) if percent_values else None,
        'average_holding_days': round(sum(holding_days_values) / len(holding_days_values), 4) if holding_days_values else None,
    }


@analytics_bp.route('/closed-positions', methods=['GET'])
@jwt_required()
def get_closed_positions():
    user_id = _current_user_id()
    records = (
        TradeRecord.query
        .filter(TradeRecord.user_id == user_id, TradeRecord.asset_id.isnot(None))
        .order_by(TradeRecord.created_at.asc(), TradeRecord.id.asc())
        .all()
    )

    records_by_asset = defaultdict(list)
    for record in records:
        records_by_asset[record.asset_id].append(record)

    positions = [
        position
        for asset_id, grouped_records in records_by_asset.items()
        for position in [_build_closed_position(asset_id, grouped_records)]
        if position is not None
    ]
    positions.sort(key=lambda item: item['closed_at'], reverse=True)

    return jsonify({
        'summary': _build_summary(positions),
        'positions': positions,
    })
```

Modify `backend/app.py`:

```python
from routes.analytics import analytics_bp

app.register_blueprint(analytics_bp)
```

Place the import next to the existing route imports and the registration next to other `register_blueprint` calls.

- [ ] **Step 4: 运行后端测试**

Run:

```bash
cd backend
./venv/bin/python -m unittest test_closed_position_analytics.py
```

Expected: `Ran 5 tests ... OK`

- [ ] **Step 5: 运行相关回归**

Run:

```bash
cd backend
./venv/bin/python -m unittest test_closed_position_analytics.py test_assets_add_position.py test_asset_detail.py test_portfolio_history.py
```

Expected: all tests pass.

- [ ] **Step 6: 提交后端 API**

```bash
git add backend/routes/analytics.py backend/app.py backend/test_closed_position_analytics.py
git commit -m "feat: add closed position analytics API"
```

---

## Task 2: 前端历史分析页

**Files:**
- Modify: `frontend/src/types.ts`
- Create: `frontend/src/pages/ClosedPositionAnalytics.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 扩展前端类型**

Modify `frontend/src/types.ts`:

```ts
export interface ClosedPositionSummary {
  closed_count: number;
  total_realized_profit: number;
  win_count: number;
  loss_count: number;
  win_rate: number | null;
  average_realized_profit_percent: number | null;
  average_holding_days: number | null;
}

export interface ClosedPositionItem {
  asset_id: number;
  asset_name: string;
  symbol: string;
  asset_type: string;
  currency: string;
  buy_quantity: number;
  sell_quantity: number;
  total_cost: number;
  total_proceeds: number;
  realized_profit: number;
  realized_profit_percent: number | null;
  first_buy_at: string;
  closed_at: string;
  holding_days: number;
  records: TradeRecord[];
}

export interface ClosedPositionsData {
  summary: ClosedPositionSummary;
  positions: ClosedPositionItem[];
}
```

- [ ] **Step 2: 创建历史分析页**

Create `frontend/src/pages/ClosedPositionAnalytics.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, History, RefreshCw, TrendingUp, Wallet } from 'lucide-react';
import { api } from '../lib/api';
import {
  formatAssetPrice,
  formatAssetQuantity,
  formatCurrency,
  formatPercent,
  getAssetTypeLabel,
} from '../lib/utils';
import { Button } from '../components/ui/Button';
import { ClosedPositionItem, ClosedPositionsData } from '../types';

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
};

const formatDays = (days: number | null | undefined) => {
  if (days === null || days === undefined) return '--';
  return `${days} 天`;
};

const profitColor = (value: number) => (
  value >= 0 ? 'var(--color-semantic-up)' : 'var(--color-semantic-down)'
);

const ClosedPositionCard: React.FC<{
  position: ClosedPositionItem;
  expanded: boolean;
  onToggle: () => void;
}> = ({ position, expanded, onToggle }) => (
  <article className="rounded-2xl border border-hairline bg-canvas p-4 sm:p-5">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-title-sm font-semibold text-ink">{position.asset_name}</h3>
          <span className="rounded-full bg-surface-soft px-2 py-0.5 text-caption text-muted">
            {getAssetTypeLabel(position.asset_type)}
          </span>
          <span className="rounded-full bg-surface-soft px-2 py-0.5 text-caption text-muted">
            {position.currency}
          </span>
        </div>
        <p className="mt-1 break-all text-body-sm text-muted">{position.symbol}</p>
        <p className="mt-2 text-body-sm text-muted">
          {formatDateTime(position.first_buy_at)} 至 {formatDateTime(position.closed_at)} · 持仓 {formatDays(position.holding_days)}
        </p>
      </div>
      <div className="text-left lg:text-right">
        <p className="font-number text-title-md font-semibold" style={{ color: profitColor(position.realized_profit) }}>
          {formatCurrency(position.realized_profit, position.currency)}
        </p>
        <p className="font-number text-body-sm" style={{ color: profitColor(position.realized_profit) }}>
          {position.realized_profit_percent !== null ? formatPercent(position.realized_profit_percent) : '--'}
        </p>
      </div>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="投入成本" value={formatCurrency(position.total_cost, position.currency)} />
      <Metric label="卖出金额" value={formatCurrency(position.total_proceeds, position.currency)} />
      <Metric label="买入数量" value={formatAssetQuantity(position.buy_quantity, position.asset_type)} />
      <Metric label="卖出数量" value={formatAssetQuantity(position.sell_quantity, position.asset_type)} />
    </div>

    <button
      type="button"
      onClick={onToggle}
      className="mt-4 inline-flex items-center gap-2 text-body-sm font-semibold text-coinbase-blue"
      aria-expanded={expanded}
    >
      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      {expanded ? '收起交易时间线' : '展开交易时间线'}
    </button>

    {expanded && (
      <div className="mt-4 space-y-3 border-t border-hairline pt-4">
        {position.records.map((record) => (
          <div key={record.id} className="rounded-xl bg-surface-soft p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <span className="rounded-full bg-canvas px-2 py-0.5 text-caption font-semibold text-ink">
                  {record.action === 'buy' ? '买入' : '卖出'}
                </span>
                <p className="mt-2 text-body-sm text-muted">{formatDateTime(record.created_at)}</p>
                <p className="mt-1 text-body-sm text-muted">
                  {formatAssetQuantity(record.quantity, record.asset_type)} · {formatAssetPrice(record.price, record.currency, record.asset_type)}
                </p>
              </div>
              <div className="text-left sm:text-right">
                <p className="font-number text-body-sm font-semibold text-ink">
                  {formatCurrency(record.amount, record.currency)}
                </p>
                {record.action === 'sell' && (
                  <p className="font-number text-body-sm" style={{ color: profitColor(record.realized_profit || 0) }}>
                    {formatCurrency(record.realized_profit || 0, record.currency)}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </article>
);

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl bg-surface-soft p-3">
    <p className="text-caption text-muted">{label}</p>
    <p className="font-number mt-1 text-body-sm font-semibold text-ink">{value}</p>
  </div>
);

export const ClosedPositionAnalytics: React.FC = () => {
  const [data, setData] = useState<ClosedPositionsData | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAnalytics = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<ClosedPositionsData>('/analytics/closed-positions');
      setData({
        summary: response.summary,
        positions: Array.isArray(response.positions) ? response.positions : [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '历史分析加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const toggleExpanded = (assetId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  const summary = data?.summary;
  const positions = data?.positions || [];

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-body-sm text-muted">投资闭环</p>
          <h1 className="text-title-lg font-semibold text-ink">历史分析</h1>
          <p className="mt-2 text-body-sm text-muted">这里只展示已经完全卖出的清仓资产，当前持仓继续在持仓详情页查看。</p>
        </div>
        <div className="flex gap-2">
          <Link to="/dashboard">
            <Button variant="secondary">返回主页</Button>
          </Link>
          <Button onClick={fetchAnalytics} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-hairline bg-surface-soft p-4 text-body-sm text-semantic-down">
          {error}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard icon={<History className="h-4 w-4" />} label="已清仓资产" value={`${summary?.closed_count ?? 0}`} />
        <SummaryCard icon={<Wallet className="h-4 w-4" />} label="总已实现收益" value={formatCurrency(summary?.total_realized_profit ?? 0, 'CNY')} hint="多币种未折算，仅作汇总参考" />
        <SummaryCard icon={<TrendingUp className="h-4 w-4" />} label="胜率" value={summary?.win_rate !== null && summary?.win_rate !== undefined ? formatPercent(summary.win_rate) : '--'} />
        <SummaryCard icon={<TrendingUp className="h-4 w-4" />} label="平均收益率" value={summary?.average_realized_profit_percent !== null && summary?.average_realized_profit_percent !== undefined ? formatPercent(summary.average_realized_profit_percent) : '--'} />
        <SummaryCard icon={<History className="h-4 w-4" />} label="平均持仓天数" value={formatDays(summary?.average_holding_days)} />
      </section>

      {loading ? (
        <div className="rounded-2xl border border-hairline bg-canvas p-8 text-center text-body-sm text-muted">加载清仓复盘中...</div>
      ) : positions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline bg-surface-soft p-8 text-center">
          <History className="mx-auto h-10 w-10 text-muted" />
          <p className="mt-3 text-body-md font-semibold text-ink">暂无清仓复盘</p>
          <p className="mt-1 text-body-sm text-muted">完成一次清仓卖出后会在这里生成复盘。</p>
        </div>
      ) : (
        <div className="space-y-4">
          {positions.map((position) => (
            <ClosedPositionCard
              key={position.asset_id}
              position={position}
              expanded={expandedIds.has(position.asset_id)}
              onToggle={() => toggleExpanded(position.asset_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const SummaryCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}> = ({ icon, label, value, hint }) => (
  <div className="rounded-2xl border border-hairline bg-canvas p-4">
    <div className="flex items-center gap-2 text-muted">
      {icon}
      <span className="text-caption">{label}</span>
    </div>
    <p className="font-number mt-2 text-title-sm font-semibold text-ink">{value}</p>
    {hint && <p className="mt-1 text-caption text-muted">{hint}</p>}
  </div>
);
```

- [ ] **Step 3: 注册路由**

Modify `frontend/src/App.tsx`:

```tsx
import { ClosedPositionAnalytics } from './pages/ClosedPositionAnalytics';
```

Add route inside protected routes:

```tsx
<Route
  path="/analytics/closed-positions"
  element={
    <ProtectedRoute>
      <ClosedPositionAnalytics />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 4: 前端构建验证**

Run:

```bash
cd frontend
npm run build
```

Expected: `tsc && vite build` succeeds.

- [ ] **Step 5: 提交前端页面**

```bash
git add frontend/src/types.ts frontend/src/pages/ClosedPositionAnalytics.tsx frontend/src/App.tsx
git commit -m "feat: add closed position analytics page"
```

---

## Task 3: Dashboard 入口与冒烟文档

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`
- Modify: `docs/smoke-tests.md`

- [ ] **Step 1: 在 Dashboard 增加历史分析入口**

Modify `frontend/src/pages/Dashboard.tsx`.

Add `BarChart3` import from `lucide-react`:

```tsx
import {
  RefreshCw,
  Plus,
  Loader2,
  Wallet,
  ArrowUpDown,
  Banknote,
  History,
  X,
  BellRing,
  ChevronDown,
  BarChart3,
} from 'lucide-react';
```

Near the portfolio history chart or the holdings/history card header, add:

```tsx
<Link to="/analytics/closed-positions" className="w-full sm:w-auto">
  <Button variant="secondary" className="w-full sm:w-auto">
    <BarChart3 className="mr-2 h-4 w-4" />
    历史分析
  </Button>
</Link>
```

Place it next to existing Dashboard action buttons so mobile users can find it without opening a desktop-only area.

- [ ] **Step 2: 更新冒烟测试清单**

Modify `docs/smoke-tests.md`.

Add under `## 投资分析`:

```markdown
- [ ] 从主页进入历史分析页
- [ ] 无清仓资产时显示清仓复盘空状态
- [ ] 完成清仓卖出后，该资产出现在历史分析页
- [ ] 展开清仓资产后显示买入/卖出时间线
- [ ] 部分卖出资产不出现在清仓复盘列表
```

- [ ] **Step 3: 验证入口和构建**

Run:

```bash
cd frontend
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: 提交入口和文档**

```bash
git add frontend/src/pages/Dashboard.tsx docs/smoke-tests.md
git commit -m "chore: add closed position analytics entry"
```

---

## Task 4: CI 与最终回归

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: 更新 CI 后端测试列表**

Modify `.github/workflows/ci.yml`.

Change backend test command to include `test_closed_position_analytics.py`:

```bash
python -m unittest test_auth_flows.py test_password_crypto.py test_password_hash_compat.py test_assets_add_position.py test_alert_reach.py test_asset_detail.py test_portfolio_history.py test_schema_migration_compat.py test_closed_position_analytics.py
```

Change compile command to include `routes/analytics.py` and `test_closed_position_analytics.py`:

```bash
python -m compileall routes/auth.py routes/assets.py routes/alerts.py routes/prices.py routes/portfolio_history.py routes/analytics.py services/portfolio_history.py scripts/migrate_portfolio_history.py test_auth_flows.py test_password_crypto.py test_password_hash_compat.py test_assets_add_position.py test_alert_reach.py test_asset_detail.py test_portfolio_history.py test_schema_migration_compat.py test_closed_position_analytics.py
```

- [ ] **Step 2: 运行完整后端回归**

Run:

```bash
cd backend
./venv/bin/python -m unittest test_auth_flows.py test_password_crypto.py test_password_hash_compat.py test_assets_add_position.py test_alert_reach.py test_asset_detail.py test_portfolio_history.py test_schema_migration_compat.py test_closed_position_analytics.py
```

Expected: all tests pass.

- [ ] **Step 3: 运行后端编译检查**

Run:

```bash
cd backend
./venv/bin/python -m compileall routes/auth.py routes/assets.py routes/alerts.py routes/prices.py routes/portfolio_history.py routes/analytics.py services/portfolio_history.py scripts/migrate_portfolio_history.py test_auth_flows.py test_password_crypto.py test_password_hash_compat.py test_assets_add_position.py test_alert_reach.py test_asset_detail.py test_portfolio_history.py test_schema_migration_compat.py test_closed_position_analytics.py
```

Expected: exit code `0`.

- [ ] **Step 4: 运行前端构建**

Run:

```bash
cd frontend
npm run build
```

Expected: `tsc && vite build` succeeds.

- [ ] **Step 5: 检查 diff 和工作区**

Run:

```bash
git diff --check
git status --short --branch
```

Expected: no whitespace errors and only expected committed branch state.

- [ ] **Step 6: 提交 CI 更新**

```bash
git add .github/workflows/ci.yml
git commit -m "chore: add closed position analytics checks"
```

---

## Self-Review Checklist

- Spec coverage:
  - 清仓复盘列表：Task 1 + Task 2。
  - Summary 指标：Task 1 API + Task 2 页面。
  - 展开交易时间线：Task 2。
  - 不新增 schema、不迁移、不写旧数据：Task 1 只读 API 和只读性测试。
  - 用户隔离：Task 1 测试。
  - Dashboard 入口：Task 3。
  - CI：Task 4。
- Placeholder scan:
  - No placeholder markers or unspecified “add tests” steps remain.
- Type consistency:
  - `ClosedPositionSummary`、`ClosedPositionItem`、`ClosedPositionsData` names match API and page usage.
  - Backend response keys match frontend type keys.
- Data safety:
  - Only `GET /api/analytics/closed-positions` is added.
  - No migration or schema change is planned.
  - Tests assert row counts unchanged.
