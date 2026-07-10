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
