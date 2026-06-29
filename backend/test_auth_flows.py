import os
import sys
import tempfile
import unittest


sys.path.insert(0, os.path.dirname(__file__))

_tmpdir = tempfile.TemporaryDirectory()
os.environ['DATABASE_URL'] = f"sqlite:///{os.path.join(_tmpdir.name, 'auth-test.db')}"
os.environ['SECRET_KEY'] = 'test-secret-for-auth-flow-tests-32'
os.environ['JWT_SECRET_KEY'] = 'test-jwt-secret-for-auth-flow-tests-32'

from app import app  # noqa: E402
from db import db  # noqa: E402
from models import User  # noqa: E402


class AuthFlowTestCase(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        with app.app_context():
            db.drop_all()
            db.create_all()

    def register_user(self, username='alice', email='alice@example.com', password='oldpass123'):
        return self.client.post('/api/auth/register', json={
            'username': username,
            'email': email,
            'password': password,
        })

    def login(self, identifier, password):
        return self.client.post('/api/auth/login', json={
            'username': identifier,
            'password': password,
        })

    def test_login_accepts_bound_email_or_username(self):
        register_response = self.register_user(
            username='alice',
            email='1648481931@qq.com',
            password='samepass123',
        )
        self.assertEqual(register_response.status_code, 201)

        username_response = self.login('alice', 'samepass123')
        self.assertEqual(username_response.status_code, 200)

        email_response = self.login('1648481931@qq.com', 'samepass123')
        self.assertEqual(email_response.status_code, 200)
        self.assertEqual(email_response.get_json()['user']['username'], 'alice')

    def test_forgot_password_resets_password_by_bound_email(self):
        self.register_user(
            username='alice',
            email='1648481931@qq.com',
            password='oldpass123',
        )

        reset_response = self.client.put('/api/auth/forgot-password', json={
            'email': '1648481931@qq.com',
            'password': 'newpass123',
        })
        self.assertEqual(reset_response.status_code, 200)

        old_password_response = self.login('alice', 'oldpass123')
        self.assertEqual(old_password_response.status_code, 401)

        new_password_response = self.login('1648481931@qq.com', 'newpass123')
        self.assertEqual(new_password_response.status_code, 200)

    def test_register_normalizes_bound_email_and_rejects_duplicate_case(self):
        first_response = self.register_user(
            username='alice',
            email='  Alice@Example.COM  ',
            password='samepass123',
        )
        self.assertEqual(first_response.status_code, 201)

        with app.app_context():
            user = User.query.filter_by(username='alice').first()
            self.assertEqual(user.email, 'alice@example.com')

        duplicate_response = self.register_user(
            username='bob',
            email='alice@example.com',
            password='samepass123',
        )
        self.assertEqual(duplicate_response.status_code, 400)
        self.assertEqual(duplicate_response.get_json()['error'], '邮箱已被注册')


if __name__ == '__main__':
    unittest.main()
