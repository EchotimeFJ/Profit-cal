# 当前持仓详情页与历史净值曲线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增当前持仓详情页和组合历史净值曲线，并用非破坏式 schema 迁移为已有用户回填初始历史快照。

**Architecture:** 后端新增 `PortfolioHistorySnapshot` 持久化历史快照表、迁移脚本、资产详情接口和组合历史接口；详情计算复用现有 `Asset`、`TradeRecord`、`PriceFetcher` 和组合估值口径。前端新增资产详情页、历史净值 SVG 折线卡片和主页入口，不引入新的图表依赖。

**Tech Stack:** Flask, SQLAlchemy, Python unittest, React, TypeScript, Vite, Tailwind CSS, SVG

---

## File Map

- Modify: `backend/models.py`
- Modify: `backend/app.py`
- Modify: `backend/routes/assets.py`
- Modify: `backend/routes/prices.py`
- Create: `backend/routes/portfolio_history.py`
- Create: `backend/services/portfolio_history.py`
- Create: `backend/scripts/migrate_portfolio_history.py`
- Create: `backend/test_asset_detail.py`
- Create: `backend/test_portfolio_history.py`
- Create: `backend/test_schema_migration_compat.py`
- Modify: `.github/workflows/ci.yml`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx`
- Create: `frontend/src/pages/AssetDetail.tsx`
- Create: `frontend/src/components/PortfolioHistoryChart.tsx`
- Modify: `frontend/src/types.ts`
- Modify: `docs/smoke-tests.md`

## Task 1: 历史快照模型与迁移

**Files:**
- Modify: `backend/models.py`
- Create: `backend/services/portfolio_history.py`
- Create: `backend/scripts/migrate_portfolio_history.py`
- Test: `backend/test_schema_migration_compat.py`

- [ ] **Step 1: 写迁移兼容失败测试**

Create `backend/test_schema_migration_compat.py`:

```python
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))

_tmpdir = tempfile.TemporaryDirectory()
os.environ['DATABASE_URL'] = f"sqlite:///{os.path.join(_tmpdir.name, 'migration-compat.db')}"
os.environ['SECRET_KEY'] = 'test-secret-for-migration-compat'
os.environ['JWT_SECRET_KEY'] = 'test-jwt-secret-for-migration-compat'

from app import app  # noqa: E402
from db import db  # noqa: E402
from models import Alert, Asset, PortfolioHistorySnapshot, TradeRecord, User  # noqa: E402
from scripts.migrate_portfolio_history import migrate_portfolio_history  # noqa: E402


