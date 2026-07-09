import os
import sys
import tempfile
import unittest


sys.path.insert(0, os.path.dirname(__file__))

_tmpdir = tempfile.TemporaryDirectory()
os.environ['DATABASE_URL'] = f"sqlite:///{os.path.join(_tmpdir.name, 'assets-add-position.db')}"
os.environ['SECRET_KEY'] = 'test-secret-for-add-position'
os.environ['JWT_SECRET_KEY'] = 'test-jwt-secret-for-add-position'

from app import app  # noqa: E402
from db import db  # noqa: E402
from models import Alert, Asset, PortfolioSnapshot, TradeRecord  # noqa: E402


class AddPositionTestCase(unittest.TestCase):
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

        self.token = register.get_json()['access_token']
        self.headers = {'Authorization': f'Bearer {self.token}'}

        created = self.client.post('/api/assets', json={
            'name': '中国铝业',
            'symbol': '601600.SS',
            'asset_type': 'a_stock',
            'buy_price': 10,
            'quantity': 100,
        }, headers=self.headers)
        self.assertEqual(created.status_code, 201)
        self.asset_id = created.get_json()['asset']['id']

    def _seed_portfolio_snapshots(self):
        with app.app_context():
            asset = db.session.get(Asset, self.asset_id)
            snapshots = [
                PortfolioSnapshot(
                    user_id=asset.user_id,
                    settlement_currency='CNY',
                    pnl_display_mode='ORIGINAL',
                    payload='{"portfolio":[]}',
                ),
                PortfolioSnapshot(
                    user_id=asset.user_id,
                    settlement_currency='USD',
                    pnl_display_mode='USD',
                    payload='{"portfolio":[]}',
                ),
            ]
            db.session.add_all(snapshots)
            db.session.commit()
            self.assertEqual(PortfolioSnapshot.query.count(), 2)

    def test_add_position_updates_quantity_and_weighted_buy_price(self):
        response = self.client.post(f'/api/assets/{self.asset_id}/add-position', json={
            'buy_price': 8,
            'quantity': 50,
        }, headers=self.headers)

        self.assertEqual(response.status_code, 200)

        with app.app_context():
            asset = db.session.get(Asset, self.asset_id)
            self.assertAlmostEqual(asset.quantity, 150)
            self.assertAlmostEqual(asset.buy_price, 9.3333333333, places=6)

    def test_add_position_records_a_buy_trade(self):
        response = self.client.post(f'/api/assets/{self.asset_id}/add-position', json={
            'buy_price': 8,
            'amount': 160,
        }, headers=self.headers)

        self.assertEqual(response.status_code, 200)

        with app.app_context():
            records = TradeRecord.query.filter_by(asset_id=self.asset_id).order_by(TradeRecord.id.asc()).all()
            self.assertEqual(len(records), 2)
            self.assertEqual(records[-1].action, 'buy')
            self.assertAlmostEqual(records[-1].price, 8)
            self.assertAlmostEqual(records[-1].quantity, 20)

    def test_add_position_rejects_missing_asset(self):
        response = self.client.post('/api/assets/999999/add-position', json={
            'buy_price': 8,
            'quantity': 10,
        }, headers=self.headers)

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json()['error'], '资产不存在')

    def test_add_position_rejects_non_finite_buy_price(self):
        for invalid_price in ['NaN', 'Infinity', '-Infinity']:
            with self.subTest(invalid_price=invalid_price):
                response = self.client.post(f'/api/assets/{self.asset_id}/add-position', json={
                    'buy_price': invalid_price,
                    'quantity': 10,
                }, headers=self.headers)

                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.get_json()['error'], '加仓价必须大于 0')

    def test_add_position_requires_quantity_or_amount(self):
        response = self.client.post(f'/api/assets/{self.asset_id}/add-position', json={
            'buy_price': 8,
        }, headers=self.headers)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()['error'], '请填写加仓数量或加仓金额')

    def test_add_position_rejects_non_object_json_payload(self):
        response = self.client.post(
            f'/api/assets/{self.asset_id}/add-position',
            data='[1]',
            content_type='application/json',
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()['error'], '请求体必须是 JSON 对象')

    def test_create_asset_rejects_non_object_json_payload(self):
        response = self.client.post(
            '/api/assets',
            data='[1]',
            content_type='application/json',
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()['error'], '请求体必须是 JSON 对象')

    def test_update_asset_rejects_non_object_json_payload(self):
        response = self.client.put(
            f'/api/assets/{self.asset_id}',
            data='[1]',
            content_type='application/json',
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()['error'], '请求体必须是 JSON 对象')

    def test_sell_asset_rejects_non_object_json_payload(self):
        response = self.client.post(
            f'/api/assets/{self.asset_id}/sell',
            data='[1]',
            content_type='application/json',
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()['error'], '请求体必须是 JSON 对象')

    def test_create_asset_invalidates_portfolio_snapshots(self):
        self._seed_portfolio_snapshots()

        response = self.client.post('/api/assets', json={
            'name': '腾讯控股',
            'symbol': '00700.HK',
            'asset_type': 'hk_stock',
            'buy_price': 400,
            'quantity': 10,
        }, headers=self.headers)

        self.assertEqual(response.status_code, 201)
        with app.app_context():
            self.assertEqual(PortfolioSnapshot.query.count(), 0)

    def test_update_asset_invalidates_portfolio_snapshots(self):
        self._seed_portfolio_snapshots()

        response = self.client.put(f'/api/assets/{self.asset_id}', json={
            'buy_price': 12,
            'quantity': 120,
        }, headers=self.headers)

        self.assertEqual(response.status_code, 200)
        with app.app_context():
            self.assertEqual(PortfolioSnapshot.query.count(), 0)

    def test_sell_asset_invalidates_portfolio_snapshots(self):
        self._seed_portfolio_snapshots()

        response = self.client.post(f'/api/assets/{self.asset_id}/sell', json={
            'sell_price': 12,
            'quantity': 20,
        }, headers=self.headers)

        self.assertEqual(response.status_code, 200)
        with app.app_context():
            self.assertEqual(PortfolioSnapshot.query.count(), 0)

    def test_add_position_invalidates_portfolio_snapshots(self):
        self._seed_portfolio_snapshots()

        response = self.client.post(f'/api/assets/{self.asset_id}/add-position', json={
            'buy_price': 8,
            'quantity': 50,
        }, headers=self.headers)

        self.assertEqual(response.status_code, 200)
        with app.app_context():
            self.assertEqual(PortfolioSnapshot.query.count(), 0)

    def test_delete_asset_invalidates_portfolio_snapshots(self):
        self._seed_portfolio_snapshots()

        response = self.client.delete(f'/api/assets/{self.asset_id}', headers=self.headers)

        self.assertEqual(response.status_code, 200)
        with app.app_context():
            self.assertEqual(PortfolioSnapshot.query.count(), 0)

    def test_delete_asset_removes_related_alerts(self):
        created = self.client.post('/api/alerts', json={
            'asset_id': self.asset_id,
            'target_price': 12,
            'alert_type': 'above',
            'notification_method': 'browser',
        }, headers=self.headers)
        self.assertEqual(created.status_code, 201)

        with app.app_context():
            self.assertEqual(Alert.query.filter_by(asset_id=self.asset_id).count(), 1)

        response = self.client.delete(f'/api/assets/{self.asset_id}', headers=self.headers)

        self.assertEqual(response.status_code, 200)
        with app.app_context():
            self.assertEqual(Alert.query.filter_by(asset_id=self.asset_id).count(), 0)

    def test_sell_asset_closing_position_removes_related_alerts(self):
        created = self.client.post('/api/alerts', json={
            'asset_id': self.asset_id,
            'target_price': 12,
            'alert_type': 'above',
            'notification_method': 'browser',
        }, headers=self.headers)
        self.assertEqual(created.status_code, 201)

        with app.app_context():
            self.assertEqual(Alert.query.filter_by(asset_id=self.asset_id).count(), 1)

        response = self.client.post(f'/api/assets/{self.asset_id}/sell', json={
            'sell_price': 12,
            'quantity': 100,
        }, headers=self.headers)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()['asset_closed'])
        with app.app_context():
            self.assertEqual(Alert.query.filter_by(asset_id=self.asset_id).count(), 0)


if __name__ == '__main__':
    unittest.main()
