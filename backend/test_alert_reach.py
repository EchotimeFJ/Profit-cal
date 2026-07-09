import os
import sys
import tempfile
import unittest
from unittest.mock import patch


sys.path.insert(0, os.path.dirname(__file__))

_tmpdir = tempfile.TemporaryDirectory()
os.environ['DATABASE_URL'] = f"sqlite:///{os.path.join(_tmpdir.name, 'alert-reach.db')}"
os.environ['SECRET_KEY'] = 'test-secret-for-alert-reach'
os.environ['JWT_SECRET_KEY'] = 'test-jwt-secret-for-alert-reach'

from app import app  # noqa: E402
from db import db  # noqa: E402
from models import Alert, Asset, CustomAlert  # noqa: E402


class ReachAlertTestCase(unittest.TestCase):
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

        token = register.get_json()['access_token']
        self.headers = {'Authorization': f'Bearer {token}'}

    def create_asset(self, **overrides):
        payload = {
            'name': '中国铝业',
            'symbol': '601600.SS',
            'asset_type': 'a_stock',
            'buy_price': 7.5,
            'quantity': 100,
        }
        payload.update(overrides)
        return self.client.post('/api/assets', json=payload, headers=self.headers)

    def create_manual_alert(self, **overrides):
        payload = {
            'name': '中国铝业',
            'symbol': '601600',
            'asset_type': 'a_stock',
            'target_price': 7.88,
            'alert_type': 'above',
            'notification_method': 'browser',
        }
        payload.update(overrides)
        return self.client.post('/api/alerts', json=payload, headers=self.headers)

    def create_asset_alert(self, asset_id, **overrides):
        payload = {
            'asset_id': asset_id,
            'target_price': 7.88,
            'alert_type': 'reach',
            'notification_method': 'browser',
        }
        payload.update(overrides)
        return self.client.post('/api/alerts', json=payload, headers=self.headers)

    def test_create_manual_reach_alert(self):
        response = self.create_manual_alert(alert_type='reach')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json()['alert']['alert_type'], 'reach')

    def test_create_alert_rejects_invalid_alert_type(self):
        response = self.create_manual_alert(alert_type='sideways')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()['error'], '提醒类型无效')

    def test_create_alert_rejects_invalid_asset_type(self):
        response = self.create_manual_alert(asset_type='bond')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()['error'], '资产类型无效')

    def test_create_alert_rejects_non_positive_or_non_finite_target_price(self):
        for invalid_target_price in [0, -1, 'NaN', 'Infinity', '-Infinity']:
            with self.subTest(target_price=invalid_target_price):
                response = self.create_manual_alert(target_price=invalid_target_price)

                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.get_json()['error'], '目标价格必须大于 0')

    def test_update_manual_alert_to_reach(self):
        created = self.create_manual_alert()
        self.assertEqual(created.status_code, 201)

        response = self.client.put(
            f"/api/alerts/{created.get_json()['alert']['id']}",
            json={'alert_type': 'reach'},
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['alert']['alert_type'], 'reach')

        with app.app_context():
            alert = CustomAlert.query.first()
            self.assertEqual(alert.alert_type, 'reach')

    def test_update_alert_rejects_invalid_alert_type(self):
        created = self.create_manual_alert()
        self.assertEqual(created.status_code, 201)

        response = self.client.put(
            f"/api/alerts/{created.get_json()['alert']['id']}",
            json={'alert_type': 'sideways'},
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()['error'], '提醒类型无效')

    def test_update_alert_rejects_invalid_asset_type(self):
        created = self.create_manual_alert()
        self.assertEqual(created.status_code, 201)

        response = self.client.put(
            f"/api/alerts/{created.get_json()['alert']['id']}",
            json={'asset_type': 'bond'},
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()['error'], '资产类型无效')

    def test_update_alert_rejects_non_positive_or_non_finite_target_price(self):
        created = self.create_manual_alert()
        self.assertEqual(created.status_code, 201)

        for invalid_target_price in [0, -1, 'NaN', 'Infinity', '-Infinity']:
            with self.subTest(target_price=invalid_target_price):
                response = self.client.put(
                    f"/api/alerts/{created.get_json()['alert']['id']}",
                    json={'target_price': invalid_target_price},
                    headers=self.headers,
                )

                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.get_json()['error'], '目标价格必须大于 0')

    def test_update_alert_ignores_client_triggered_fields(self):
        created = self.create_manual_alert(alert_type='reach')
        self.assertEqual(created.status_code, 201)

        response = self.client.put(
            f"/api/alerts/{created.get_json()['alert']['id']}",
            json={
                'triggered': True,
                'triggered_at': '2026-07-09T12:00:00',
            },
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.get_json()['alert']['triggered'])
        self.assertIsNone(response.get_json()['alert']['triggered_at'])

        with app.app_context():
            alert = CustomAlert.query.first()
            self.assertFalse(alert.triggered)
            self.assertIsNone(alert.triggered_at)

    def test_update_manual_alert_asset_type_keeps_existing_symbol(self):
        created = self.create_manual_alert(symbol='700', asset_type='commodity')
        self.assertEqual(created.status_code, 201)

        response = self.client.put(
            f"/api/alerts/{created.get_json()['alert']['id']}",
            json={'asset_type': 'hk_stock'},
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['alert']['symbol'], '700')

        with app.app_context():
            alert = CustomAlert.query.first()
            self.assertEqual(alert.symbol, '700')

    @patch('routes.prices.PriceFetcher.get_price')
    def test_reach_alert_triggers_inside_tolerance(self, mock_get_price):
        created = self.create_manual_alert(alert_type='reach')
        self.assertEqual(created.status_code, 201)

        mock_get_price.return_value = {
            'current_price': 7.8805,
            'previous_close': 7.8,
            'currency': 'CNY',
        }
        response = self.client.get('/api/prices/check-alerts', headers=self.headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.get_json()['triggered_alerts']), 1)

        with app.app_context():
            alert = CustomAlert.query.first()
            self.assertTrue(alert.triggered)

    @patch('routes.prices.PriceFetcher.get_price')
    def test_reach_alert_triggers_at_tolerance_boundary(self, mock_get_price):
        created = self.create_manual_alert(alert_type='reach')
        self.assertEqual(created.status_code, 201)

        mock_get_price.return_value = {
            'current_price': 7.881,
            'previous_close': 7.8,
            'currency': 'CNY',
        }
        response = self.client.get('/api/prices/check-alerts', headers=self.headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.get_json()['triggered_alerts']), 1)

    @patch('routes.prices.PriceFetcher.get_price')
    def test_reach_alert_does_not_trigger_outside_tolerance(self, mock_get_price):
        created = self.create_manual_alert(alert_type='reach')
        self.assertEqual(created.status_code, 201)

        mock_get_price.return_value = {
            'current_price': 7.8811,
            'previous_close': 7.8,
            'currency': 'CNY',
        }
        response = self.client.get('/api/prices/check-alerts', headers=self.headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['triggered_alerts'], [])

        with app.app_context():
            alert = CustomAlert.query.first()
            self.assertFalse(alert.triggered)

    @patch('routes.prices.PriceFetcher.get_price')
    def test_asset_reach_alert_triggers_inside_tolerance(self, mock_get_price):
        created_asset = self.create_asset()
        self.assertEqual(created_asset.status_code, 201)
        asset_id = created_asset.get_json()['asset']['id']

        created_alert = self.create_asset_alert(asset_id)
        self.assertEqual(created_alert.status_code, 201)

        mock_get_price.return_value = {
            'current_price': 7.8795,
            'previous_close': 7.8,
            'currency': 'CNY',
        }
        response = self.client.get('/api/prices/check-alerts', headers=self.headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.get_json()['triggered_alerts']), 1)
        self.assertEqual(response.get_json()['triggered_alerts'][0]['kind'], 'asset')

        with app.app_context():
            alert = Alert.query.first()
            self.assertTrue(alert.triggered)

    @patch('routes.prices.PriceFetcher.get_price')
    def test_manual_alert_does_not_trigger_on_non_finite_current_price(self, mock_get_price):
        created = self.create_manual_alert(alert_type='above')
        self.assertEqual(created.status_code, 201)

        mock_get_price.return_value = {
            'current_price': float('inf'),
            'previous_close': 7.8,
            'currency': 'CNY',
        }
        response = self.client.get('/api/prices/check-alerts', headers=self.headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['triggered_alerts'], [])

        with app.app_context():
            alert = CustomAlert.query.first()
            self.assertFalse(alert.triggered)

    @patch('routes.prices.PriceFetcher.get_price')
    def test_asset_alert_does_not_trigger_on_currency_mismatch(self, mock_get_price):
        created_asset = self.create_asset()
        self.assertEqual(created_asset.status_code, 201)
        asset_id = created_asset.get_json()['asset']['id']

        created_alert = self.create_asset_alert(asset_id)
        self.assertEqual(created_alert.status_code, 201)

        mock_get_price.return_value = {
            'current_price': 7.8795,
            'previous_close': 7.8,
            'currency': 'USD',
        }
        response = self.client.get('/api/prices/check-alerts', headers=self.headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['triggered_alerts'], [])

        with app.app_context():
            alert = Alert.query.first()
            self.assertFalse(alert.triggered)

    @patch('routes.prices.PriceFetcher.get_price')
    def test_manual_alert_does_not_trigger_on_currency_mismatch(self, mock_get_price):
        created = self.create_manual_alert(alert_type='reach')
        self.assertEqual(created.status_code, 201)

        mock_get_price.return_value = {
            'current_price': 7.8805,
            'previous_close': 7.8,
            'currency': 'USD',
        }
        response = self.client.get('/api/prices/check-alerts', headers=self.headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['triggered_alerts'], [])

        with app.app_context():
            alert = CustomAlert.query.first()
            self.assertFalse(alert.triggered)

    @patch('routes.prices.PriceFetcher.get_price')
    def test_update_target_price_rearms_triggered_alert(self, mock_get_price):
        created = self.create_manual_alert(alert_type='reach')
        self.assertEqual(created.status_code, 201)

        mock_get_price.return_value = {
            'current_price': 7.8805,
            'previous_close': 7.8,
            'currency': 'CNY',
        }
        triggered = self.client.get('/api/prices/check-alerts', headers=self.headers)
        self.assertEqual(triggered.status_code, 200)
        self.assertEqual(len(triggered.get_json()['triggered_alerts']), 1)

        response = self.client.put(
            f"/api/alerts/{created.get_json()['alert']['id']}",
            json={'target_price': 7.95},
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.get_json()['alert']['triggered'])
        self.assertIsNone(response.get_json()['alert']['triggered_at'])
        self.assertEqual(response.get_json()['alert']['target_price'], 7.95)

        with app.app_context():
            alert = CustomAlert.query.first()
            self.assertFalse(alert.triggered)
            self.assertIsNone(alert.triggered_at)

    @patch('routes.prices.PriceFetcher.get_price')
    def test_update_alert_type_rearms_triggered_alert(self, mock_get_price):
        created = self.create_manual_alert(alert_type='reach')
        self.assertEqual(created.status_code, 201)

        mock_get_price.return_value = {
            'current_price': 7.8805,
            'previous_close': 7.8,
            'currency': 'CNY',
        }
        triggered = self.client.get('/api/prices/check-alerts', headers=self.headers)
        self.assertEqual(triggered.status_code, 200)
        self.assertEqual(len(triggered.get_json()['triggered_alerts']), 1)

        response = self.client.put(
            f"/api/alerts/{created.get_json()['alert']['id']}",
            json={'alert_type': 'above'},
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['alert']['alert_type'], 'above')
        self.assertFalse(response.get_json()['alert']['triggered'])
        self.assertIsNone(response.get_json()['alert']['triggered_at'])

        with app.app_context():
            alert = CustomAlert.query.first()
            self.assertEqual(alert.alert_type, 'above')
            self.assertFalse(alert.triggered)
            self.assertIsNone(alert.triggered_at)

    @patch('routes.prices.PriceFetcher.get_price')
    def test_update_symbol_rearms_triggered_alert(self, mock_get_price):
        created = self.create_manual_alert(alert_type='reach')
        self.assertEqual(created.status_code, 201)

        mock_get_price.return_value = {
            'current_price': 7.8805,
            'previous_close': 7.8,
            'currency': 'CNY',
        }
        triggered = self.client.get('/api/prices/check-alerts', headers=self.headers)
        self.assertEqual(triggered.status_code, 200)
        self.assertEqual(len(triggered.get_json()['triggered_alerts']), 1)

        response = self.client.put(
            f"/api/alerts/{created.get_json()['alert']['id']}",
            json={'symbol': '600519'},
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.get_json()['alert']['triggered'])
        self.assertIsNone(response.get_json()['alert']['triggered_at'])

        with app.app_context():
            alert = CustomAlert.query.first()
            self.assertEqual(alert.symbol, '600519.SS')
            self.assertFalse(alert.triggered)
            self.assertIsNone(alert.triggered_at)

    @patch('routes.prices.PriceFetcher.get_price')
    def test_update_asset_type_rearms_triggered_alert(self, mock_get_price):
        created = self.create_manual_alert(alert_type='reach')
        self.assertEqual(created.status_code, 201)

        mock_get_price.return_value = {
            'current_price': 7.8805,
            'previous_close': 7.8,
            'currency': 'CNY',
        }
        triggered = self.client.get('/api/prices/check-alerts', headers=self.headers)
        self.assertEqual(triggered.status_code, 200)
        self.assertEqual(len(triggered.get_json()['triggered_alerts']), 1)

        response = self.client.put(
            f"/api/alerts/{created.get_json()['alert']['id']}",
            json={'asset_type': 'commodity'},
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['alert']['asset_type'], 'commodity')
        self.assertFalse(response.get_json()['alert']['triggered'])
        self.assertIsNone(response.get_json()['alert']['triggered_at'])

        with app.app_context():
            alert = CustomAlert.query.first()
            self.assertEqual(alert.asset_type, 'commodity')
            self.assertFalse(alert.triggered)
            self.assertIsNone(alert.triggered_at)

    @patch('routes.prices.PriceFetcher.get_exchange_rate', return_value=1.0)
    @patch('routes.prices.PriceFetcher.get_price')
    def test_portfolio_price_handles_missing_previous_close(self, mock_get_price, _mock_get_exchange_rate):
        created_asset = self.create_asset()
        self.assertEqual(created_asset.status_code, 201)

        mock_get_price.return_value = {
            'current_price': 7.9,
            'previous_close': None,
            'currency': 'CNY',
            'source': 'test',
            'quote_time': '2026-07-09T12:00:00',
        }
        response = self.client.get('/api/prices/portfolio?refresh=1', headers=self.headers)

        self.assertEqual(response.status_code, 200)
        portfolio = response.get_json()['portfolio']
        self.assertEqual(len(portfolio), 1)
        self.assertIsNone(portfolio[0]['daily_profit'])
        self.assertIsNone(portfolio[0]['daily_profit_percent'])


if __name__ == '__main__':
    unittest.main()