class PortfolioHistoryMigrationCompatTestCase(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        with app.app_context():
            db.drop_all()
            db.create_all()

    def test_migration_backfills_without_changing_existing_data(self):
        with app.app_context():
            user = User(username='alice', email='alice@example.com')
            user.set_password('samepass123')
            db.session.add(user)
            db.session.flush()
            asset = Asset(
                user_id=user.id,
                name='中国铝业',
                symbol='601600.SS',
                asset_type='a_stock',
                buy_price=10,
                quantity=100,
                currency='CNY',
            )
            db.session.add(asset)
            db.session.flush()
            trade = TradeRecord(
                user_id=user.id,
                asset_id=asset.id,
                action='buy',
                asset_name=asset.name,
                symbol=asset.symbol,
                asset_type=asset.asset_type,
                price=10,
                quantity=100,
                amount=1000,
                currency='CNY',
                cost_basis=1000,
            )
            alert = Alert(
                user_id=user.id,
                asset_id=asset.id,
                target_price=12,
                alert_type='above',
                notification_method='browser',
            )
            db.session.add_all([trade, alert])
            db.session.commit()

            before = {
                'asset_quantity': asset.quantity,
                'trade_count': TradeRecord.query.count(),
                'alert_count': Alert.query.count(),
            }

            migrated = migrate_portfolio_history()
            self.assertEqual(migrated, 1)

            after_asset = db.session.get(Asset, asset.id)
            self.assertEqual(after_asset.quantity, before['asset_quantity'])
            self.assertEqual(TradeRecord.query.count(), before['trade_count'])
            self.assertEqual(Alert.query.count(), before['alert_count'])

            snapshot = PortfolioHistorySnapshot.query.filter_by(user_id=user.id, settlement_currency='CNY').one()
            self.assertEqual(snapshot.total_investment, 1000)
            self.assertEqual(snapshot.total_current_value, 1000)
            self.assertEqual(snapshot.total_profit, 0)
            self.assertIn('baseline_source', snapshot.payload)

            migrated_again = migrate_portfolio_history()
            self.assertEqual(migrated_again, 0)
            self.assertEqual(PortfolioHistorySnapshot.query.count(), 1)


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd backend
./venv/bin/python -m unittest test_schema_migration_compat.py
```

Expected: FAIL with `ImportError` or `cannot import name 'PortfolioHistorySnapshot'`.

- [ ] **Step 3: 新增历史快照模型**

Modify `backend/models.py` after `PortfolioSnapshot`:

```python
class PortfolioHistorySnapshot(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, index=True)
    snapshot_date = db.Column(db.Date, nullable=False, index=True)
    settlement_currency = db.Column(db.String(10), nullable=False, default='CNY')
    total_investment = db.Column(db.Float, nullable=False, default=0.0)
    total_current_value = db.Column(db.Float, nullable=False, default=0.0)
    total_profit = db.Column(db.Float, nullable=False, default=0.0)
    total_profit_percent = db.Column(db.Float, nullable=False, default=0.0)
    daily_profit = db.Column(db.Float, nullable=False, default=0.0)
    payload = db.Column(db.Text, nullable=False, default='{}')
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        db.UniqueConstraint('user_id', 'snapshot_date', 'settlement_currency', name='uq_portfolio_history_user_date_currency'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'date': self.snapshot_date.isoformat(),
            'settlement_currency': self.settlement_currency,
            'total_investment': self.total_investment,
            'total_current_value': self.total_current_value,
            'total_profit': self.total_profit,
            'total_profit_percent': self.total_profit_percent,
            'daily_profit': self.daily_profit,
            'payload': self.payload,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
        }
```

Add relationship to `User`:

```python
portfolio_history_snapshots = db.relationship('PortfolioHistorySnapshot', backref='user', lazy=True, cascade='all, delete-orphan')
```

- [ ] **Step 4: 新增历史快照服务**

Create `backend/services/portfolio_history.py`:

```python
import json
from datetime import date

from db import db
from models import Asset, PortfolioHistorySnapshot, User
from routes.prices import _build_portfolio_payload, SUPPORTED_SETTLEMENT_CURRENCIES


def _baseline_payload_from_assets(user_id, settlement_currency):
    assets = Asset.query.filter_by(user_id=user_id).all()
    total_investment = sum((asset.buy_price or 0) * (asset.quantity or 0) for asset in assets)
    payload = {
        'baseline_source': 'cost_basis',
        'asset_count': len(assets),
    }
    return {
        'total_investment': total_investment,
        'total_current_value': total_investment,
        'total_profit': 0.0,
        'total_profit_percent': 0.0,
        'daily_profit': 0.0,
        'currency': settlement_currency,
        'payload': payload,
    }


def normalize_history_currency(value, user=None):
    currency = (value or getattr(user, 'preferred_currency', None) or 'CNY').upper()
    if currency not in SUPPORTED_SETTLEMENT_CURRENCIES:
        return 'CNY'
    return currency


def build_history_snapshot_payload(user, settlement_currency, *, use_live_prices=True):
    assets = Asset.query.filter_by(user_id=user.id).all()
    if use_live_prices and assets:
        try:
            portfolio_payload = _build_portfolio_payload(user, assets, settlement_currency, 'ORIGINAL')
            summary = portfolio_payload['summary']
            return {
                'total_investment': summary['total_investment'],
                'total_current_value': summary['total_current_value'],
                'total_profit': summary['total_profit'],
                'total_profit_percent': summary['total_profit_percent'],
                'daily_profit': summary['daily_profit'],
                'currency': settlement_currency,
                'payload': {
                    'baseline_source': 'live_portfolio',
                    'asset_count': len(assets),
                },
            }
        except Exception:
            db.session.rollback()
    return _baseline_payload_from_assets(user.id, settlement_currency)


def upsert_history_snapshot(user, settlement_currency='CNY', snapshot_date=None, *, use_live_prices=True):
    snapshot_date = snapshot_date or date.today()
    settlement_currency = normalize_history_currency(settlement_currency, user)
    data = build_history_snapshot_payload(user, settlement_currency, use_live_prices=use_live_prices)
    snapshot = PortfolioHistorySnapshot.query.filter_by(
        user_id=user.id,
        snapshot_date=snapshot_date,
        settlement_currency=settlement_currency,
    ).first()
    if snapshot is None:
        snapshot = PortfolioHistorySnapshot(
            user_id=user.id,
            snapshot_date=snapshot_date,
            settlement_currency=settlement_currency,
        )
        db.session.add(snapshot)

    snapshot.total_investment = data['total_investment']
    snapshot.total_current_value = data['total_current_value']
    snapshot.total_profit = data['total_profit']
    snapshot.total_profit_percent = data['total_profit_percent']
    snapshot.daily_profit = data['daily_profit']
    snapshot.payload = json.dumps(data['payload'], ensure_ascii=False)
    return snapshot


def migrate_existing_users_history():
    migrated = 0
    for user in User.query.all():
        currency = normalize_history_currency(None, user)
        exists = PortfolioHistorySnapshot.query.filter_by(
            user_id=user.id,
            settlement_currency=currency,
        ).first()
        if exists:
            continue
        upsert_history_snapshot(user, currency, use_live_prices=False)
        migrated += 1
    db.session.commit()
    return migrated
```

- [ ] **Step 5: 新增可重复执行迁移脚本**

Create `backend/scripts/migrate_portfolio_history.py`:

```python
from app import app
from db import db
from models import PortfolioHistorySnapshot
from services.portfolio_history import migrate_existing_users_history


def ensure_portfolio_history_table():
    PortfolioHistorySnapshot.__table__.create(db.engine, checkfirst=True)


def migrate_portfolio_history():
    with app.app_context():
        ensure_portfolio_history_table()
        return migrate_existing_users_history()


if __name__ == '__main__':
    count = migrate_portfolio_history()
    print(f'portfolio history snapshots backfilled: {count}')
```

- [ ] **Step 6: 运行迁移兼容测试确认通过**

Run:

```bash
cd backend
./venv/bin/python -m unittest test_schema_migration_compat.py
```

Expected: `OK`.

- [ ] **Step 7: Commit**

```bash
git add backend/models.py backend/services/portfolio_history.py backend/scripts/migrate_portfolio_history.py backend/test_schema_migration_compat.py
git commit -m "feat: add portfolio history snapshot migration"
```

## Task 2: 当前持仓详情后端接口

**Files:**
- Modify: `backend/routes/assets.py`
- Test: `backend/test_asset_detail.py`

- [ ] **Step 1: 写当前持仓详情失败测试**

Create `backend/test_asset_detail.py`:

```python
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(__file__))

