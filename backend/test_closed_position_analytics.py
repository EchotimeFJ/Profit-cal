import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta


sys.path.insert(0, os.path.dirname(__file__))

_tmpdir = tempfile.TemporaryDirectory()
os.environ['DATABASE_URL'] = f"sqlite:///{os.path.join(_tmpdir.name, 'closed-position-analytics.db')}"
os.environ['SECRET_KEY'] = 'test-secret-for-closed-position-analytics'
os.environ['JWT_SECRET_KEY'] = 'test-jwt-secret-for-closed-position-analytics'

from app import app  # noqa: E402
from db import db  # noqa: E402
from models import Alert, Asset, PortfolioHistorySnapshot, TradeRecord, User  # noqa: E402


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

    def test_reused_asset_id_is_split_into_lifecycles(self):
        headers = auth_headers(self.client)
        with app.app_context():
            user = User.query.filter_by(username='alice').one()
            create_trade(user.id, 101, 'buy', quantity=1, price=100, days_ago=30, symbol='FIRST')
            create_trade(
                user.id,
                101,
                'sell',
                quantity=1,
                price=120,
                cost_basis=100,
                realized_profit=20,
                days_ago=20,
                symbol='FIRST',
            )
            create_trade(user.id, 101, 'buy', quantity=2, price=50, days_ago=10, symbol='SECOND')
            create_trade(
                user.id,
                101,
                'sell',
                quantity=2,
                price=80,
                cost_basis=100,
                realized_profit=60,
                days_ago=1,
                symbol='SECOND',
            )
            db.session.commit()

        response = self.client.get('/api/analytics/closed-positions', headers=headers)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data['summary']['closed_count'], 2)
        self.assertEqual(data['summary']['total_realized_profit'], 80)
        self.assertEqual([item['symbol'] for item in data['positions']], ['SECOND', 'FIRST'])
        self.assertEqual([item['buy_quantity'] for item in data['positions']], [2, 1])
        self.assertEqual([len(item['records']) for item in data['positions']], [2, 2])

    def test_mixed_missing_sell_metrics_fall_back_to_lifecycle_totals(self):
        headers = auth_headers(self.client)
        with app.app_context():
            user = User.query.filter_by(username='alice').one()
            create_trade(user.id, 101, 'buy', quantity=6, price=100, days_ago=10)
            create_trade(user.id, 101, 'buy', quantity=4, price=100, days_ago=9)
            create_trade(
                user.id,
                101,
                'sell',
                quantity=4,
                price=125,
                cost_basis=400,
                realized_profit=100,
                days_ago=2,
            )
            create_trade(
                user.id,
                101,
                'sell',
                quantity=6,
                price=100,
                amount=700,
                days_ago=1,
            )
            db.session.commit()

        response = self.client.get('/api/analytics/closed-positions', headers=headers)

        self.assertEqual(response.status_code, 200)
        position = response.get_json()['positions'][0]
        self.assertEqual(position['buy_quantity'], 10)
        self.assertEqual(position['sell_quantity'], 10)
        self.assertEqual(position['total_cost'], 1000)
        self.assertEqual(position['total_proceeds'], 1200)
        self.assertEqual(position['realized_profit'], 200)
        self.assertEqual(position['realized_profit_percent'], 20.0)

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
