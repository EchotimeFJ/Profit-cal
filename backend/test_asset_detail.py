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
from models import PortfolioHistorySnapshot, TradeRecord  # noqa: E402


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
    def test_get_asset_detail_handles_price_exception_without_writing(self, mock_get_price):
        mock_get_price.side_effect = RuntimeError('price timeout')

        with app.app_context():
            before_trade_count = TradeRecord.query.count()
            before_history_count = PortfolioHistorySnapshot.query.count()

        with patch('routes.assets.db.session.commit', side_effect=AssertionError('detail must be read-only')):
            response = self.client.get(f'/api/assets/{self.asset_id}/detail', headers=self.headers)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data['price']['error'], '价格获取失败，暂不计算收益')
        self.assertIsNone(data['price']['current_price'])
        self.assertIsNone(data['performance']['current_value'])
        with app.app_context():
            self.assertEqual(TradeRecord.query.count(), before_trade_count)
            self.assertEqual(PortfolioHistorySnapshot.query.count(), before_history_count)

    @patch('routes.assets.PriceFetcher.get_price')
    def test_get_asset_detail_rejects_non_finite_prices_without_writing(self, mock_get_price):
        mock_get_price.return_value = {
            'current_price': float('nan'),
            'previous_close': float('inf'),
            'currency': 'CNY',
            'source': 'mock',
            'quote_time': '2026-07-09T10:30:00',
        }

        with app.app_context():
            before_trade_count = TradeRecord.query.count()
            before_history_count = PortfolioHistorySnapshot.query.count()

        with patch('routes.assets.db.session.commit', side_effect=AssertionError('detail must be read-only')):
            response = self.client.get(f'/api/assets/{self.asset_id}/detail', headers=self.headers)

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data['price']['error'], '价格数据异常，暂不计算收益')
        self.assertIsNone(data['price']['current_price'])
        self.assertIsNone(data['price']['previous_close'])
        self.assertIsNone(data['performance']['current_value'])
        with app.app_context():
            self.assertEqual(TradeRecord.query.count(), before_trade_count)
            self.assertEqual(PortfolioHistorySnapshot.query.count(), before_history_count)

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