_tmpdir = tempfile.TemporaryDirectory()
os.environ['DATABASE_URL'] = f"sqlite:///{os.path.join(_tmpdir.name, 'asset-detail.db')}"
os.environ['SECRET_KEY'] = 'test-secret-for-asset-detail'
os.environ['JWT_SECRET_KEY'] = 'test-jwt-secret-for-asset-detail'

from app import app  # noqa: E402
from db import db  # noqa: E402
from models import Asset, TradeRecord  # noqa: E402


class AssetDetailTestCase(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        with app.app_context():
            db.drop_all()
            db.create_all()

        register = self.client.post('/api/auth/register', json={
            'username': 'alice',
            'email': 'alice@example.com',
            'password': 'samepass123',
        })
        self.assertEqual(register.status_code, 201)
        self.headers = {'Authorization': f"Bearer {register.get_json()['access_token']}"}
        created = self.client.post('/api/assets', json={
            'name': '中国铝业',
            'symbol': '601600.SS',
            'asset_type': 'a_stock',
            'buy_price': 10,
            'quantity': 100,
        }, headers=self.headers)
        self.assertEqual(created.status_code, 201)
        self.asset_id = created.get_json()['asset']['id']

    @patch('routes.assets.PriceFetcher.get_price')
    def test_get_current_asset_detail(self, mock_get_price):
        mock_get_price.return_value = {
            'current_price': 12,
            'previous_close': 11,
            'currency': 'CNY',
            'source': 'mock',
            'quote_time': '2026-07-09T10:30:00',
        }
        sell = self.client.post(f'/api/assets/{self.asset_id}/sell', json={
            'sell_price': 13,
            'quantity': 20,
        }, headers=self.headers)
        self.assertEqual(sell.status_code, 200)

        response = self.client.get(f'/api/assets/{self.asset_id}/detail', headers=self.headers)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data['asset']['id'], self.asset_id)
        self.assertEqual(data['price']['current_price'], 12)
        self.assertAlmostEqual(data['performance']['investment'], 800)
        self.assertAlmostEqual(data['performance']['current_value'], 960)
        self.assertAlmostEqual(data['performance']['unrealized_profit'], 160)
        self.assertAlmostEqual(data['performance']['realized_profit'], 60)
        self.assertEqual([record['action'] for record in data['records']], ['sell', 'buy'])

    def test_get_asset_detail_rejects_missing_or_closed_asset(self):
        closed = self.client.post(f'/api/assets/{self.asset_id}/sell', json={
            'sell_price': 12,
            'quantity': 100,
        }, headers=self.headers)
        self.assertEqual(closed.status_code, 200)

        response = self.client.get(f'/api/assets/{self.asset_id}/detail', headers=self.headers)

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json()['error'], '资产不存在或已清仓')

    def test_get_asset_detail_rejects_other_user_asset(self):
        register = self.client.post('/api/auth/register', json={
            'username': 'bob',
            'email': 'bob@example.com',
            'password': 'samepass123',
        })
        other_headers = {'Authorization': f"Bearer {register.get_json()['access_token']}"}

        response = self.client.get(f'/api/assets/{self.asset_id}/detail', headers=other_headers)

        self.assertEqual(response.status_code, 404)

    @patch('routes.assets.PriceFetcher.get_price')
    def test_get_asset_detail_handles_price_failure(self, mock_get_price):
        mock_get_price.return_value = None

        response = self.client.get(f'/api/assets/{self.asset_id}/detail', headers=self.headers)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIsNone(data['price']['current_price'])
        self.assertIsNone(data['performance']['current_value'])
        self.assertEqual(len(data['records']), 1)

    @patch('routes.assets.PriceFetcher.get_price')
    def test_get_asset_detail_avoids_currency_mismatch_calculation(self, mock_get_price):
        mock_get_price.return_value = {
            'current_price': 12,
            'previous_close': 11,
            'currency': 'USD',
            'source': 'mock',
        }

        response = self.client.get(f'/api/assets/{self.asset_id}/detail', headers=self.headers)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data['price']['error'], '价格币种与资产币种不一致，暂不计算收益')
        self.assertIsNone(data['performance']['current_value'])


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd backend
./venv/bin/python -m unittest test_asset_detail.py
```

Expected: FAIL with 404 for `/api/assets/<id>/detail`.

- [ ] **Step 3: 实现详情接口**

Modify `backend/routes/assets.py` imports:

```python
from services.price_fetcher import PriceFetcher
```

Add helper after `_record_trade()`:

```python
def _asset_detail_performance(asset, price_data, records):
    realized_profit = sum(record.realized_profit or 0 for record in records if record.action == 'sell')
    realized_cost = sum(record.cost_basis or 0 for record in records if record.action == 'sell')
    realized_profit_percent = (realized_profit / realized_cost * 100) if realized_cost > 0 else None
    investment = asset.buy_price * asset.quantity

    if not price_data:
        return {
            'investment': investment,
            'current_value': None,
            'unrealized_profit': None,
            'unrealized_profit_percent': None,
            'daily_profit': None,
            'daily_profit_percent': None,
            'realized_profit': realized_profit,
            'realized_profit_percent': realized_profit_percent,
        }

    current_price = price_data.get('current_price')
    previous_close = price_data.get('previous_close')
    if price_data.get('currency') != asset.currency or current_price is None:
        return {
            'investment': investment,
            'current_value': None,
            'unrealized_profit': None,
            'unrealized_profit_percent': None,
            'daily_profit': None,
            'daily_profit_percent': None,
            'realized_profit': realized_profit,
            'realized_profit_percent': realized_profit_percent,
        }

    current_value = current_price * asset.quantity
    unrealized_profit = current_value - investment
    daily_profit = (current_price - previous_close) * asset.quantity if previous_close is not None else None
    daily_profit_percent = ((current_price - previous_close) / previous_close * 100) if previous_close and previous_close > 0 else None
    return {
        'investment': investment,
        'current_value': current_value,
        'unrealized_profit': unrealized_profit,
        'unrealized_profit_percent': (unrealized_profit / investment * 100) if investment > 0 else None,
        'daily_profit': daily_profit,
        'daily_profit_percent': daily_profit_percent,
        'realized_profit': realized_profit,
        'realized_profit_percent': realized_profit_percent,
    }
