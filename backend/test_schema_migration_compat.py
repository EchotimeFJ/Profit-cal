import os
import sys
import tempfile
import unittest
from unittest.mock import patch

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
            PortfolioHistorySnapshot.__table__.drop(db.engine, checkfirst=True)

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

            with patch('services.portfolio_history._build_portfolio_payload', side_effect=RuntimeError('prices unavailable')):
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

    def test_migration_prefers_live_portfolio_payload(self):
        with app.app_context():
            user = User(username='alice', email='alice@example.com')
            user.set_password('samepass123')
            db.session.add(user)
            db.session.flush()
            db.session.add(Asset(
                user_id=user.id,
                name='中国铝业',
                symbol='601600.SS',
                asset_type='a_stock',
                buy_price=10,
                quantity=100,
                currency='CNY',
            ))
            db.session.commit()

            live_payload = {
                'summary': {
                    'total_investment': 1000,
                    'total_current_value': 1200,
                    'total_profit': 200,
                    'total_profit_percent': 20,
                    'daily_profit': 30,
                }
            }
            with patch('services.portfolio_history._build_portfolio_payload', return_value=live_payload):
                migrated = migrate_portfolio_history()

            self.assertEqual(migrated, 1)
            snapshot = PortfolioHistorySnapshot.query.filter_by(user_id=user.id, settlement_currency='CNY').one()
            self.assertEqual(snapshot.total_current_value, 1200)
            self.assertEqual(snapshot.total_profit, 200)
            self.assertIn('live_portfolio', snapshot.payload)

    def test_migration_fallback_converts_multi_currency_cost_basis(self):
        with app.app_context():
            user = User(username='alice', email='alice@example.com')
            user.set_password('samepass123')
            db.session.add(user)
            db.session.flush()
            db.session.add_all([
                Asset(
                    user_id=user.id,
                    name='现金资产',
                    symbol='CNY',
                    asset_type='commodity',
                    buy_price=100,
                    quantity=1,
                    currency='CNY',
                ),
                Asset(
                    user_id=user.id,
                    name='美元资产',
                    symbol='USD',
                    asset_type='us_stock',
                    buy_price=100,
                    quantity=1,
                    currency='USD',
                ),
            ])
            db.session.commit()

            def fake_rate(from_currency, to_currency):
                if from_currency == to_currency:
                    return 1.0
                if (from_currency, to_currency) == ('USD', 'CNY'):
                    return 7.0
                return 1.0

            with patch('services.portfolio_history._build_portfolio_payload', side_effect=RuntimeError('prices unavailable')):
                with patch('services.portfolio_history.PriceFetcher.get_exchange_rate', side_effect=fake_rate):
                    migrated = migrate_portfolio_history()

            self.assertEqual(migrated, 1)
            snapshot = PortfolioHistorySnapshot.query.filter_by(user_id=user.id, settlement_currency='CNY').one()
            self.assertEqual(snapshot.total_investment, 800)
            self.assertEqual(snapshot.total_current_value, 800)
            self.assertIn('"exchange_rate": 7.0', snapshot.payload)


if __name__ == '__main__':
    unittest.main()
