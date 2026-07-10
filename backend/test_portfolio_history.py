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
        self.assertEqual(len(history.get_json()['points']), 1)

    def test_history_is_user_scoped(self):
        created = self.client.post('/api/portfolio/history/snapshot', json={'currency': 'CNY'}, headers=self.headers)
        self.assertEqual(created.status_code, 201)
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


if __name__ == '__main__':
    unittest.main()