```

Add route before `update_asset()`:

```python
@assets_bp.route('/<int:asset_id>/detail', methods=['GET'])
@jwt_required()
def get_asset_detail(asset_id):
    user_id = _current_user_id()
    asset = Asset.query.filter_by(id=asset_id, user_id=user_id).first()

    if not asset:
        return jsonify({'error': '资产不存在或已清仓'}), 404

    records = (
        TradeRecord.query
        .filter_by(user_id=user_id, asset_id=asset.id)
        .order_by(TradeRecord.created_at.desc(), TradeRecord.id.desc())
        .all()
    )
    price_data = PriceFetcher.get_price(asset.symbol, asset.asset_type)
    price_payload = {
        'current_price': None,
        'previous_close': None,
        'currency': asset.currency,
        'source': None,
        'quote_time': None,
        'error': None,
    }
    if price_data:
        price_payload.update({
            'current_price': price_data.get('current_price'),
            'previous_close': price_data.get('previous_close'),
            'currency': price_data.get('currency'),
            'source': price_data.get('source'),
            'quote_time': price_data.get('quote_time'),
        })
        if price_data.get('currency') != asset.currency:
            price_payload['error'] = '价格币种与资产币种不一致，暂不计算收益'

    return jsonify({
        'asset': asset.to_dict(),
        'price': price_payload,
        'performance': _asset_detail_performance(asset, price_data, records),
        'records': [record.to_dict() for record in records],
    })
```

- [ ] **Step 4: 运行详情测试确认通过**

Run:

```bash
cd backend
./venv/bin/python -m unittest test_asset_detail.py
```

Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/assets.py backend/test_asset_detail.py
git commit -m "feat: add current asset detail API"
```

## Task 3: 历史净值后端 API

**Files:**
- Create: `backend/routes/portfolio_history.py`
- Modify: `backend/app.py`
- Test: `backend/test_portfolio_history.py`

- [ ] **Step 1: 写历史净值 API 失败测试**

Create `backend/test_portfolio_history.py`:

