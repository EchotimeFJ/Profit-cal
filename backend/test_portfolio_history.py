import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch


sys.path.insert(0, os.path.dirname(__file__))

_tmpdir = tempfile.TemporaryDirectory()
os.environ['DATABASE_URL'] = f"sqlite:///{os.path.join(_tmpdir.name, 'portfolio-history.db')}"
os.environ['SECRET_KEY'] = 'test-secret-for-portfolio-history'
os.environ['JWT_SECRET_KEY'] = 'test-jwt-secret-for-portfolio-history'

from app import app  # noqa: E402
from db import db  # noqa: E402
from models import Alert, Asset, PortfolioHistorySnapshot, PortfolioMinuteSnapshot, TradeRecord, User  # noqa: E402
from scripts.migrate_portfolio_minute_history import ensure_portfolio_minute_history_table  # noqa: E402
from services.portfolio_history import collect_all_user_minute_snapshots, upsert_minute_snapshot  # noqa: E402


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

    def _add_minute_snapshot(self, user, snapshot_minute, currency='CNY', total_current_value=1000):
        snapshot = PortfolioMinuteSnapshot(
            user_id=user.id,
            snapshot_minute=snapshot_minute.replace(second=0, microsecond=0),
            settlement_currency=currency,
            total_investment=900,
            total_current_value=total_current_value,
            total_profit=total_current_value - 900,
            total_profit_percent=((total_current_value - 900) / 900) * 100,
            daily_profit=total_current_value - 950,
        )
        db.session.add(snapshot)
        return snapshot

    def test_get_history_empty_without_writing(self):
        response = self.client.get('/api/portfolio/history', headers=self.headers)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data['range'], '1d')
        self.assertEqual(data['points'], [])
        with app.app_context():
            self.assertEqual(PortfolioHistorySnapshot.query.count(), 0)
            self.assertEqual(PortfolioMinuteSnapshot.query.count(), 0)

    def test_snapshot_upsert_does_not_duplicate_same_day(self):
        created = self.client.post('/api/assets', json={
            'name': '中国铝业',
            'symbol': '601600.SS',
            'asset_type': 'a_stock',
            'buy_price': 10,
            'quantity': 100,
        }, headers=self.headers)
        self.assertEqual(created.status_code, 201)

        first = self.client.post('/api/portfolio/history/snapshot', json={'currency': 'CNY'}, headers=self.headers)
        second = self.client.post('/api/portfolio/history/snapshot', json={'currency': 'CNY'}, headers=self.headers)

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        with app.app_context():
            self.assertEqual(PortfolioHistorySnapshot.query.count(), 1)

        history = self.client.get('/api/portfolio/history?currency=CNY', headers=self.headers)
        self.assertEqual(history.status_code, 200)
        self.assertEqual(history.get_json()['points'], [])

    def test_history_is_user_scoped(self):
        with app.app_context():
            alice = User.query.filter_by(username='alice').one()
            self._add_minute_snapshot(alice, datetime.utcnow() - timedelta(minutes=5), total_current_value=1100)
            db.session.commit()
        register = self.client.post('/api/auth/register', json={
            'username': 'bob',
            'email': 'bob@example.com',
            'password': 'samepass123',
        })
        self.assertEqual(register.status_code, 201)
        other_headers = {'Authorization': f"Bearer {register.get_json()['access_token']}"}

        response = self.client.get('/api/portfolio/history?currency=CNY', headers=other_headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['points'], [])

    def test_history_returns_minute_snapshots_for_range_sorted(self):
        now = datetime.utcnow()
        with app.app_context():
            alice = User.query.filter_by(username='alice').one()
            self._add_minute_snapshot(alice, now - timedelta(hours=2), total_current_value=1200)
            self._add_minute_snapshot(alice, now - timedelta(days=4), total_current_value=1400)
            self._add_minute_snapshot(alice, now - timedelta(hours=3), total_current_value=1100)
            db.session.add(PortfolioHistorySnapshot(
                user_id=alice.id,
                snapshot_date=(now - timedelta(days=1)).date(),
                settlement_currency='CNY',
                total_investment=1,
                total_current_value=9999,
            ))
            db.session.commit()

        response = self.client.get('/api/portfolio/history?range=3d&currency=CNY', headers=self.headers)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data['currency'], 'CNY')
        self.assertEqual(data['range'], '3d')
        self.assertEqual([point['total_current_value'] for point in data['points']], [1100, 1200])
        self.assertEqual(
            [point['timestamp'] for point in data['points']],
            sorted(point['timestamp'] for point in data['points']),
        )
        self.assertTrue(all(point['timestamp'] == point['date'] for point in data['points']))

    def test_history_defaults_to_preferred_currency_and_keeps_currency_param(self):
        now = datetime.utcnow()
        with app.app_context():
            alice = User.query.filter_by(username='alice').one()
            alice.preferred_currency = 'USD'
            self._add_minute_snapshot(alice, now - timedelta(minutes=10), currency='USD', total_current_value=200)
            self._add_minute_snapshot(alice, now - timedelta(minutes=9), currency='CNY', total_current_value=100)
            db.session.commit()

        default_response = self.client.get('/api/portfolio/history?range=1d', headers=self.headers)
        cny_response = self.client.get('/api/portfolio/history?range=1d&currency=CNY', headers=self.headers)

        self.assertEqual(default_response.status_code, 200)
        self.assertEqual(default_response.get_json()['currency'], 'USD')
        self.assertEqual([point['total_current_value'] for point in default_response.get_json()['points']], [200])
        self.assertEqual(cny_response.status_code, 200)
        self.assertEqual(cny_response.get_json()['currency'], 'CNY')
        self.assertEqual([point['total_current_value'] for point in cny_response.get_json()['points']], [100])

    def test_history_rejects_invalid_range_without_writing(self):
        response = self.client.get('/api/portfolio/history?range=30d', headers=self.headers)

        self.assertEqual(response.status_code, 400)
        with app.app_context():
            self.assertEqual(PortfolioHistorySnapshot.query.count(), 0)
            self.assertEqual(PortfolioMinuteSnapshot.query.count(), 0)

    def test_snapshot_rejects_invalid_json_without_writing(self):
        cases = [
            {},
            {'data': 'not-json', 'content_type': 'text/plain'},
            {'data': '{"currency":', 'content_type': 'application/json'},
            {'json': []},
        ]

        for kwargs in cases:
            with self.subTest(kwargs=kwargs):
                response = self.client.post('/api/portfolio/history/snapshot', headers=self.headers, **kwargs)

                self.assertEqual(response.status_code, 400)
                with app.app_context():
                    self.assertEqual(PortfolioHistorySnapshot.query.count(), 0)

    def test_history_returns_404_for_deleted_user(self):
        with app.app_context():
            user = User.query.filter_by(username='alice').one()
            db.session.delete(user)
            db.session.commit()

        get_response = self.client.get('/api/portfolio/history', headers=self.headers)
        post_response = self.client.post(
            '/api/portfolio/history/snapshot',
            json={'currency': 'CNY'},
            headers=self.headers,
        )

        self.assertEqual(get_response.status_code, 404)
        self.assertEqual(post_response.status_code, 404)
        with app.app_context():
            self.assertEqual(PortfolioHistorySnapshot.query.count(), 0)

    def test_minute_migration_only_creates_new_table_without_touching_existing_data(self):
        with app.app_context():
            user = User.query.filter_by(username='alice').one()
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
            PortfolioMinuteSnapshot.__table__.drop(db.engine, checkfirst=True)

            before = {
                'asset_quantity': asset.quantity,
                'trade_count': TradeRecord.query.count(),
                'alert_count': Alert.query.count(),
                'daily_history_count': PortfolioHistorySnapshot.query.count(),
            }

            ensure_portfolio_minute_history_table()
            ensure_portfolio_minute_history_table()

            self.assertEqual(db.session.get(Asset, asset.id).quantity, before['asset_quantity'])
            self.assertEqual(TradeRecord.query.count(), before['trade_count'])
            self.assertEqual(Alert.query.count(), before['alert_count'])
            self.assertEqual(PortfolioHistorySnapshot.query.count(), before['daily_history_count'])
            self.assertEqual(PortfolioMinuteSnapshot.query.count(), 0)

    def test_minute_snapshot_upsert_is_idempotent_and_updates_same_minute(self):
        collected_at = datetime(2026, 7, 12, 10, 45, 30)
        with app.app_context():
            user = User.query.filter_by(username='alice').one()
            payloads = [
                {
                    'total_investment': 1000,
                    'total_current_value': 1100,
                    'total_profit': 100,
                    'total_profit_percent': 10,
                    'daily_profit': 15,
                    'payload': {'baseline_source': 'first'},
                },
                {
                    'total_investment': 1000,
                    'total_current_value': 1200,
                    'total_profit': 200,
                    'total_profit_percent': 20,
                    'daily_profit': 30,
                    'payload': {'baseline_source': 'second'},
                },
            ]

            with patch('services.portfolio_history.build_history_snapshot_payload', side_effect=payloads):
                first = upsert_minute_snapshot(user, 'CNY', collected_at=collected_at)
                second = upsert_minute_snapshot(user, 'CNY', collected_at=collected_at)
                db.session.commit()

            self.assertEqual(first.id, second.id)
            self.assertEqual(PortfolioMinuteSnapshot.query.count(), 1)
            snapshot = PortfolioMinuteSnapshot.query.one()
            self.assertEqual(snapshot.snapshot_minute, datetime(2026, 7, 12, 10, 45))
            self.assertEqual(snapshot.total_current_value, 1200)
            self.assertIn('second', snapshot.payload)

    def test_minute_collection_records_all_users_with_preferred_currency(self):
        collected_at = datetime(2026, 7, 12, 11, 1, 59)
        with app.app_context():
            alice = User.query.filter_by(username='alice').one()
            alice.preferred_currency = 'USD'
            bob = User(username='bob', email='bob@example.com', preferred_currency='HKD')
            bob.set_password('samepass123')
            db.session.add(bob)
            db.session.commit()

            def fake_payload(user, settlement_currency, **_kwargs):
                return {
                    'total_investment': user.id * 100,
                    'total_current_value': user.id * 120,
                    'total_profit': user.id * 20,
                    'total_profit_percent': 20,
                    'daily_profit': user.id,
                    'payload': {'user_id': user.id, 'currency': settlement_currency},
                }

            with patch('services.portfolio_history.build_history_snapshot_payload', side_effect=fake_payload):
                result = collect_all_user_minute_snapshots(collected_at=collected_at)

            self.assertEqual(result['created_or_updated'], 2)
            self.assertEqual(result['failed'], 0)
            snapshots = PortfolioMinuteSnapshot.query.order_by(PortfolioMinuteSnapshot.user_id.asc()).all()
            self.assertEqual([snapshot.settlement_currency for snapshot in snapshots], ['USD', 'HKD'])
            self.assertTrue(all(snapshot.snapshot_minute == datetime(2026, 7, 12, 11, 1) for snapshot in snapshots))

    def test_minute_collection_falls_back_on_price_failure_and_continues_users(self):
        collected_at = datetime(2026, 7, 12, 12, 0)
        with app.app_context():
            alice = User.query.filter_by(username='alice').one()
            db.session.add(Asset(
                user_id=alice.id,
                name='中国铝业',
                symbol='601600.SS',
                asset_type='a_stock',
                buy_price=10,
                quantity=100,
                currency='CNY',
            ))
            bob = User(username='bob', email='bob@example.com', preferred_currency='CNY')
            bob.set_password('samepass123')
            db.session.add(bob)
            db.session.flush()
            db.session.add(Asset(
                user_id=bob.id,
                name='纳指ETF',
                symbol='QQQ',
                asset_type='us_stock',
                buy_price=100,
                quantity=2,
                currency='USD',
            ))
            db.session.commit()

            def fake_live_payload(user, _assets, _settlement_currency, _pnl_display_mode):
                if user.username == 'alice':
                    raise RuntimeError('prices unavailable')
                return {
                    'summary': {
                        'total_investment': 1400,
                        'total_current_value': 1600,
                        'total_profit': 200,
                        'total_profit_percent': 14.285714,
                        'daily_profit': 20,
                    },
                    'portfolio': [],
                }

            def fake_rate(from_currency, to_currency):
                if from_currency == to_currency:
                    return 1.0
                if (from_currency, to_currency) == ('USD', 'CNY'):
                    return 7.0
                return 1.0

            before = {
                'asset_count': Asset.query.count(),
                'trade_count': TradeRecord.query.count(),
                'alert_count': Alert.query.count(),
                'daily_history_count': PortfolioHistorySnapshot.query.count(),
            }

            with patch('services.portfolio_history._build_portfolio_payload', side_effect=fake_live_payload):
                with patch('services.portfolio_history.PriceFetcher.get_exchange_rate', side_effect=fake_rate):
                    result = collect_all_user_minute_snapshots(collected_at=collected_at)

            self.assertEqual(result['created_or_updated'], 2)
            self.assertEqual(result['failed'], 0)
            alice_snapshot = PortfolioMinuteSnapshot.query.filter_by(user_id=alice.id).one()
            bob_snapshot = PortfolioMinuteSnapshot.query.filter_by(user_id=bob.id).one()
            self.assertEqual(alice_snapshot.total_current_value, 1000)
            self.assertIn('cost_basis', alice_snapshot.payload)
            self.assertEqual(bob_snapshot.total_current_value, 1600)
            self.assertIn('live_portfolio', bob_snapshot.payload)
            self.assertEqual(Asset.query.count(), before['asset_count'])
            self.assertEqual(TradeRecord.query.count(), before['trade_count'])
            self.assertEqual(Alert.query.count(), before['alert_count'])
            self.assertEqual(PortfolioHistorySnapshot.query.count(), before['daily_history_count'])


if __name__ == '__main__':
    unittest.main()
