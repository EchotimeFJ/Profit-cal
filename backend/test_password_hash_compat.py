import os
import sys
import unittest


sys.path.insert(0, os.path.dirname(__file__))

from models import User  # noqa: E402


class PasswordHashCompatibilityTestCase(unittest.TestCase):
    def test_set_password_uses_runtime_compatible_hash(self):
        user = User(username='alice', email='alice@example.com')

        try:
            user.set_password('samepass123')
        except AttributeError as exc:
            self.fail(f'set_password 不应依赖当前运行环境缺失的哈希能力: {exc}')

        self.assertTrue(
            user.password_hash.startswith('pbkdf2:sha256:'),
            '为兼容当前运行环境，密码哈希应使用 pbkdf2:sha256',
        )
        self.assertTrue(user.check_password('samepass123'))


if __name__ == '__main__':
    unittest.main()