```python
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))

_tmpdir = tempfile.TemporaryDirectory()
os.environ['DATABASE_URL'] = f"sqlite:///{os.path.join(_tmpdir.name, 'portfolio-history.db')}"
os.environ['SECRET_KEY'] = 'test-secret-for-portfolio-history'
os.environ['JWT_SECRET_KEY'] = 'test-jwt-secret-for-portfolio-history'

from app import app  # noqa: E402
from db import db  # noqa: E402
from models import PortfolioHistorySnapshot  # noqa: E402


class PortfolioHistoryTestCase(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        with app.app_context():
            db.drop_all()
            db.create_all()
        register = self.client.post('/api/auth/register', json={
            'username': 'alice',
            'email': 'alice@example.com',
            'password': 'samepass123',
        })
        self.assertEqual(register.status_code, 201)
        self.headers = {'Authorization': f"Bearer {register.get_json()['access_token']}"}

    def test_get_history_empty_without_writing(self):
        response = self.client.get('/api/portfolio/history', headers=self.headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['points'], [])
        with app.app_context():
            self.assertEqual(PortfolioHistorySnapshot.query.count(), 0)

    def test_snapshot_upsert_does_not_duplicate_same_day(self):
        self.client.post('/api/assets', json={
            'name': '中国铝业',
            'symbol': '601600.SS',
            'asset_type': 'a_stock',
            'buy_price': 10,
            'quantity': 100,
        }, headers=self.headers)

        first = self.client.post('/api/portfolio/history/snapshot', json={'currency': 'CNY'}, headers=self.headers)
        second = self.client.post('/api/portfolio/history/snapshot', json={'currency': 'CNY'}, headers=self.headers)

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        with app.app_context():
            self.assertEqual(PortfolioHistorySnapshot.query.count(), 1)

        history = self.client.get('/api/portfolio/history?currency=CNY', headers=self.headers)
        self.assertEqual(history.status_code, 200)
        self.assertEqual(len(history.get_json()['points']), 1)

    def test_history_is_user_scoped(self):
        self.client.post('/api/portfolio/history/snapshot', json={'currency': 'CNY'}, headers=self.headers)
        register = self.client.post('/api/auth/register', json={
            'username': 'bob',
            'email': 'bob@example.com',
            'password': 'samepass123',
        })
        other_headers = {'Authorization': f"Bearer {register.get_json()['access_token']}"}

        response = self.client.get('/api/portfolio/history?currency=CNY', headers=other_headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['points'], [])


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd backend
./venv/bin/python -m unittest test_portfolio_history.py
```

Expected: FAIL with 404 for `/api/portfolio/history`.

- [ ] **Step 3: 实现历史净值路由**

Create `backend/routes/portfolio_history.py`:

```python
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from db import db
from models import PortfolioHistorySnapshot, User
from services.portfolio_history import normalize_history_currency, upsert_history_snapshot

portfolio_history_bp = Blueprint('portfolio_history', __name__, url_prefix='/api/portfolio')


def _current_user_id():
    return int(get_jwt_identity())


@portfolio_history_bp.route('/history', methods=['GET'])
@jwt_required()
def get_portfolio_history():
    user_id = _current_user_id()
    user = User.query.get(user_id)
    currency = normalize_history_currency(request.args.get('currency'), user)
    snapshots = (
        PortfolioHistorySnapshot.query
        .filter_by(user_id=user_id, settlement_currency=currency)
        .order_by(PortfolioHistorySnapshot.snapshot_date.asc(), PortfolioHistorySnapshot.id.asc())
        .all()
    )
    return jsonify({
        'currency': currency,
        'points': [
            {
                'date': snapshot.snapshot_date.isoformat(),
                'total_investment': snapshot.total_investment,
                'total_current_value': snapshot.total_current_value,
                'total_profit': snapshot.total_profit,
                'total_profit_percent': snapshot.total_profit_percent,
                'daily_profit': snapshot.daily_profit,
            }
            for snapshot in snapshots
        ],
    })


@portfolio_history_bp.route('/history/snapshot', methods=['POST'])
@jwt_required()
def create_portfolio_history_snapshot():
    user_id = _current_user_id()
    user = User.query.get(user_id)
    data = request.get_json(silent=True)
    if data is not None and not isinstance(data, dict):
        return jsonify({'error': '请求体必须是 JSON 对象'}), 400

    currency = normalize_history_currency((data or {}).get('currency'), user)
    existing = PortfolioHistorySnapshot.query.filter_by(
        user_id=user_id,
        snapshot_date=__import__('datetime').date.today(),
        settlement_currency=currency,
    ).first()
    snapshot = upsert_history_snapshot(user, currency)
    db.session.commit()
    return jsonify({'snapshot': snapshot.to_dict()}), 200 if existing else 201
```

- [ ] **Step 4: 注册路由**

Modify `backend/app.py`:

```python
from routes.portfolio_history import portfolio_history_bp
```

Register after `prices_bp`:

```python
app.register_blueprint(portfolio_history_bp)
```

- [ ] **Step 5: 运行历史净值测试确认通过**

Run:

```bash
cd backend
./venv/bin/python -m unittest test_portfolio_history.py
```

Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add backend/app.py backend/routes/portfolio_history.py backend/test_portfolio_history.py
git commit -m "feat: add portfolio history API"
```

## Task 4: 前端类型、路由与当前持仓详情页

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/pages/AssetDetail.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: 扩展前端类型**

Modify `frontend/src/types.ts`:

```ts
export interface AssetDetailPerformance {
  investment: number;
  current_value: number | null;
  unrealized_profit: number | null;
  unrealized_profit_percent: number | null;
  daily_profit: number | null;
  daily_profit_percent: number | null;
  realized_profit: number;
  realized_profit_percent: number | null;
}

export interface AssetDetailPrice {
  current_price: number | null;
  previous_close: number | null;
  currency: string;
  source: string | null;
  quote_time: string | null;
  error: string | null;
}

export interface AssetDetailData {
  asset: Asset;
  price: AssetDetailPrice;
  performance: AssetDetailPerformance;
  records: TradeRecord[];
}

export interface PortfolioHistoryPoint {
  date: string;
  total_investment: number;
  total_current_value: number;
  total_profit: number;
  total_profit_percent: number;
  daily_profit: number;
}

export interface PortfolioHistoryData {
  currency: string;
  points: PortfolioHistoryPoint[];
}
```

- [ ] **Step 2: 新增详情页**

Create `frontend/src/pages/AssetDetail.tsx`:

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bell, Banknote, Plus, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { formatAssetPrice, formatAssetQuantity, formatCurrency, formatPercent, getAssetTypeLabel } from '../lib/utils';
import { AssetDetailData } from '../types';
import { Button } from '../components/ui/Button';

const valueColor = (value: number | null | undefined) => {
  if (value === null || value === undefined) return 'var(--color-muted)';
  return value >= 0 ? 'var(--color-semantic-up)' : 'var(--color-semantic-down)';
};

export const AssetDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<AssetDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.get<AssetDetailData>(`/assets/${id}/detail`);
      setData(response);
    } catch (err: any) {
      setError(err.message || '加载持仓详情失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (loading) {
    return <div className="p-4 sm:p-6 text-muted">正在加载持仓详情...</div>;
  }

  if (error || !data) {
    return (
      <div className="p-4 sm:p-6">
        <div className="card-light p-6">
          <p className="text-title-sm font-semibold text-ink">{error || '当前持仓不存在或已清仓'}</p>
          <Button variant="secondary" className="mt-4" onClick={() => navigate('/dashboard')}>返回主页</Button>
        </div>
      </div>
    );
  }

  const { asset, price, performance, records } = data;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-muted no-underline hover:text-ink">
          <ArrowLeft className="h-4 w-4" />
          返回总览
        </Link>
        <Button variant="secondary" onClick={fetchDetail}>
          <RefreshCw className="mr-2 h-4 w-4" />
          刷新详情
        </Button>
      </div>

      <section className="card-light p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-body-sm text-muted">{getAssetTypeLabel(asset.asset_type)} · {asset.currency}</p>
            <h1 className="mt-1 text-title-lg font-semibold text-ink">{asset.name}</h1>
            <p className="text-body-md text-muted">{asset.symbol}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Button variant="secondary"><Plus className="mr-2 h-4 w-4" />加仓</Button>
            <Button variant="outline"><Banknote className="mr-2 h-4 w-4" />卖出</Button>
            <Link to="/alerts" className="no-underline">
              <Button variant="outline" className="w-full"><Bell className="mr-2 h-4 w-4" />提醒</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card-light p-5">
          <p className="text-body-sm text-muted">当前价格</p>
          <p className="mt-2 font-number text-title-lg font-semibold text-ink">
            {price.current_price !== null ? formatAssetPrice(price.current_price, asset.currency, asset.asset_type) : '--'}
          </p>
          <p className="mt-1 text-body-sm text-muted">{price.source || '暂无来源'} {price.quote_time || ''}</p>
          {price.error && <p className="mt-2 text-body-sm text-semantic-down">{price.error}</p>}
        </div>
        <div className="card-light p-5">
          <p className="text-body-sm text-muted">当前持仓</p>
          <p className="mt-2 text-title-md font-semibold text-ink">{formatAssetQuantity(asset.quantity, asset.asset_type)}</p>
          <p className="mt-1 text-body-sm text-muted">平均成本 {formatAssetPrice(asset.buy_price, asset.currency, asset.asset_type)}</p>
        </div>
        <div className="card-light p-5">
          <p className="text-body-sm text-muted">未实现收益</p>
          <p className="mt-2 font-number text-title-md font-semibold" style={{ color: valueColor(performance.unrealized_profit) }}>
            {performance.unrealized_profit !== null ? formatCurrency(performance.unrealized_profit, asset.currency) : '--'}
          </p>
          <p className="mt-1 font-number text-body-sm" style={{ color: valueColor(performance.unrealized_profit_percent) }}>
            {performance.unrealized_profit_percent !== null ? formatPercent(performance.unrealized_profit_percent) : '--'}
          </p>
        </div>
      </section>

      <section className="card-light p-5 sm:p-6">
        <h2 className="text-title-sm font-semibold text-ink">交易时间线</h2>
        <div className="mt-4 space-y-3">
          {records.map((record) => (
            <div key={record.id} className="flex flex-col gap-2 rounded-2xl border border-hairline p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-body-md font-semibold text-ink">{record.action === 'buy' ? '买入/加仓' : '卖出'}</p>
                <p className="text-body-sm text-muted">{new Date(record.created_at).toLocaleString('zh-CN', { hour12: false })}</p>
              </div>
              <div className="text-left sm:text-right">
                <p className="font-number text-body-md text-ink">{formatAssetQuantity(record.quantity, record.asset_type)} · {formatAssetPrice(record.price, record.currency, record.asset_type)}</p>
                {record.realized_profit !== null && <p className="font-number text-body-sm" style={{ color: valueColor(record.realized_profit) }}>{formatCurrency(record.realized_profit, record.currency)}</p>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
```

- [ ] **Step 3: 注册前端路由**

Modify `frontend/src/App.tsx`:

```tsx
import { AssetDetail } from './pages/AssetDetail';
```

Add route before `/assets`:

```tsx
<Route
  path="/assets/:id/detail"
  element={
    <ProtectedRoute>
      <AssetDetail />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 4: 主页持仓卡片增加详情入口**

Modify `frontend/src/pages/Dashboard.tsx` `PositionCard` props:

```tsx
onViewDetail: () => void;
```

Use in card action area:

```tsx
<Button variant="ghost" onClick={onViewDetail} className="min-w-0 flex-1 px-3">
  详情
</Button>
```

Update usage:

```tsx
onViewDetail={() => navigate(`/assets/${asset.id}/detail`)}
```

If `Dashboard.tsx` does not already import `useNavigate`, add:

```tsx
import { Link, useNavigate } from 'react-router-dom';
```

and inside `Dashboard`:

```tsx
const navigate = useNavigate();
```

- [ ] **Step 5: 前端构建验证**

Run:

```bash
cd frontend
npm run build
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types.ts frontend/src/App.tsx frontend/src/pages/AssetDetail.tsx frontend/src/pages/Dashboard.tsx
git commit -m "feat: add current position detail page"
```

## Task 5: 历史净值曲线前端

**Files:**
- Create: `frontend/src/components/PortfolioHistoryChart.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: 新增 SVG 折线组件**

Create `frontend/src/components/PortfolioHistoryChart.tsx`:

```tsx
import React from 'react';
import { formatCurrency, formatPercent } from '../lib/utils';
import { PortfolioHistoryPoint } from '../types';

interface Props {
  currency: string;
  points: PortfolioHistoryPoint[];
}

const buildPath = (values: number[], width: number, height: number) => {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
};

export const PortfolioHistoryChart: React.FC<Props> = ({ currency, points }) => {
  const latest = points[points.length - 1];
  const width = 640;
  const height = 180;
  const valuePath = buildPath(points.map((point) => point.total_current_value), width, height);
  const profitPath = buildPath(points.map((point) => point.total_profit), width, height);

  return (
    <section className="card-light p-5 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-body-sm text-muted">组合历史净值</p>
          <h2 className="text-title-sm font-semibold text-ink">总市值与累计收益趋势</h2>
        </div>
        {latest && (
          <div className="text-left sm:text-right">
            <p className="font-number text-title-sm font-semibold text-ink">{formatCurrency(latest.total_current_value, currency)}</p>
            <p className="font-number text-body-sm" style={{ color: latest.total_profit >= 0 ? 'var(--color-semantic-up)' : 'var(--color-semantic-down)' }}>
              {formatCurrency(latest.total_profit, currency)} · {formatPercent(latest.total_profit_percent)}
            </p>
          </div>
        )}
      </div>
      {points.length < 2 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-hairline bg-surface-soft p-6 text-center text-body-sm text-muted">
          暂无足够历史数据，今天开始记录
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-48 min-w-[520px] w-full">
            <path d={valuePath} fill="none" stroke="var(--color-coinbase-blue)" strokeWidth="4" strokeLinecap="round" />
            <path d={profitPath} fill="none" stroke="var(--color-semantic-up)" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
          </svg>
          <div className="mt-2 flex items-center gap-4 text-caption text-muted">
            <span>蓝线：总市值</span>
            <span>绿线：累计收益</span>
          </div>
        </div>
      )}
    </section>
  );
};
```

- [ ] **Step 2: Dashboard 拉取历史净值**

Modify `frontend/src/pages/Dashboard.tsx` imports:

```tsx
import { PortfolioHistoryChart } from '../components/PortfolioHistoryChart';
import { PortfolioHistoryData } from '../types';
```

Add state:

```tsx
const [portfolioHistory, setPortfolioHistory] = useState<PortfolioHistoryData | null>(null);
```

Add fetch callback:

```tsx
const fetchPortfolioHistory = useCallback(async () => {
  const data = await api.get<PortfolioHistoryData>(`/portfolio/history?currency=${settlementCurrency}`);
  setPortfolioHistory(data);
}, [settlementCurrency]);
```

Call in existing initial load effect after `fetchPortfolio()`:

```tsx
fetchPortfolioHistory();
```

- [ ] **Step 3: 刷新组合时生成当天快照**

In manual refresh handler, after portfolio refresh succeeds:

```tsx
await api.post('/portfolio/history/snapshot', { currency: settlementCurrency });
await fetchPortfolioHistory();
```

If current refresh code is inline, keep existing behavior and add these two calls only to the user-triggered refresh path.

- [ ] **Step 4: 渲染历史净值卡片**

Place below summary cards and before positions/history card:

```tsx
{portfolioHistory && (
  <PortfolioHistoryChart
    currency={portfolioHistory.currency}
    points={portfolioHistory.points}
  />
)}
```

- [ ] **Step 5: 前端构建验证**

Run:

```bash
cd frontend
npm run build
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/PortfolioHistoryChart.tsx frontend/src/pages/Dashboard.tsx
git commit -m "feat: add portfolio history chart"
```

## Task 6: 回归、CI、冒烟文档与推送

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/smoke-tests.md`

- [ ] **Step 1: 更新 CI 后端测试列表**

Modify `.github/workflows/ci.yml` backend test command:

```bash
python -m unittest test_auth_flows.py test_password_crypto.py test_password_hash_compat.py test_assets_add_position.py test_alert_reach.py test_asset_detail.py test_portfolio_history.py test_schema_migration_compat.py
```

Modify compile command:

```bash
python -m compileall routes/auth.py routes/assets.py routes/alerts.py routes/prices.py routes/portfolio_history.py services/portfolio_history.py scripts/migrate_portfolio_history.py test_auth_flows.py test_password_crypto.py test_password_hash_compat.py test_assets_add_position.py test_alert_reach.py test_asset_detail.py test_portfolio_history.py test_schema_migration_compat.py
```

- [ ] **Step 2: 更新冒烟测试清单**

Modify `docs/smoke-tests.md` under `资产链路`:

```md
- [ ] 从主页进入当前持仓详情页
- [ ] 当前持仓详情页显示价格、成本、盈亏和交易时间线
- [ ] 详情页加仓后数据刷新
- [ ] 详情页部分卖出后数据刷新
- [ ] 清仓后详情页提示当前持仓已清仓
```

Add new section:

```md
## 投资分析

- [ ] 主页显示组合历史净值曲线
- [ ] 新用户无历史快照时显示空状态
- [ ] 刷新组合后当天历史净值点可生成或更新
```

- [ ] **Step 3: 运行完整后端回归**

Run:

```bash
cd backend
./venv/bin/python -m unittest test_auth_flows.py test_password_crypto.py test_password_hash_compat.py test_assets_add_position.py test_alert_reach.py test_asset_detail.py test_portfolio_history.py test_schema_migration_compat.py
```

Expected: `OK`.

- [ ] **Step 4: 运行编译检查**

Run:

```bash
cd backend
./venv/bin/python -m compileall routes/auth.py routes/assets.py routes/alerts.py routes/prices.py routes/portfolio_history.py services/portfolio_history.py scripts/migrate_portfolio_history.py test_auth_flows.py test_password_crypto.py test_password_hash_compat.py test_assets_add_position.py test_alert_reach.py test_asset_detail.py test_portfolio_history.py test_schema_migration_compat.py
```

Expected: exit code `0`.

- [ ] **Step 5: 运行前端构建**

Run:

```bash
cd frontend
npm run build
```

Expected: build succeeds.

- [ ] **Step 6: 运行 diff 检查**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only planned files modified.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/ci.yml docs/smoke-tests.md
git commit -m "chore: extend validation for position detail and history"
```

- [ ] **Step 8: Push main**

Run:

```bash
git status --short
git push origin main
```

Expected: push succeeds.

## Spec Coverage Check

- 当前持仓详情页：Task 2 and Task 4
- 仅当前持仓，不展示清仓资产详情：Task 2 tests 404 after closing position
- 历史净值曲线：Task 1, Task 3, Task 5
- 非破坏式 schema 迁移：Task 1 migration test and script
- 迁移回填初始历史快照：Task 1 `migrate_existing_users_history`
- `GET /api/portfolio/history` 无写入副作用：Task 3 test
- 重复生成当天快照不重复插入：Task 3 test
- 不新增图表依赖：Task 5 uses SVG
- 回归测试与 CI：Task 6

## Placeholder Scan

- No marker words or vague implementation steps remain.
- Every task includes exact files, concrete commands, expected results, and commit command.
- Database migration is explicit and non-destructive.

## Type Consistency Check

- Backend model is consistently named `PortfolioHistorySnapshot`.
- Backend routes are consistently `/api/portfolio/history` and `/api/portfolio/history/snapshot`.
- Frontend types are consistently `PortfolioHistoryPoint`, `PortfolioHistoryData`, and `AssetDetailData`.
- Asset detail route is consistently `/api/assets/<asset_id>/detail` on backend and `/assets/:id/detail` on frontend.
